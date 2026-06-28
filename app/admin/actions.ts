'use server'

import { writeClient } from '@/sanity/lib/client';
import { revalidatePath } from 'next/cache';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

export async function saveDailyRates(formData: FormData) {
  const session = await getServerSession(authOptions);
  if (!session) return { success: false, error: "Unauthorized access." };

  try {
    const gold18k = parseFloat(formData.get('goldRate18k') as string);
    const gold22k = parseFloat(formData.get('goldRate22k') as string);
    const gold24k = parseFloat(formData.get('goldRate24k') as string);
    const silver = parseFloat(formData.get('silverRate') as string);

    if (isNaN(gold18k) || isNaN(gold22k) || isNaN(gold24k) || isNaN(silver)) {
      throw new Error("Invalid rate values.");
    }

    const today = new Date().toISOString().split('T')[0];

    // Create a new daily price document
    await writeClient.create({
      _type: 'dailyPrice',
      date: today,
      goldRate18k: gold18k,
      goldRate22k: gold22k,
      goldRate24k: gold24k,
      silverRate: silver,
    });

    revalidatePath('/admin');
    return { success: true };
  } catch (error: any) {
    console.error("Error saving rates:", error);
    return { success: false, error: error.message };
  }
}

export async function syncInstagramPosts() {
  const session = await getServerSession(authOptions);
  if (!session) return { success: false, error: "Unauthorized access." };

  try {
    const TOKEN = process.env.INSTAGRAM_PAGE_ACCESS_TOKEN;
    if (!TOKEN) throw new Error("Missing Instagram Token");

    const baseUrl = TOKEN.startsWith("IGAA") ? "https://graph.instagram.com" : "https://graph.facebook.com";
    
    // For Facebook Page Token (connected IG account)
    let fetchUrl = "";
    if (TOKEN.startsWith("IGAA")) {
      fetchUrl = `${baseUrl}/me/media?fields=id,caption,media_type,media_url,permalink,thumbnail_url,timestamp&access_token=${TOKEN}`;
    } else {
      const IG_ID = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID;
      fetchUrl = `${baseUrl}/v20.0/${IG_ID}/media?fields=id,caption,media_type,media_url,permalink,thumbnail_url,timestamp&access_token=${TOKEN}`;
    }

    const res = await fetch(fetchUrl);
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error?.message || "Failed to fetch IG posts");
    }

    const data = await res.json();
    const igPosts = data.data || [];

    // --- NEW: Fetch Facebook Posts to detect cross-posting ---
    let fbPosts: any[] = [];
    try {
      const fbToken = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
      const fbPageId = process.env.FACEBOOK_PAGE_ID;
      if (fbToken && fbPageId) {
        const fbUrl = `https://graph.facebook.com/v20.0/${fbPageId}/posts?fields=id,message,created_time,full_picture&access_token=${fbToken}&limit=50`;
        const fbRes = await fetch(fbUrl);
        if (fbRes.ok) {
          const fbData = await fbRes.json();
          fbPosts = fbData.data || [];
        }
      }
    } catch (e) {
      console.error("Error fetching FB posts for cross-post matching:", e);
    }
    // ---------------------------------

    // Fetch existing reels
    const existingReels = await writeClient.fetch(`*[_type == "productReel"]{_id, reelId, fbPostId, postedOn, description}`);
    const existingIgIds = new Map(existingReels.filter((r: any) => r.reelId).map((r: any) => [r.reelId, r]));
    const existingFbIds = new Map(existingReels.filter((r: any) => r.fbPostId).map((r: any) => [r.fbPostId, r]));

    let addedCount = 0;
    
    // Process Instagram Posts
    for (const post of igPosts) {
      if (!existingIgIds.has(post.id)) {
        // Find matching FB post based on caption
        let matchedFbPostId = undefined;
        let postedOn = 'instagram';
        
        if (post.caption && fbPosts.length > 0) {
          const igCaptionNormalized = post.caption.trim().toLowerCase();
          const match = fbPosts.find((fbp: any) => {
            if (!fbp.message) return false;
            const fbMessageNormalized = fbp.message.trim().toLowerCase();
            return fbMessageNormalized === igCaptionNormalized || fbMessageNormalized.includes(igCaptionNormalized) || igCaptionNormalized.includes(fbMessageNormalized);
          });
          
          if (match) {
            matchedFbPostId = match.id;
            postedOn = 'both';
          }
        }

        await writeClient.create({
          _type: 'productReel',
          postedOn,
          reelId: post.id,
          fbPostId: matchedFbPostId,
          name: 'Post ' + post.id.substring(0, 5),
          description: post.caption || '',
          materialType: 'gold22k', // default
          weightGrams: 0,
          makingChargeType: 'percentage', // default
          makingCharges: 0,
          thumbnailUrl: post.thumbnail_url || post.media_url || '',
          publishedAt: post.timestamp || new Date().toISOString(),
          status: 'active',
          isPriceLocked: false,
        });
        addedCount++;
        
        existingIgIds.set(post.id, { _id: 'new', reelId: post.id, fbPostId: matchedFbPostId, postedOn });
        if (matchedFbPostId) {
          existingFbIds.set(matchedFbPostId, { _id: 'new', reelId: post.id, fbPostId: matchedFbPostId, postedOn });
        }
      } else {
        // Post exists, try to backfill fbPostId if missing
        const existing: any = existingIgIds.get(post.id);
        if (!existing.fbPostId && post.caption && fbPosts.length > 0) {
          const igCaptionNormalized = post.caption.trim().toLowerCase();
          const match = fbPosts.find((fbp: any) => {
            if (!fbp.message) return false;
            const fbMessageNormalized = fbp.message.trim().toLowerCase();
            return fbMessageNormalized === igCaptionNormalized || fbMessageNormalized.includes(igCaptionNormalized) || igCaptionNormalized.includes(fbMessageNormalized);
          });
          
          if (match && !existingFbIds.has(match.id)) {
            // Found a match for an old post! Update it.
            await writeClient.patch(existing._id).set({
              fbPostId: match.id,
              postedOn: 'both'
            }).commit();
            existingFbIds.set(match.id, { _id: existing._id, reelId: post.id, fbPostId: match.id, postedOn: 'both' });
            // Not counting this as an "added" post since it was just updated
          }
        }
      }
    }
    
    // Process remaining Facebook Posts (those that didn't match any IG post)
    for (const fbPost of fbPosts) {
      if (!existingFbIds.has(fbPost.id)) {
        let matchedExistingDoc = null;
        if (fbPost.message) {
          const fbMessageNormalized = fbPost.message.trim().toLowerCase();
          matchedExistingDoc = existingReels.find((r: any) => {
            if (!r.description) return false;
            const rDesc = r.description.trim().toLowerCase();
            return fbMessageNormalized === rDesc || fbMessageNormalized.includes(rDesc) || rDesc.includes(fbMessageNormalized);
          });
        }

        if (matchedExistingDoc) {
          // Update the existing document to link the Facebook post
          await writeClient.patch(matchedExistingDoc._id).set({
            fbPostId: fbPost.id,
            postedOn: 'both'
          }).commit();
          existingFbIds.set(fbPost.id, { _id: matchedExistingDoc._id, fbPostId: fbPost.id, postedOn: 'both' });
        } else {
          // No match found, create a new document
          await writeClient.create({
            _type: 'productReel',
            postedOn: 'facebook',
            fbPostId: fbPost.id,
            name: 'FB Post ' + fbPost.id.substring(0, 5),
            description: fbPost.message || '',
            materialType: 'gold22k', // default
            weightGrams: 0,
            makingChargeType: 'percentage',
            makingCharges: 0,
            thumbnailUrl: fbPost.full_picture || '',
            publishedAt: fbPost.created_time || new Date().toISOString(),
            status: 'active',
            isPriceLocked: false,
          });
          addedCount++;
          existingFbIds.set(fbPost.id, { _id: 'new', fbPostId: fbPost.id, postedOn: 'facebook' });
        }
      }
    }

    revalidatePath('/admin');
    return { success: true, addedCount };
  } catch (error: any) {
    console.error("Error syncing posts:", error);
    return { success: false, error: error.message };
  }
}

export async function updateProductReel(id: string, formData: FormData) {
  const session = await getServerSession(authOptions);
  if (!session) return { success: false, error: "Unauthorized access." };

  try {
    const name = formData.get('name') as string;
    const materialType = formData.get('materialType') as string;
    const weightGrams = parseFloat(formData.get('weightGrams') as string) || 0;
    const makingCharges = parseFloat(formData.get('makingCharges') as string) || 0;
    const makingChargeType = formData.get('makingChargeType') as string;
    const description = formData.get('description') as string;
    
    // New premium fields
    const status = formData.get('status') as string;
    const category = formData.get('category') as string;
    const sku = formData.get('sku') as string;
    const isPriceLocked = formData.get('isPriceLocked') === 'true';
    const lockedPrice = parseFloat(formData.get('lockedPrice') as string) || 0;
    const notes = formData.get('notes') as string;

    await writeClient.patch(id).set({
      name,
      materialType,
      weightGrams,
      makingCharges,
      makingChargeType,
      description,
      status,
      category,
      sku,
      isPriceLocked,
      lockedPrice,
      notes
    }).commit();

    revalidatePath('/admin');
    return { success: true };
  } catch (error: any) {
    console.error("Error updating reel:", error);
    return { success: false, error: error.message };
  }
}

export async function updateLeadStatus(id: string, newStatus: string) {
  const session = await getServerSession(authOptions);
  if (!session) return { success: false, error: "Unauthorized access." };

  try {
    await writeClient.patch(id).set({ status: newStatus }).commit();
    revalidatePath('/admin');
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}
