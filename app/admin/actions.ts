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
    const posts = data.data || [];

    // Fetch existing reels
    const existingReels = await writeClient.fetch(`*[_type == "productReel"]{reelId}`);
    const existingIds = new Set(existingReels.map((r: any) => r.reelId));

    let addedCount = 0;
    for (const post of posts) {
      if (!existingIds.has(post.id)) {
        await writeClient.create({
          _type: 'productReel',
          reelId: post.id,
          name: 'Post ' + post.id.substring(0, 5),
          description: post.caption || '',
          materialType: 'gold22k', // default
          weightGrams: 0,
          makingCharges: 0,
          thumbnailUrl: post.thumbnail_url || post.media_url || '',
          publishedAt: post.timestamp || new Date().toISOString(),
          status: 'active',
          isPriceLocked: false,
        });
        addedCount++;
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
