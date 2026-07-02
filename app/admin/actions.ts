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

export async function syncInstagramPosts(customStartDate?: string) {
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

    const SYNC_START_DATE = customStartDate ? new Date(customStartDate) : new Date('2026-05-01T00:00:00Z');
    let allIgPosts: any[] = [];
    let nextUrl = fetchUrl;
    
    while (nextUrl) {
      const res = await fetch(nextUrl);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error?.message || "Failed to fetch IG posts");
      }
      const data = await res.json();
      const pagePosts = data.data || [];
      allIgPosts = [...allIgPosts, ...pagePosts];
      
      if (pagePosts.length > 0) {
        const oldestPost = pagePosts[pagePosts.length - 1];
        const oldestPostDate = oldestPost.timestamp ? new Date(oldestPost.timestamp) : null;
        if (oldestPostDate && oldestPostDate < SYNC_START_DATE) {
          break;
        }
      }
      nextUrl = data.paging?.next || "";
    }

    const igPosts = allIgPosts
      .filter((post: any) => {
        const postDate = post.timestamp ? new Date(post.timestamp) : null;
        return postDate && postDate >= SYNC_START_DATE;
      })
      .sort((a: any, b: any) => {
        const dateA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
        const dateB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
        return dateA - dateB;
      });

    // --- NEW: Fetch Facebook Posts to detect cross-posting ---
    let fbPosts: any[] = [];
    try {
      const fbToken = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
      const fbPageId = process.env.FACEBOOK_PAGE_ID;
      if (fbToken && fbPageId) {
        const fbUrl = `https://graph.facebook.com/v20.0/${fbPageId}/posts?fields=id,message,created_time,full_picture&access_token=${fbToken}&limit=100`;
        let rawFbPosts: any[] = [];
        let fbNextUrl = fbUrl;
        while (fbNextUrl) {
          const fbRes = await fetch(fbNextUrl);
          if (fbRes.ok) {
            const fbData = await fbRes.json();
            const pageFbPosts = fbData.data || [];
            rawFbPosts = [...rawFbPosts, ...pageFbPosts];
            
            if (pageFbPosts.length > 0) {
              const oldestPost = pageFbPosts[pageFbPosts.length - 1];
              const oldestPostDate = oldestPost.created_time ? new Date(oldestPost.created_time) : null;
              if (oldestPostDate && oldestPostDate < SYNC_START_DATE) {
                break;
              }
            }
            fbNextUrl = fbData.paging?.next || "";
          } else {
            break;
          }
        }

        const fbReelsUrl = `https://graph.facebook.com/v20.0/${fbPageId}/video_reels?fields=id,description,created_time,picture&access_token=${fbToken}&limit=100`;
        let fbReelsNextUrl = fbReelsUrl;
        while (fbReelsNextUrl) {
          const fbReelsRes = await fetch(fbReelsNextUrl);
          if (fbReelsRes.ok) {
            const fbReelsData = await fbReelsRes.json();
            const pageFbReels = fbReelsData.data || [];
            if (pageFbReels.length > 0) {
              const mappedReels = pageFbReels.map((r: any) => ({
                id: r.id,
                message: r.description,
                created_time: r.created_time,
                full_picture: r.picture
              }));
              rawFbPosts = [...rawFbPosts, ...mappedReels];
              
              const oldestReel = pageFbReels[pageFbReels.length - 1];
              const oldestReelDate = oldestReel.created_time ? new Date(oldestReel.created_time) : null;
              if (oldestReelDate && oldestReelDate < SYNC_START_DATE) {
                break;
              }
            }
            fbReelsNextUrl = fbReelsData.paging?.next || "";
          } else {
            break;
          }
        }

        fbPosts = rawFbPosts
          .filter((post: any) => {
            const postDate = post.created_time ? new Date(post.created_time) : null;
            return postDate && postDate >= SYNC_START_DATE;
          })
          .sort((a: any, b: any) => {
            const dateA = a.created_time ? new Date(a.created_time).getTime() : 0;
            const dateB = b.created_time ? new Date(b.created_time).getTime() : 0;
            return dateA - dateB;
          });
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
        // Find matching FB post based on caption or publish time
        let matchedFbPost = undefined;
        let matchedFbPostId = undefined;
        let postedOn = 'instagram';
        const shortcode = post.permalink ? post.permalink.match(/(?:p|reel|tv)\/([A-Za-z0-9_-]+)/)?.[1] : undefined;
        
        if (fbPosts.length > 0) {
          if (post.caption) {
            const igCaptionNormalized = post.caption.trim().toLowerCase();
            matchedFbPost = fbPosts.find((fbp: any) => {
              if (!fbp.message) return false;
              const fbMessageNormalized = fbp.message.trim().toLowerCase();
              return fbMessageNormalized === igCaptionNormalized || fbMessageNormalized.includes(igCaptionNormalized) || igCaptionNormalized.includes(fbMessageNormalized);
            });
          }
          
          // Fallback: match by publish time within 10 minutes
          if (!matchedFbPost) {
            const igTime = post.timestamp ? new Date(post.timestamp).getTime() : 0;
            matchedFbPost = fbPosts.find((fbp: any) => {
              const fbTime = fbp.created_time ? new Date(fbp.created_time).getTime() : 0;
              return Math.abs(igTime - fbTime) <= 10 * 60 * 1000;
            });
          }

          if (matchedFbPost) {
            matchedFbPostId = matchedFbPost.id;
            postedOn = 'both';
          }
        }

        if (matchedFbPostId && existingFbIds.has(matchedFbPostId)) {
          // The FB post is already in Sanity. Just append the IG id to it.
          const existingFbDoc: any = existingFbIds.get(matchedFbPostId);
          await writeClient.patch(existingFbDoc._id).set({
            reelId: post.id,
            shortcode,
            postedOn: 'both',
            // Backfill description if currently empty
            ...(!existingFbDoc.description && matchedFbPost?.message ? { description: matchedFbPost.message } : {})
          }).commit();
          
          existingIgIds.set(post.id, { _id: existingFbDoc._id, reelId: post.id, fbPostId: matchedFbPostId, shortcode, postedOn: 'both' });
        } else {
          const extracted = extractProductInfo(post.caption || (matchedFbPost ? (matchedFbPost.message || '') : '') || "");
          
          await writeClient.create({
            _type: 'productReel',
            postedOn,
            reelId: post.id,
            fbPostId: matchedFbPostId,
            shortcode,
            name: `${postedOn === 'both' ? 'Social' : 'Instagram'} Post - ${new Date(post.timestamp || Date.now()).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`,
            description: post.caption || (matchedFbPost ? (matchedFbPost.message || '') : '') || '',
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
        // Post exists, try to backfill/merge if necessary
        const existing: any = existingIgIds.get(post.id);
        const shortcode = post.permalink ? post.permalink.match(/(?:p|reel|tv)\/([A-Za-z0-9_-]+)/)?.[1] : undefined;
        
        let needsPatch = false;
        const patchData: any = {};

        // 1. Check description / caption (override if empty or if draft caption changed)
        const existingHasNoCaption = !existing.description || existing.description.trim() === '';
        const isDraftWithChangedCaption = existing.status === 'draft' && post.caption && existing.description !== post.caption;

        if (post.caption && (existingHasNoCaption || isDraftWithChangedCaption)) {
           const extracted = extractProductInfo(post.caption);
           const hasNormalWeight = extracted.priceCalculationType === 'normal' && extracted.weightGrams > 0;
           const hasRangeWeight = extracted.priceCalculationType === 'range' && extracted.minWeightGrams > 0 && extracted.maxWeightGrams > 0;
           
           patchData.description = post.caption;
           patchData.materialType = extracted.materialType || existing.materialType || 'gold22k';
           patchData.category = extracted.category || existing.category || 'rings';
           patchData.weightGrams = extracted.weightGrams || 0;
           patchData.minWeightGrams = extracted.minWeightGrams;
           patchData.maxWeightGrams = extracted.maxWeightGrams;
           patchData.priceCalculationType = extracted.priceCalculationType || 'normal';
           patchData.notes = extracted.notes || '';
           
           if (hasNormalWeight || hasRangeWeight) {
             patchData.status = 'active';
           }
           needsPatch = true;
        }

        // 2. Check shortcode
        if (!existing.shortcode && shortcode) {
           patchData.shortcode = shortcode;
           needsPatch = true;
        }

        // 3. Check fbPostId backfill & merge
        let matchedFbPost = undefined;
        let shouldDeleteFbDocId = null;

        if (!existing.fbPostId && fbPosts.length > 0) {
          if (post.caption) {
            const igCaptionNormalized = post.caption.trim().toLowerCase();
            matchedFbPost = fbPosts.find((fbp: any) => {
              if (!fbp.message) return false;
              const fbMessageNormalized = fbp.message.trim().toLowerCase();
              return fbMessageNormalized === igCaptionNormalized || fbMessageNormalized.includes(igCaptionNormalized) || igCaptionNormalized.includes(fbMessageNormalized);
            });
          }
          
          if (!matchedFbPost) {
            const igTime = post.timestamp ? new Date(post.timestamp).getTime() : 0;
            matchedFbPost = fbPosts.find((fbp: any) => {
              const fbTime = fbp.created_time ? new Date(fbp.created_time).getTime() : 0;
              return Math.abs(igTime - fbTime) <= 10 * 60 * 1000;
            });
          }
          
          if (matchedFbPost) {
            patchData.fbPostId = matchedFbPost.id;
            patchData.postedOn = 'both';
            needsPatch = true;

            // If the matched FB post also has a message/caption, and we don't have a caption in patchData/existing, backfill it
            const currentDesc = patchData.description || existing.description;
            if ((!currentDesc || currentDesc.trim() === '') && matchedFbPost.message) {
              const extracted = extractProductInfo(matchedFbPost.message);
              const hasNormalWeight = extracted.priceCalculationType === 'normal' && extracted.weightGrams > 0;
              const hasRangeWeight = extracted.priceCalculationType === 'range' && extracted.minWeightGrams > 0 && extracted.maxWeightGrams > 0;
              
              patchData.description = matchedFbPost.message;
              patchData.materialType = extracted.materialType || existing.materialType || 'gold22k';
              patchData.category = extracted.category || existing.category || 'rings';
              patchData.weightGrams = extracted.weightGrams || 0;
              patchData.minWeightGrams = extracted.minWeightGrams;
              patchData.maxWeightGrams = extracted.maxWeightGrams;
              patchData.priceCalculationType = extracted.priceCalculationType || 'normal';
              patchData.notes = extracted.notes || '';
              if (hasNormalWeight || hasRangeWeight) {
                patchData.status = 'active';
              }
            }

            // Check if there is an existing standalone FB document for this matched FB post to delete
            if (existingFbIds.has(matchedFbPost.id)) {
              const fbDoc: any = existingFbIds.get(matchedFbPost.id);
              if (fbDoc._id !== existing._id) {
                shouldDeleteFbDocId = fbDoc._id;
              }
            }
          }
        }

        // Apply mutations if changes are needed, otherwise skip to save time
        if (needsPatch) {
          await writeClient.patch(existing._id).set(patchData).commit();
          
          // Update local memory maps
          Object.assign(existing, patchData);
          if (patchData.fbPostId) {
            existingFbIds.set(patchData.fbPostId, { _id: existing._id, reelId: post.id, fbPostId: patchData.fbPostId, postedOn: 'both' });
          }

          // If status became active, trigger pending reply notifications
          if (patchData.status === 'active') {
            const fullUpdatedProduct = await writeClient.fetch(`*[_id == $id][0]`, { id: existing._id });
            await sendPendingReplies(fullUpdatedProduct);
          }
        }

        if (shouldDeleteFbDocId) {
          await writeClient.delete(shouldDeleteFbDocId);
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
            name: `Facebook Post - ${new Date(fbPost.created_time || Date.now()).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`,
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
