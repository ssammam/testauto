import { client, writeClient } from "@/sanity/lib/client";

export interface BotConfig {
  platform: "instagram" | "facebook";
  token: string;
  botId: string;
}

interface CacheItem<T> {
  data: T;
  expiresAt: number;
}

const productCache = new Map<string, CacheItem<any>>();
let ratesCache: CacheItem<any> | null = null;
let faqsCache: CacheItem<any[]> | null = null;
const profileCache = new Map<string, CacheItem<any>>();

const CACHE_TTL_MS = 1000 * 60 * 15; // 15 minutes cache
const PROFILE_CACHE_TTL_MS = 1000 * 60 * 60; // 1 hour for user profiles

async function getFaqs() {
  if (faqsCache && faqsCache.expiresAt > Date.now()) {
    return faqsCache.data;
  }
  const faqs = await client.fetch(`*[_type == "faq"]`);
  faqsCache = { data: faqs, expiresAt: Date.now() + CACHE_TTL_MS };
  return faqs;
}

async function getRates() {
  if (ratesCache && ratesCache.expiresAt > Date.now()) {
    return ratesCache.data;
  }
  const rates = await client.fetch(`*[_type == "dailyPrice"] | order(_updatedAt desc)[0]`);
  ratesCache = { data: rates, expiresAt: Date.now() + CACHE_TTL_MS };
  return rates;
}

async function getProduct(mediaId: string) {
  if (productCache.has(mediaId)) {
    const cached = productCache.get(mediaId)!;
    if (cached.expiresAt > Date.now()) {
      return cached.data;
    }
  }
  const product = await client.fetch(`*[_type == "productReel" && (reelId == $mediaId || fbPostId == $mediaId)][0]`, { mediaId });
  productCache.set(mediaId, { data: product, expiresAt: Date.now() + CACHE_TTL_MS });
  return product;
}

export function buildProductDmMessage(product: any, rates: any): string {
  if (product) {
    if (product.status === 'sold') {
      return "✨ This beautiful piece has already been sold! Please DM us to check for similar designs or to place a custom order. 💛";
    }

    let totalPrice = 0;
    let rawGoldValue = 0;
    let makingChargeTotal = 0;
    let gst = 0;
    let breakdownText = "";

    if (product.isPriceLocked && product.lockedPrice) {
      totalPrice = product.lockedPrice;
    } else {
      let ratePerGram = 0;
      if (product.materialType === 'gold18k') ratePerGram = rates?.goldRate18k || 0;
      else if (product.materialType === 'gold22k') ratePerGram = rates?.goldRate22k || 0;
      else if (product.materialType === 'gold24k') ratePerGram = rates?.goldRate24k || 0;
      else if (product.materialType === 'silver') ratePerGram = (rates?.silverRate || 0) / 1000;

      if (!ratePerGram) ratePerGram = rates?.goldRate22k || 0; // Default to 22k if missing

      const weight = product.weightGrams || 0;
      rawGoldValue = weight * ratePerGram;
      
      const makingCharges = product.makingCharges || 0;
      if (product.makingChargeType === 'percentage') {
        makingChargeTotal = rawGoldValue * (makingCharges / 100);
      } else if (product.makingChargeType === 'per_gram') {
        makingChargeTotal = makingCharges * weight;
      } else {
        makingChargeTotal = makingCharges;
      }

      const basePrice = rawGoldValue + makingChargeTotal;
      gst = basePrice * 0.03; // 3% GST
      totalPrice = Math.round(basePrice + gst);

      let makingStr = "";
      if (product.makingChargeType === 'percentage') makingStr = `(${makingCharges}%)`;
      else if (product.makingChargeType === 'per_gram') makingStr = `(₹${makingCharges}/g)`;

      breakdownText = `\n🪙 Material Value: ₹${Math.round(rawGoldValue).toLocaleString('en-IN')}\n✨ Making Charges ${makingStr}: ₹${Math.round(makingChargeTotal).toLocaleString('en-IN')}\n⚖️ GST (3%): ₹${Math.round(gst).toLocaleString('en-IN')}\n`;
    }

    return `✨ ${product.name}\n${product.materialType === 'silver' ? 'Silver' : 'Hallmarked Gold'}\n\n⚖️ Weight: ${product.weightGrams}g\n${product.sku ? `[SKU: ${product.sku}]` : ''}${breakdownText}\n💰 Total Price: ₹${totalPrice.toLocaleString('en-IN')}\n${product.isPriceLocked ? '*(Incl. making & 3% GST)*\n' : ''}\n✓ BIS Hallmarked\n✓ Certified\n✓ Insured Shipping\n\nReply to this message to book an appointment or ask for similar designs! 💛`;
  }
  
  return "👋 Hey there! To give you the exact price, could you please share the reel, reply directly to the story, or comment on the post of the specific jewelry piece you're interested in? 💛\n\nOur team will check the details and get back to you with the exact live price!\n\n*(Note: Please avoid sending screenshots for price checks. Images are only used if you want to place a custom jewelry order.)*";
}

async function sendDM(recipient: { id: string } | { comment_id: string }, body: Record<string, unknown>, config: BotConfig) {
  const baseUrl = config.token.startsWith("IGAA") ? "https://graph.instagram.com" : "https://graph.facebook.com";
  
  const payload: any = { recipient, ...body };
  if (config.platform === "facebook") {
    // Private replies (using comment_id) do not use messaging_type
    if (!("comment_id" in recipient)) {
      payload.messaging_type = "RESPONSE";
    }
  }

  const res = await fetch(
    `${baseUrl}/v25.0/me/messages?access_token=${config.token}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    console.error(`[${config.platform}] DM send error:`, JSON.stringify(err));
  }
}

async function replyToComment(commentId: string, message: string, config: BotConfig) {
  const baseUrl = config.token.startsWith("IGAA") ? "https://graph.instagram.com" : "https://graph.facebook.com";
  
  const params = new URLSearchParams();
  params.append("message", message);
  params.append("access_token", config.token);

  const edge = config.platform === "instagram" ? "replies" : "comments";
  const res = await fetch(
    `${baseUrl}/v25.0/${commentId}/${edge}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    console.error(`[${config.platform} replyToComment] Error:`, JSON.stringify(err));
  } else {
    console.log(`[${config.platform} replyToComment] Successfully replied to comment ${commentId}`);
  }
}

async function dmText(id: string, text: string, config: BotConfig) {
  await sendDM({ id }, { message: { text } }, config);
}

export async function processDM(event: Record<string, any>, config: BotConfig) {
  const senderId: string = event.sender?.id;
  if (!senderId) return;

  if (event.message?.is_echo || senderId === config.botId) return;
  if (!event.message && !event.postback) return;

  const rawMessageText: string = (event.message?.text || "").trim();
  const messageText: string = rawMessageText.toLowerCase();

  // ANTI-LOOP
  if (messageText.includes("estimated price") || messageText.includes("our team gets back to you") || messageText.includes("what can we help you with")) {
    return;
  }

  console.log(`[${config.platform} handleDM] Received message from ${senderId}: "${rawMessageText}"`);

  const baseUrl = config.token.startsWith("IGAA") ? "https://graph.instagram.com" : "https://graph.facebook.com";

  // Get sender profile (with caching to prevent Meta API rate limits)
  let profile: any = {};
  if (profileCache.has(senderId) && profileCache.get(senderId)!.expiresAt > Date.now()) {
    profile = profileCache.get(senderId)!.data;
  } else {
    const fields = config.platform === "facebook" ? "username,name,first_name" : "username,name";
    try {
      const profileRes = await fetch(`${baseUrl}/v25.0/${senderId}?fields=${fields}&access_token=${config.token}`);
      if (profileRes.ok) {
        profile = await profileRes.json();
        profileCache.set(senderId, { data: profile, expiresAt: Date.now() + PROFILE_CACHE_TTL_MS });
      }
    } catch (e) {
      console.error(`[${config.platform}] Failed to fetch profile for ${senderId}`, e);
    }
  }

  const name: string = profile.first_name || profile.name || profile.username || "there";
  const username: string = profile.username || profile.name || senderId;

  // 1. GREETING (Commented out to let Meta Business Suite handle auto-replies during App Review)
  /*
  if (messageText === "hello" || messageText === "hi" || messageText === "hey") {
    await dmText(senderId, `👋 Hi ${name}! Are you looking for Gold or Silver? What can we help you with?`, config);
    return;
  }
  */

  // 2. DETECT BOOKING INTENT
  if (messageText.includes("visit") || messageText.includes("tomorrow") || messageText.includes("today") || messageText.includes("book")) {
    await dmText(senderId, "🗓️ Would you like to schedule a visit? Please provide a date and your phone number so our team can get ready for you!", config);
    await writeClient.create({ _type: 'lead', instagramUsername: username, name: name, queryType: 'General', status: 'New', reportedInDailyEmail: false });
    return;
  }

  // 2.5 DETECT LOCATION INTENT
  if (messageText.includes("location") || messageText.includes("where") || messageText.includes("address")) {
    await dmText(senderId, "📍 Our store is located at: 312 Kuvempu Road, Mahakavi Kuvempu Rd, Kengeri, Bengaluru, Karnataka 560060\nGoogle Maps: https://maps.app.goo.gl/U1shqm6TSeJFTNvi6\n\nWe'd love to host you! Could you please share your phone number so we can book a VIP store visit for you? 💛", config);
    await writeClient.create({ _type: 'lead', instagramUsername: username, name: name, queryType: 'General', status: 'New', reportedInDailyEmail: false });
    return;
  }
  
  // 3. DETECT PHONE NUMBER
  const phoneRegex = /\b\d{10}\b/;
  if (phoneRegex.test(messageText)) {
    const phone = messageText.match(phoneRegex)?.[0];
    let extractedDate = rawMessageText.replace(phoneRegex, "").trim();
    if (extractedDate.length < 2) extractedDate = "Date not specified";

    await dmText(senderId, `✅ Thank you! We have noted your appointment details. We'll be waiting for you! 💛\n\n📍 Location: 312 Kuvempu Road, Kengeri, Bengaluru\n🗺️ Map: https://maps.app.goo.gl/U1shqm6TSeJFTNvi6\n📞 Contact: +91 9876543210`, config);
    
    const existingLead = await client.fetch(`*[_type == "lead" && instagramUsername == $username] | order(_createdAt desc)[0]`, { username });
    if (existingLead) {
      await writeClient.patch(existingLead._id).set({ phoneNumber: phone, visitDate: extractedDate }).commit();
    }
    return;
  }

  // 4. CHECK DYNAMIC FAQs
  const faqs = await getFaqs();
  for (const faq of faqs) {
    if (faq.keyword && messageText.includes(faq.keyword.toLowerCase())) {
      await dmText(senderId, faq.response, config);
      return;
    }
  }

  // 5. PRICE CHECK
  const replyToStory = event.message?.reply_to?.story;
  let sharedMediaId = null;
  const hasAttachment = event.message?.attachments && event.message.attachments.length > 0;
  if (hasAttachment) {
    const attachment = event.message.attachments[0];
    if (config.platform === "instagram" && (attachment.type === 'ig_post' || attachment.type === 'ig_reel' || attachment.type === 'share')) {
      sharedMediaId = attachment.payload?.ig_post_media_id || attachment.payload?.ig_reel_media_id || attachment.payload?.id;
    } else if (config.platform === "facebook" && (attachment.type === 'fallback' || attachment.type === 'share' || attachment.type === 'video' || attachment.type === 'post')) {
      let fbPayloadId = attachment.payload?.id || attachment.payload?.url;
      if (fbPayloadId) {
        fbPayloadId = String(fbPayloadId);
        if (!fbPayloadId.includes("_") && !fbPayloadId.includes("http")) {
          fbPayloadId = `${config.botId}_${fbPayloadId}`;
        }
      }
      sharedMediaId = fbPayloadId || null;
    }
  }

  const mediaId = replyToStory?.id || sharedMediaId;

  if (messageText.includes("price") || mediaId) {
    let product = null;
    if (mediaId) {
      product = await getProduct(mediaId);
    }

    const rates = await getRates();
    
    let dmMessage = "";
    if (product) {
      dmMessage = buildProductDmMessage(product, rates);
    } else if (mediaId || hasAttachment) {
      let isOurPost = false;
      if (mediaId && config.platform === "instagram") {
        try {
          const mediaRes = await fetch(`${baseUrl}/v25.0/${mediaId}?access_token=${config.token}`);
          if (mediaRes.ok) isOurPost = true;
        } catch {
          // ignore error
        }
      } else if (config.platform === "facebook") {
          isOurPost = true; // Assume FB attachment is our post for now to prompt fallback
      }

      if (isOurPost) {
        dmMessage = "👋 Hey there! You've shared one of our pieces! 💛 However, the exact live price for this specific item hasn't been updated in our system yet.\n\nOur team is checking the details and will get back to you shortly, or you can leave your contact number here for immediate assistance!";
      } else {
        dmMessage = "Hmm, it looks like the post or reel you shared isn't recognized, or it might be a random post from another page! 😅\n\nPlease make sure you are sharing one of our official products so we can assist you. If this is our product, our team will get back to you shortly! 💛";
      }
    } else {
      dmMessage = buildProductDmMessage(null, rates);
    }

    await dmText(senderId, dmMessage, config);
    return;
  }
}

export async function processComment(change: Record<string, any>, config: BotConfig) {
  const value = change.value;
  if (!value) return;

  if (config.platform === "facebook") {
    if (value.item !== "comment" || value.verb !== "add") return;
  }

  const commentId = config.platform === "facebook" ? value.comment_id : value.id;
  const commenterUsername = (value.from?.username || value.from?.name || "");
  const commentText = (value.text || value.message || "").toLowerCase();
  let mediaId = config.platform === "facebook" ? value.post_id : value.media?.id;
  mediaId = mediaId ? String(mediaId) : null;

  if (value.from?.id === config.botId) return;

  console.log(`[${config.platform} handleComment] Received comment ${commentId} from ${commenterUsername}: "${commentText}" (mediaId: ${mediaId})`);

  if (commentText.includes("price")) {
    if (commentText.includes("sent to your dm") || commentText.includes("message requests")) return;

    if (commentId) {
      const replyMsg = commenterUsername
        ? `@${commenterUsername} ✨ We have sent the complete price breakdown to your DM! Please check your message requests. 💛`
        : `✨ We have sent the complete price breakdown to your DM! Please check your message requests. 💛`;
      await replyToComment(commentId, replyMsg, config);
      
      try {
        let product = null;
        if (mediaId) {
          product = await getProduct(mediaId);
        }
        
        const rates = await getRates();
        
        let dmMessage = "Hey there! 👋 You asked for the price on our recent post.";
        if (product) {
          dmMessage = buildProductDmMessage(product, rates);
        } else {
          dmMessage = "👋 Hey there! We are currently checking the exact live price for this specific item. Our team will get back to you shortly! 💛";
        }
        
        await sendDM({ comment_id: commentId }, { message: { text: dmMessage } }, config);
      } catch (err) {
        console.error(`[${config.platform} handleComment] DM to commenter skipped:`, err);
      }
    }
    return;
  }

  if (commentText.includes("location") || commentText.includes("where") || commentText.includes("address")) {
    if (commentText.includes("dm") || commentText.includes("message requests")) return; 
    
    if (commentId) {
      const replyMsg = commenterUsername
        ? `@${commenterUsername} ✨ Our store is in Bangalore! I have sent you a DM with the exact address and map link. 💛`
        : `✨ Our store is in Bangalore! I have sent you a DM with the exact address and map link. 💛`;
      await replyToComment(commentId, replyMsg, config);
      
      try {
        const dmMessage = "📍 Our flagship store is located at: 123 Gold Market Road, Bangalore.\n\nWe'd love to host you! Could you please share your phone number here in the chat so we can book a VIP store visit for you? 💛";
        await sendDM({ comment_id: commentId }, { message: { text: dmMessage } }, config);
        
        await writeClient.create({ _type: 'lead', instagramUsername: commenterUsername, name: commenterUsername, queryType: 'General', status: 'New', reportedInDailyEmail: false });
      } catch (err) {
        console.error(`[${config.platform} handleComment] Location DM to commenter skipped:`, err);
      }
    }
    return;
  }
}
