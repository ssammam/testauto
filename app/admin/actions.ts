'use server'

import { writeClient } from '@/sanity/lib/client';
import { revalidatePath } from 'next/cache';
import { extractProductInfo, sendPendingReplies } from '@/lib/botLogic';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

export async function saveDailyRates(formData: FormData) {
  const session = await getServerSession(authOptions);
  if (!session) return { success: false, error: "Unauthorized access." };

  try {
    const gold9k = parseFloat(formData.get('goldRate9k') as string);
    const gold18k = parseFloat(formData.get('goldRate18k') as string);
    const gold22k = parseFloat(formData.get('goldRate22k') as string);
    const gold24k = parseFloat(formData.get('goldRate24k') as string);
    const silver = parseFloat(formData.get('silverRate') as string);

    if (isNaN(gold9k) || isNaN(gold18k) || isNaN(gold22k) || isNaN(gold24k) || isNaN(silver)) {
      throw new Error("Invalid rate values.");
    }

    const today = new Date().toISOString().split('T')[0];

    // Create a new daily price document
    await writeClient.create({
      _type: 'dailyPrice',
      date: today,
      goldRate9k: gold9k,
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
      fetchUrl = `${baseUrl}/me/media?fields=id,caption,media_type,media_url,permalink,thumbnail_url,timestamp&access_token=${TOKEN}&limit=100`;
    } else {
      const IG_ID = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID;
      fetchUrl = `${baseUrl}/v20.0/${IG_ID}/media?fields=id,caption,media_type,media_url,permalink,thumbnail_url,timestamp&access_token=${TOKEN}&limit=100`;
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

        const fbReelsUrl = `https://graph.facebook.com/v20.0/${fbPageId}/video_reels?fields=id,description,created_time,picture&access_token=${fbToken}&limit=50`;
        const fbReelsRes = await fetch(fbReelsUrl);
        if (fbReelsRes.ok) {
          const fbReelsData = await fbReelsRes.json();
          if (fbReelsData.data) {
             const mappedReels = fbReelsData.data.map((r: any) => ({
                 id: r.id, // Usually just the reel ID, not PAGEID_REELID
                 message: r.description,
                 created_time: r.created_time,
                 full_picture: r.picture
             }));
             fbPosts = [...fbPosts, ...mappedReels];
          }
        }
      }
    } catch (e) {
      console.error("Error fetching FB posts for cross-post matching:", e);
    }
    // ---------------------------------

    // Fetch existing reels
    const existingReels = await writeClient.fetch(`*[_type == "productReel"]{_id, reelId, fbPostId, postedOn, description, status, materialType, category}`);
    const existingIgIds = new Map(existingReels.filter((r: any) => r.reelId).map((r: any) => [r.reelId, r]));
    const existingFbIds = new Map(existingReels.filter((r: any) => r.fbPostId).map((r: any) => [r.fbPostId, r]));

    let addedCount = 0;
    
    // Process Instagram Posts
    for (const post of igPosts) {
      if (!existingIgIds.has(post.id)) {
        // Find matching FB post based on caption
        let matchedFbPostId = undefined;
        let postedOn = 'instagram';
        const shortcode = post.permalink ? post.permalink.match(/(?:p|reel|tv)\/([A-Za-z0-9_-]+)/)?.[1] : undefined;
        
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

        if (matchedFbPostId && existingFbIds.has(matchedFbPostId)) {
          // The FB post is already in Sanity. Just append the IG id to it.
          const existingFbDoc: any = existingFbIds.get(matchedFbPostId);
          await writeClient.patch(existingFbDoc._id).set({
            reelId: post.id,
            shortcode,
            postedOn: 'both'
          }).commit();
          
          existingIgIds.set(post.id, { _id: existingFbDoc._id, reelId: post.id, fbPostId: matchedFbPostId, shortcode, postedOn: 'both' });
        } else {
          const extracted = extractProductInfo(post.caption || "");
          
          await writeClient.create({
            _type: 'productReel',
            postedOn,
            reelId: post.id,
            fbPostId: matchedFbPostId,
            shortcode,
            name: 'Post ' + post.id.substring(0, 5),
            description: post.caption || '',
            makingChargeType: 'percentage', // default
            makingCharges: 0,
            thumbnailUrl: post.thumbnail_url || post.media_url || '',
            publishedAt: post.timestamp || new Date().toISOString(),
            isPriceLocked: false,
            // Extracted values override defaults
            materialType: extracted.materialType || 'gold22k',
            category: extracted.category || 'rings',
            weightGrams: extracted.weightGrams || 0,
            minWeightGrams: extracted.minWeightGrams,
            maxWeightGrams: extracted.maxWeightGrams,
            priceCalculationType: extracted.priceCalculationType || 'normal',
            status: extracted.status === 'draft' ? 'draft' : 'active',
            notes: extracted.notes || '',
          });
          addedCount++;
          
          existingIgIds.set(post.id, { _id: 'new', reelId: post.id, fbPostId: matchedFbPostId, shortcode, postedOn });
          if (matchedFbPostId) {
            existingFbIds.set(matchedFbPostId, { _id: 'new', reelId: post.id, fbPostId: matchedFbPostId, postedOn });
          }
        }
      } else {
        // Post exists, try to backfill fbPostId if missing
        const existing: any = existingIgIds.get(post.id);
        const shortcode = post.permalink ? post.permalink.match(/(?:p|reel|tv)\/([A-Za-z0-9_-]+)/)?.[1] : undefined;
        
        if (existing.status === 'draft' && post.caption && existing.description !== post.caption) {
           const extracted = extractProductInfo(post.caption);
           const hasNormalWeight = extracted.priceCalculationType === 'normal' && extracted.weightGrams > 0;
           const hasRangeWeight = extracted.priceCalculationType === 'range' && extracted.minWeightGrams > 0 && extracted.maxWeightGrams > 0;
           
           if (hasNormalWeight || hasRangeWeight) {
             const updatedDoc = await writeClient.patch(existing._id).set({
               description: post.caption,
               status: 'active',
               materialType: extracted.materialType || existing.materialType,
               category: extracted.category || existing.category,
               weightGrams: extracted.weightGrams || 0,
               minWeightGrams: extracted.minWeightGrams,
               maxWeightGrams: extracted.maxWeightGrams,
               priceCalculationType: extracted.priceCalculationType,
               notes: ''
             }).commit();
             const fullUpdatedProduct = await writeClient.fetch(`*[_id == $id][0]`, { id: existing._id });
             await sendPendingReplies(fullUpdatedProduct);
             addedCount++;
           } else {
             await writeClient.patch(existing._id).set({ description: post.caption }).commit();
             existing.description = post.caption;
           }
        }

        if (!existing.shortcode && shortcode) {
           await writeClient.patch(existing._id).set({ shortcode }).commit();
           existing.shortcode = shortcode;
        }

        if (!existing.fbPostId && post.caption && fbPosts.length > 0) {
          const igCaptionNormalized = post.caption.trim().toLowerCase();
          const match = fbPosts.find((fbp: any) => {
            if (!fbp.message) return false;
            const fbMessageNormalized = fbp.message.trim().toLowerCase();
            return fbMessageNormalized === igCaptionNormalized || fbMessageNormalized.includes(igCaptionNormalized) || igCaptionNormalized.includes(fbMessageNormalized);
          });
          
          if (match) {
            if (!existingFbIds.has(match.id)) {
              await writeClient.patch(existing._id).set({
                fbPostId: match.id,
                postedOn: 'both'
              }).commit();
              existingFbIds.set(match.id, { _id: existing._id, reelId: post.id, fbPostId: match.id, postedOn: 'both' });
              const fullUpdatedProduct = await writeClient.fetch(`*[_id == $id][0]`, { id: existing._id });
              await sendPendingReplies(fullUpdatedProduct);
            } else {
              // Both IG and FB exist separately! Merge them by attaching FB id to IG doc, and deleting FB doc.
              const fbDoc: any = existingFbIds.get(match.id);
              if (fbDoc._id !== existing._id) {
                await writeClient.patch(existing._id).set({
                  fbPostId: match.id,
                  postedOn: 'both'
                }).commit();
                await writeClient.delete(fbDoc._id); // delete standalone FB doc
                existingFbIds.set(match.id, { _id: existing._id, reelId: post.id, fbPostId: match.id, postedOn: 'both' });
                const fullUpdatedProduct = await writeClient.fetch(`*[_id == $id][0]`, { id: existing._id });
                await sendPendingReplies(fullUpdatedProduct);
              }
            }
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
          // Check if caption changed on FB for an existing draft
          if (matchedExistingDoc.status === 'draft' && fbPost.message && matchedExistingDoc.description !== fbPost.message) {
             const extracted = extractProductInfo(fbPost.message);
             const hasNormalWeight = extracted.priceCalculationType === 'normal' && extracted.weightGrams > 0;
             const hasRangeWeight = extracted.priceCalculationType === 'range' && extracted.minWeightGrams > 0 && extracted.maxWeightGrams > 0;
             
             if (hasNormalWeight || hasRangeWeight) {
               const updatedDoc = await writeClient.patch(matchedExistingDoc._id).set({
                 description: fbPost.message,
                 status: 'active',
                 fbPostId: fbPost.id,
                 postedOn: 'both',
                 materialType: extracted.materialType || matchedExistingDoc.materialType,
                 category: extracted.category || matchedExistingDoc.category,
                 weightGrams: extracted.weightGrams || 0,
                 minWeightGrams: extracted.minWeightGrams,
                 maxWeightGrams: extracted.maxWeightGrams,
                 priceCalculationType: extracted.priceCalculationType,
                 notes: ''
               }).commit();
               const fullUpdatedProduct = await writeClient.fetch(`*[_id == $id][0]`, { id: matchedExistingDoc._id });
               await sendPendingReplies(fullUpdatedProduct);
               addedCount++;
             } else {
               await writeClient.patch(matchedExistingDoc._id).set({
                 fbPostId: fbPost.id,
                 postedOn: 'both',
                 description: fbPost.message
               }).commit();
             }
          } else {
            await writeClient.patch(matchedExistingDoc._id).set({
              fbPostId: fbPost.id,
              postedOn: 'both'
            }).commit();
          }
          
          existingFbIds.set(fbPost.id, { _id: matchedExistingDoc._id, fbPostId: fbPost.id, postedOn: 'both' });
        } else {
          // No match found, create a new document
          const extracted = extractProductInfo(fbPost.message || "");
          
          await writeClient.create({
            _type: 'productReel',
            postedOn: 'facebook',
            fbPostId: fbPost.id,
            name: 'FB Post ' + fbPost.id.substring(0, 5),
            description: fbPost.message || '',
            makingChargeType: 'percentage',
            makingCharges: 0,
            thumbnailUrl: fbPost.full_picture || '',
            publishedAt: fbPost.created_time || new Date().toISOString(),
            isPriceLocked: false,
            // Extracted values override defaults
            materialType: extracted.materialType || 'gold22k',
            category: extracted.category || 'rings',
            weightGrams: extracted.weightGrams || 0,
            minWeightGrams: extracted.minWeightGrams,
            maxWeightGrams: extracted.maxWeightGrams,
            priceCalculationType: extracted.priceCalculationType || 'normal',
            status: extracted.status === 'draft' ? 'draft' : 'active',
            notes: extracted.notes || '',
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
    const priceCalculationType = formData.get('priceCalculationType') as string;
    const rangeCategory = formData.get('rangeCategory') as string;
    const minWeightGrams = parseFloat(formData.get('minWeightGrams') as string) || 0;
    const maxWeightGrams = parseFloat(formData.get('maxWeightGrams') as string) || 0;

    let finalStatus = status;
    if (finalStatus === 'draft') {
      const hasNormalWeight = priceCalculationType === 'normal' && weightGrams > 0;
      const hasRangeWeight = priceCalculationType === 'range' && minWeightGrams > 0 && maxWeightGrams > 0;
      if (hasNormalWeight || hasRangeWeight || isPriceLocked) {
        finalStatus = 'active';
      }
    }

    await writeClient.patch(id).set({
      name,
      materialType,
      weightGrams,
      makingCharges,
      makingChargeType,
      description,
      status: finalStatus,
      category,
      sku,
      isPriceLocked,
      lockedPrice,
      notes,
      priceCalculationType,
      rangeCategory,
      minWeightGrams,
      maxWeightGrams
    }).commit();

    if (finalStatus !== 'draft') {
      const updatedProduct = await writeClient.fetch(`*[_id == $id][0]`, { id });
      await sendPendingReplies(updatedProduct);
    }

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
