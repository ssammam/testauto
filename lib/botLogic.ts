import { client, writeClient } from "@/sanity/lib/client";

export interface BotConfig {
  platform: "instagram" | "facebook" | "whatsapp";
  token: string;
  botId: string;
}

interface CacheItem<T> {
  data: T;
  expiresAt: number;
}

let faqsCache: CacheItem<any[]> | null = null;
const CACHE_TTL_MS = 1000 * 60 * 15; // 15 minutes cache for FAQs

async function getFaqs() {
  if (faqsCache && faqsCache.expiresAt > Date.now()) {
    return faqsCache.data;
  }
  const faqs = await client.fetch(`*[_type == "faq"]`);
  faqsCache = { data: faqs, expiresAt: Date.now() + CACHE_TTL_MS };
  return faqs;
}

async function getRates() {
  const rates = await client.fetch(`*[_type == "dailyPrice"] | order(_updatedAt desc)[0]`);
  return rates;
}

export function extractProductInfo(desc: string, currentCategory: string = "") {
  const descLower = (desc || "").toLowerCase();
  let updates: any = {};
  
  const karatMatch = descLower.match(/(22k|18k|24k)/i);
  if (karatMatch) {
    const k = karatMatch[1].toLowerCase();
    if (k === '18k') updates.materialType = 'gold18k';
    else if (k === '22k') updates.materialType = 'gold22k';
    else if (k === '24k') updates.materialType = 'gold24k';
  } else if (descLower.includes('silver')) {
    updates.materialType = 'silver';
  }

  const cats = ['ring', 'chain', 'bangle', 'bracelet', 'necklace', 'earring', 'pendant', 'choker', 'mangalsutra'];
  for (const cat of cats) {
    if (descLower.includes(cat)) {
      updates.category = cat + (cat.endsWith('s') ? '' : 's');
      break;
    }
  }

  let allWeights: number[] = [];

  // Find all ranges (e.g. 8-12 grams, 4 to 5 grams)
  const rangeRegex = /(?:weight|wt)?\s*:?-?\s*(\d+(?:\.\d+)?)\s*-?\s*(?:g|gm|gms|grams)?\s*(?:-|to)\s*(\d+(?:\.\d+)?)\s*-?\s*(?:g|gm|gms|grams)\b/gi;
  const rangeMatches = [...descLower.matchAll(rangeRegex)];
  for (const match of rangeMatches) {
    allWeights.push(parseFloat(match[1]));
    allWeights.push(parseFloat(match[2]));
  }

  // Find all single weights (e.g. 1.5 grams, 4 grams)
  const weightRegex = /(?:weight|wt)?\s*:?-?\s*(\d+(?:\.\d+)?)\s*-?\s*(?:g|gm|gms|grams)\b/gi;
  const singleMatches = [...descLower.matchAll(weightRegex)];
  for (const match of singleMatches) {
    allWeights.push(parseFloat(match[1]));
  }
  
  if (allWeights.length > 0) {
    const minW = Math.min(...allWeights);
    const maxW = Math.max(...allWeights);
    
    if (minW !== maxW) {
      updates.minWeightGrams = minW;
      updates.maxWeightGrams = maxW;
      updates.priceCalculationType = 'range';
    } else {
      updates.weightGrams = minW;
      updates.priceCalculationType = 'normal';
    }
    return updates;
  }

  // If no weight was found, it MUST be a draft so the admin can manually add the weight.
  updates.status = 'draft';
  updates.notes = 'Needs Manual Review - No weight detected from post caption.';
  return updates;
}

async function getProduct(mediaId: string, title: string | null = null) {
  const cleanMediaId = mediaId.includes('_') ? mediaId.split('_')[1] : mediaId;
  const shortcodeMatch = mediaId.match(/(?:p|reel|tv)\/([A-Za-z0-9_-]+)/);
  const shortcode = shortcodeMatch ? shortcodeMatch[1] : (mediaId.length <= 11 && !mediaId.includes('http') ? mediaId : null);

  let fbExtractedId = null;
  if (mediaId.includes('facebook.com') || mediaId.includes('fb.watch') || mediaId.includes('fb.com')) {
     const pfbidMatch = mediaId.match(/pfbid[a-zA-Z0-9]+/);
     if (pfbidMatch) {
       fbExtractedId = pfbidMatch[0];
     } else {
       const fbMatch = mediaId.match(/\d{10,}/);
       if (fbMatch) {
         fbExtractedId = fbMatch[0];
       }
     }
  }

  const product = await client.fetch(`*[_type == "productReel" && (reelId == $mediaId || fbPostId == $mediaId || reelId == $cleanMediaId || fbPostId == $cleanMediaId || sku match $mediaId || sku match $cleanMediaId || (shortcode != null && shortcode == $shortcode) || (fbPostId != null && fbPostId match $fbExtractedId) || (description != null && $title != null && description match $title))][0]`, { mediaId, cleanMediaId, shortcode: shortcode || '', fbExtractedId: fbExtractedId || '', title: title || '' });
  
  if (product && !product.weightGrams && !product.minWeightGrams && product.status !== 'draft') {
    const extracted = extractProductInfo(product.description || "", product.category || "");
    Object.assign(product, extracted);
    writeClient.patch(product._id).set(extracted).commit().catch(console.error);
  }

  return product;
}

export function buildProductDmMessage(product: any, rates: any, name: string = "there"): string {
  if (product) {
    if (product.status === 'sold') {
      return "This beautiful piece has already been sold! Please DM us to check for similar designs or to place a custom order. We are RH Jewellers Kengeri.";
    }

    const isUnpricedNormal = product.priceCalculationType === 'normal' && !product.isPriceLocked && (!product.weightGrams || product.weightGrams <= 0);
    const isUnpricedLocked = product.priceCalculationType === 'normal' && product.isPriceLocked && (!product.lockedPrice || product.lockedPrice <= 0);
    const isUnpricedRange = product.priceCalculationType === 'range' && (!product.minWeightGrams || !product.maxWeightGrams);
    const isDraft = product.status === 'draft' && product.notes?.includes('Manual Review');

    if (isUnpricedNormal || isUnpricedLocked || isUnpricedRange || isDraft) {
      const d = new Date();
      const dateSuffix = (d.getDate() % 10 === 1 && d.getDate() !== 11) ? 'st' : (d.getDate() % 10 === 2 && d.getDate() !== 12) ? 'nd' : (d.getDate() % 10 === 3 && d.getDate() !== 13) ? 'rd' : 'th';
      const dateStr = `${d.getDate()}${dateSuffix} ${d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`;
      
      let rateReply = `Here are our live rates as of ${dateStr}:\n`;
      if (rates?.goldRate24k) rateReply += `\n🔸 24K Gold: ₹${rates.goldRate24k.toLocaleString('en-IN')} per gram`;
      if (rates?.goldRate22k) rateReply += `\n🔸 22K Gold: ₹${rates.goldRate22k.toLocaleString('en-IN')} per gram`;
      if (rates?.goldRate18k) rateReply += `\n🔸 18K Gold: ₹${rates.goldRate18k.toLocaleString('en-IN')} per gram`;
      if (rates?.silverRate) rateReply += `\n🔸 Silver: ₹${rates.silverRate.toLocaleString('en-IN')} per kg`;

      return `Namaste, ${name},\n\nThis is our product.\n\n${rateReply}\n\nWe will get back to you as soon as possible. Please wait while we update the price. We are RH Jewellers Kengeri.`;
    }

    if (product.priceCalculationType === 'range') {
      const categoryName = product.category ? product.category.charAt(0).toUpperCase() + product.category.slice(1) : "Jewellery";
      const minW = product.minWeightGrams || 8;
      const maxW = product.maxWeightGrams || 50;
      const mc = product.makingCharges !== undefined ? product.makingCharges : 0;
      const wst = product.wastage !== undefined ? product.wastage : 10;

      const d = new Date();
      const dateSuffix = (d.getDate() % 10 === 1 && d.getDate() !== 11) ? 'st' : (d.getDate() % 10 === 2 && d.getDate() !== 12) ? 'nd' : (d.getDate() % 10 === 3 && d.getDate() !== 13) ? 'rd' : 'th';
      const dateStr = `${d.getDate()}${dateSuffix} ${d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`;
      const isSilver = product.materialType === 'silver';
      const rateText = isSilver ? "1 kg Silver" : "1 gram 22kt Gold";
      const rateVal = isSilver
        ? (rates?.silverRate ? `₹${rates.silverRate.toLocaleString('en-IN')}` : 'available upon request')
        : (rates?.goldRate22k ? `₹${rates.goldRate22k.toLocaleString('en-IN')}` : 'available upon request');
        
      const footerText = `✅ BIS Hallmarked & Certified\n\nContact: 9620741404\n\nPlease let us know what you're looking for, and we'll help you with detailed information about that product. We are RH Jewellers Kengeri.\n\n⚠️ Disclaimer:\nFinal price is based on the billing date's gold rate & ornament weight.`;

      return `Namaste, ${name},\n\nThank you for your interest in our ${categoryName} collection!\n\nMaking Charges: ${mc}%\nWastage: ${wst}%\n\nThe price of ${rateText} is ${rateVal} as on ${dateStr}.\nStarting Range for ${categoryName} are from ${minW}gms to ${maxW} gms.\n\n${footerText}`;
    }

    let totalPrice = 0;
    let rawGoldValue = 0;
    let makingChargeTotal = 0;
    let wastageTotal = 0;
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

      if (!ratePerGram) ratePerGram = rates?.goldRate22k || 0;

      const weight = product.weightGrams || 0;
      rawGoldValue = weight * ratePerGram;
      const wastagePercent = product.wastage !== undefined ? product.wastage : 10;
      wastageTotal = rawGoldValue * (wastagePercent / 100);
      
      const makingCharges = product.makingCharges || 0;
      if (product.makingChargeType === 'percentage') {
        makingChargeTotal = rawGoldValue * (makingCharges / 100);
      } else if (product.makingChargeType === 'per_gram') {
        makingChargeTotal = makingCharges * weight;
      } else {
        makingChargeTotal = makingCharges;
      }

      const basePrice = rawGoldValue + wastageTotal + makingChargeTotal;
      gst = basePrice * 0.03; // 3% GST
      totalPrice = Math.round(basePrice + gst);

      breakdownText = ``;
    }

    const d = new Date();
    const dateSuffix = (d.getDate() % 10 === 1 && d.getDate() !== 11) ? 'st' : (d.getDate() % 10 === 2 && d.getDate() !== 12) ? 'nd' : (d.getDate() % 10 === 3 && d.getDate() !== 13) ? 'rd' : 'th';
    const dateStr = `${d.getDate()}${dateSuffix} ${d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`;
    const isSilver = product.materialType === 'silver';
    const rateText = isSilver ? "1 kg Silver" : "1 gram 22kt Gold";
    const rateVal = isSilver
      ? (rates?.silverRate ? `₹${rates.silverRate.toLocaleString('en-IN')}` : 'available upon request')
      : (rates?.goldRate22k ? `₹${rates.goldRate22k.toLocaleString('en-IN')}` : 'available upon request');

    const isDefaultName = /^((FB )?Post \d+)$/i.test(product.name?.trim() || '');
    const catLabel = product.category ? product.category.charAt(0).toUpperCase() + product.category.slice(1) : 'Jewellery';
    const titleLine = isDefaultName ? `${catLabel}` : `${product.name}`;
    
    const footerText = `✅ BIS Hallmarked & Certified\n\nContact: 9620741404\n\nPlease let us know what you're looking for, and we'll help you with detailed information about that product. We are RH Jewellers Kengeri.\n\n⚠️ Disclaimer:\nFinal price is based on the billing date's gold rate & ornament weight.`;

    return `Namaste, ${name},\n\nThank you for your interest in our ${catLabel} collection!\n\nMaking Charges: ${product.makingCharges || 0}%\nWastage: ${product.wastage !== undefined ? product.wastage : 10}%\n\nThe price of ${rateText} is ${rateVal} as on ${dateStr}.\n\n${titleLine}\n${isSilver ? 'Silver' : 'Hallmarked Gold'}\nWeight: ${product.weightGrams}g\nTotal Price: ₹${totalPrice.toLocaleString('en-IN')}\n${product.isPriceLocked ? '*(Incl. GST)*\n\n' : '\n'}${footerText}`;
  }
  
  return `Namaste, ${name}! To give you the exact price, could you please share the reel, reply directly to the story, or comment on the post of the specific jewelry piece you're interested in? We are RH Jewellers Kengeri.\n\nOur team will check the details and get back to you with the exact live price!\n\n*(Note: Please avoid sending screenshots for price checks. Images are only used if you want to place a custom jewelry order.)*`;
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
  
  const fields = config.platform === "facebook" ? "name,first_name,last_name,profile_pic" : "name,username,profile_pic";
  try {
    const profileRes = await fetch(`${baseUrl}/v25.0/${senderId}?fields=${fields}&access_token=${config.token}`);
    if (profileRes.ok) {
      profile = await profileRes.json();
    }
  } catch (e) {
    console.error(`[${config.platform}] Failed to fetch profile for ${senderId}`, e);
  }

  let firstName = profile.first_name;
  if (!firstName && profile.name) {
    firstName = profile.name.split(" ")[0];
  }
  const name: string = firstName || profile.username || "there";
  const username: string = profile.username || profile.name || senderId;

  // 1. GREETING
  if (messageText === "hello" || messageText === "hi" || messageText === "hey" || messageText === "namaste") {
    await dmText(senderId, `Namaste, ${name}! Are you looking for Gold or Silver? What can we help you with? We are RH Jewellers Kengeri.`, config);
    return;
  }

  // 2. DETECT BOOKING INTENT
  if (messageText.includes("visit") || messageText.includes("tomorrow") || messageText.includes("today") || messageText.includes("book")) {
    await dmText(senderId, "Would you like to schedule a visit? Please provide a date and your phone number so our team can get ready for you! We are RH Jewellers Kengeri.", config);
    await writeClient.create({ _type: 'lead', instagramUsername: username, name: name, queryType: 'Store Visit', status: 'New', reportedInDailyEmail: false });
    return;
  }

  // 2.5 DETECT LOCATION / CONTACT INTENT
  if (messageText.includes("location") || messageText.includes("where") || messageText.includes("address") || messageText.includes("place") || messageText.includes("landmark") || messageText.includes("contact") || messageText.includes("phone") || messageText.includes("number") || messageText.includes("call")) {
    await dmText(senderId, `Namaste, ${name}\n\n📍Visit Our Store: \n312 Kuvempu Road, Mahakavi Kuvempu Rd, Kengeri, Bengaluru, Karnataka 560060\n\nContact: 9620741404\n\nGoogle Link:\nhttps://share.google/wfAwpsnVcIuq32IIx\n\nWe look forward to welcoming you! We are RH Jewellers Kengeri.`, config);
    await writeClient.create({ _type: 'lead', instagramUsername: username, name: name, queryType: 'Store Visit', status: 'New', reportedInDailyEmail: false });
    return;
  }

  // 2.6 DETECT OLD GOLD EXCHANGE
  if (messageText.includes("old gold") || messageText.includes("exchange")) {
    await dmText(senderId, `Namaste, ${name}\n\nYes, we take old gold! Please visit our store so you can exchange them for a brand new product!\n\n📍Visit Our Store: \n312 Kuvempu Road, Mahakavi Kuvempu Rd, Kengeri, Bengaluru, Karnataka 560060\nGoogle Link:\nhttps://share.google/wfAwpsnVcIuq32IIx\n\nWe look forward to welcoming you! We are RH Jewellers Kengeri.`, config);
    await writeClient.create({ _type: 'lead', instagramUsername: username, name: name, queryType: 'Old Gold Exchange', status: 'New', reportedInDailyEmail: false });
    return;
  }

  // 2.7 DETECT MAKING CHARGES / WASTAGE QUERY
  if (messageText.includes("making charges") || messageText.includes("making charge") || messageText.includes("mc") || messageText.includes("wastage") || messageText.includes("wasteage")) {
    await dmText(senderId, `Namaste, ${name}\n\nWastage is 10%, but Making Charges are 0! We don't charge for making! Visit us to buy jewelry.\n\n📍Visit Our Store: \n312 Kuvempu Road, Mahakavi Kuvempu Rd, Kengeri, Bengaluru, Karnataka 560060\nGoogle Link:\nhttps://share.google/wfAwpsnVcIuq32IIx\n\nWe are RH Jewellers Kengeri.`, config);
    return;
  }

  // 2.8 DETECT LIVE GOLD/SILVER RATE QUERY
  if (messageText.includes("rate") || messageText.includes("18k") || messageText.includes("22k") || messageText.includes("24k") || messageText.includes("silver") || messageText.includes("daily price") || messageText.includes("today price") || messageText.includes("today's price") || messageText.includes("todays price")) {
    const rates = await getRates();
    const d = new Date();
    const dateSuffix = (d.getDate() % 10 === 1 && d.getDate() !== 11) ? 'st' : (d.getDate() % 10 === 2 && d.getDate() !== 12) ? 'nd' : (d.getDate() % 10 === 3 && d.getDate() !== 13) ? 'rd' : 'th';
    const dateStr = `${d.getDate()}${dateSuffix} ${d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`;
    
    let rateReply = `Namaste, ${name}!\n\nHere are our live rates as of ${dateStr}:\n`;
    if (rates?.goldRate24k) rateReply += `\n🔸 24K Gold: ₹${rates.goldRate24k.toLocaleString('en-IN')} per gram`;
    if (rates?.goldRate22k) rateReply += `\n🔸 22K Gold: ₹${rates.goldRate22k.toLocaleString('en-IN')} per gram`;
    if (rates?.goldRate18k) rateReply += `\n🔸 18K Gold: ₹${rates.goldRate18k.toLocaleString('en-IN')} per gram`;
    if (rates?.silverRate) rateReply += `\n🔸 Silver: ₹${rates.silverRate.toLocaleString('en-IN')} per kg`;
    
    rateReply += `\n\nIs there a specific jewelry design you are looking for? We are RH Jewellers Kengeri.`;
    await dmText(senderId, rateReply, config);
    return;
  }

  // 3. DETECT PHONE NUMBER OR DATE (appointment booking)
  // Strip all non-digits to see if they provided a phone number
  const numbersOnly = messageText.replace(/\D/g, "");
  const providedPhone = numbersOnly.length >= 10 ? numbersOnly.slice(-10) : null;

  if (providedPhone || messageText.includes("monday") || messageText.includes("tuesday") || messageText.includes("wednesday") || messageText.includes("thursday") || messageText.includes("friday") || messageText.includes("saturday") || messageText.includes("sunday")) {
    let extractedDate = messageText.includes("day") ? rawMessageText : "Date not specified";

    await dmText(senderId, `Thank you! We have noted your appointment details. We'll be waiting for you!\n\n📍 Location: 312 Kuvempu Road, Kengeri, Bengaluru\nMap: https://share.google/wfAwpsnVcIuq32IIx\nContact: 9620741404\n\nWe are RH Jewellers Kengeri.`, config);
    
    // Check if we have a recent lead for this user and update it with the phone/date
    const existingLead = await client.fetch(`*[_type == "lead" && instagramUsername == $username] | order(_createdAt desc)[0]`, { username });
    if (existingLead) {
      const updatePhone = providedPhone || "Not provided";
      await writeClient.patch(existingLead._id).set({ phoneNumber: updatePhone, visitDate: extractedDate }).commit();
    }
    return;
  }

  // 4. CHECK DYNAMIC FAQs
  const faqs = await getFaqs();
  for (const faq of faqs) {
    if (faq.keyword && messageText.includes(faq.keyword.toLowerCase())) {
      const responseText = faq.response.replace(/First Name/gi, name).replace(/\{name\}/gi, name);
      await dmText(senderId, responseText, config);
      return;
    }
  }

  // 5. PRICE CHECK
  const replyToStory = event.message?.reply_to?.story;
  let sharedMediaId = null;
  let fbTitleFallback = null;
  const hasAttachment = event.message?.attachments && event.message.attachments.length > 0;
  if (hasAttachment) {
    const attachment = event.message.attachments[0];
    if (config.platform === "instagram" && (attachment.type === 'ig_post' || attachment.type === 'ig_reel' || attachment.type === 'share' || attachment.type === 'story_share')) {
      sharedMediaId = attachment.payload?.ig_post_media_id || attachment.payload?.ig_reel_media_id || attachment.payload?.share_id || attachment.payload?.id || attachment.payload?.url;
    } else if (config.platform === "facebook" && (attachment.type === 'fallback' || attachment.type === 'share' || attachment.type === 'video' || attachment.type === 'post' || attachment.type === 'reel' || attachment.type === 'ig_reel')) {
      let fbPayloadId = attachment.payload?.video_id || attachment.payload?.reel_video_id || attachment.payload?.post_id || attachment.payload?.reel_id || attachment.payload?.id || attachment.payload?.url;
      if (attachment.payload?.title) fbTitleFallback = attachment.payload.title;
      
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

  if (messageText.includes("price") || /\bpp\b/.test(messageText) || mediaId) {
    let product = null;
    if (mediaId) {
      product = await getProduct(mediaId, fbTitleFallback);
    }

    const rates = await getRates();
    
    let dmMessage = "";
    if (product) {
      dmMessage = buildProductDmMessage(product, rates, name);
    } else if (mediaId || hasAttachment) {
      let isOurPost = false;
      if (mediaId && !mediaId.startsWith("http")) {
        try {
          const mediaRes = await fetch(`${baseUrl}/v25.0/${mediaId}?access_token=${config.token}`);
          if (mediaRes.ok) {
            const mediaData = await mediaRes.json();
            if (!mediaData.error) {
              isOurPost = true;
            }
          }
        } catch {
          // ignore error
        }
      }

      if (isOurPost) {
        dmMessage = `Namaste, ${name},\n\nThis is our product. We will get back to you as soon as possible. Please wait while we update the price. We are RH Jewellers Kengeri.`;
      } else {
        dmMessage = `Namaste, ${name}! We see you've shared a beautiful piece!\n\nIf you are checking the price for a product from our collection, please share the exact post or reel with us. (If you replied to a story or sent a screenshot, please share the reel/post for exact valuation).\n\nIf it's a design from elsewhere, we specialize in custom jewelry and would love to craft a custom piece inspired by it for you! Please share your phone number, and our design expert will contact you shortly! We are RH Jewellers Kengeri.`;
        await writeClient.create({ _type: 'lead', instagramUsername: username, name: name, queryType: 'Custom Design', status: 'New', reportedInDailyEmail: false });
      }
    } else {
      dmMessage = buildProductDmMessage(null, rates, name);
    }

    await dmText(senderId, dmMessage, config);

    if (dmMessage.includes("We will get back to you as soon as possible. Please wait while we update the price.")) {
      await writeClient.create({ 
        _type: 'lead', 
        instagramUsername: username, 
        name: name, 
        queryType: 'Pending Price', 
        status: 'Pending Reply', 
        platform: config.platform,
        senderId: senderId,
        mediaId: mediaId,
        reportedInDailyEmail: false 
      });
    }

    return;
  }
}

export async function processComment(change: Record<string, any>, config: BotConfig) {
  const value = change.value;
  if (!value) return;

  if (config.platform === "facebook") {
    if (value.verb !== "add" || !value.comment_id) return;
  }

  const commentId = config.platform === "facebook" ? value.comment_id : value.id;
  const commenterUsername = (value.from?.username || value.from?.name || "");
  let commenterFirstName = "";
  if (value.from?.name) {
    commenterFirstName = value.from.name.split(" ")[0];
  } else if (value.from?.username) {
    commenterFirstName = value.from.username;
  }
  const commentText = (value.text || value.message || "").toLowerCase();
  let mediaId = config.platform === "facebook" ? (value.post_id || value.video_id) : value.media?.id;
  mediaId = mediaId ? String(mediaId) : null;

  if (value.from?.id === config.botId) return;

  console.log(`[${config.platform} handleComment] Received comment ${commentId} from ${commenterUsername}: "${commentText}" (mediaId: ${mediaId})`);

  if (commentText.includes("location") || commentText.includes("where") || commentText.includes("address") || commentText.includes("place") || commentText.includes("landmark")) {
    if (commentId) {
      const replyMsg = commenterUsername
        ? `@${commenterUsername} Namaste! We have sent our store location and details to your DM. We are RH Jewellers Kengeri.`
        : `Namaste! We have sent our store location and details to your DM. We are RH Jewellers Kengeri.`;
      await replyToComment(commentId, replyMsg, config);
      
      const dmMessage = `Namaste, ${commenterFirstName || "there"}\n\n📍Visit Our Store: \n312 Kuvempu Road, Mahakavi Kuvempu Rd, Kengeri, Bengaluru, Karnataka 560060\n\nContact: 9620741404\n\nGoogle Link:\nhttps://share.google/wfAwpsnVcIuq32IIx\n\nWe look forward to welcoming you! We are RH Jewellers Kengeri.`;
      
      await sendDM({ comment_id: commentId }, { message: { text: dmMessage } }, config);
      
      await writeClient.create({ 
        _type: 'lead', 
        instagramUsername: commenterUsername || commenterFirstName, 
        name: commenterFirstName || "there", 
        queryType: 'Store Visit', 
        status: 'New', 
        platform: config.platform, 
        senderId: value.from?.id, 
        commentId: commentId, 
        reportedInDailyEmail: false 
      });
    }
    return;
  }

  if (commentText.includes("rate") || commentText.includes("18k") || commentText.includes("22k") || commentText.includes("24k") || commentText.includes("silver") || commentText.includes("daily price") || commentText.includes("today price") || commentText.includes("today's price") || commentText.includes("todays price")) {
    if (commentId) {
      const replyMsg = commenterUsername
        ? `@${commenterUsername} Namaste! We have sent today's live rates to your DM. We are RH Jewellers Kengeri.`
        : `Namaste! We have sent today's live rates to your DM. We are RH Jewellers Kengeri.`;
      await replyToComment(commentId, replyMsg, config);
      
      const rates = await getRates();
      const d = new Date();
      const dateSuffix = (d.getDate() % 10 === 1 && d.getDate() !== 11) ? 'st' : (d.getDate() % 10 === 2 && d.getDate() !== 12) ? 'nd' : (d.getDate() % 10 === 3 && d.getDate() !== 13) ? 'rd' : 'th';
      const dateStr = `${d.getDate()}${dateSuffix} ${d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`;
      
      let rateReply = `Namaste, ${commenterFirstName || "there"}!\n\nHere are our live rates as of ${dateStr}:\n`;
      if (rates?.goldRate24k) rateReply += `\n🔸 24K Gold: ₹${rates.goldRate24k.toLocaleString('en-IN')} per gram`;
      if (rates?.goldRate22k) rateReply += `\n🔸 22K Gold: ₹${rates.goldRate22k.toLocaleString('en-IN')} per gram`;
      if (rates?.goldRate18k) rateReply += `\n🔸 18K Gold: ₹${rates.goldRate18k.toLocaleString('en-IN')} per gram`;
      if (rates?.silverRate) rateReply += `\n🔸 Silver: ₹${rates.silverRate.toLocaleString('en-IN')} per kg`;
      
      rateReply += `\n\nIs there a specific jewelry design you are looking for? We are RH Jewellers Kengeri.`;
      
      await sendDM({ comment_id: commentId }, { message: { text: rateReply } }, config);
    }
    return;
  }

  if (commentText.includes("price") || /\bpp\b/.test(commentText)) {
    if (commentText.includes("sent to your dm") || commentText.includes("message requests")) return;

    if (commentId) {
      const replyMsg = commenterUsername
        ? `@${commenterUsername} We have sent the complete price breakdown to your DM! Please check your message requests. We are RH Jewellers Kengeri.`
        : `We have sent the complete price breakdown to your DM! Please check your message requests. We are RH Jewellers Kengeri.`;
      await replyToComment(commentId, replyMsg, config);
      
      try {
        let product = null;
        if (mediaId) {
          product = await getProduct(mediaId);
        }
        
        const rates = await getRates();
        
        let dmMessage = `Namaste, ${commenterFirstName || "there"}! You asked for the price on our recent post. We are RH Jewellers Kengeri.`;
        if (product) {
          dmMessage = buildProductDmMessage(product, rates, commenterFirstName || "there");
        } else {
          dmMessage = `Namaste, ${commenterFirstName || "there"},\n\nThis is our product. We will get back to you as soon as possible. Please wait while we update the price. We are RH Jewellers Kengeri.`;
        }
        
        await sendDM({ comment_id: commentId }, { message: { text: dmMessage } }, config);

        if (dmMessage.includes("We will get back to you as soon as possible. Please wait while we update the price.")) {
          await writeClient.create({ 
            _type: 'lead', 
            instagramUsername: commenterUsername || commenterFirstName, 
            name: commenterFirstName || "there", 
            queryType: 'Pending Price', 
            status: 'Pending Reply', 
            platform: config.platform,
            senderId: value.from?.id,
            commentId: commentId,
            mediaId: mediaId,
            reportedInDailyEmail: false 
          });
        }
      } catch (err) {
        console.error(`[${config.platform} handleComment] DM to commenter skipped:`, err);
      }
    }
    return;
  }


}

async function sendWhatsAppMessage(to: string, text: string, config: BotConfig) {
  const res = await fetch(
    `https://graph.facebook.com/v20.0/${config.botId}/messages`,
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${config.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: to,
        type: "text",
        text: { preview_url: false, body: text }
      }),
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    console.error(`[WhatsApp] DM send error:`, JSON.stringify(err));
  }
}

export async function processWhatsAppMessage(message: any, contacts: any[], config: BotConfig) {
  const senderId = message.from; // WhatsApp phone number
  if (!senderId) return;

  const rawMessageText = message.type === 'text' ? (message.text?.body || "").trim() : "";
  const messageText = rawMessageText.toLowerCase();

  // ANTI-LOOP
  if (messageText.includes("estimated price") || messageText.includes("our team gets back to you") || messageText.includes("what can we help you with")) {
    return;
  }

  console.log(`[WhatsApp handleMessage] Received message from ${senderId}: "${rawMessageText}"`);

  // Extract name from contacts if available
  const contact = contacts.find((c: any) => c.wa_id === senderId);
  const name = contact?.profile?.name || "there";
  const username = senderId; // Phone number acts as username for WhatsApp leads

  // 2. DETECT BOOKING INTENT
  if (messageText.includes("visit") || messageText.includes("tomorrow") || messageText.includes("today") || messageText.includes("book")) {
    await sendWhatsAppMessage(senderId, "Would you like to schedule a visit? Please provide a date and confirm your phone number so our team can get ready for you! We are RH Jewellers Kengeri.", config);
    await writeClient.create({ _type: 'lead', instagramUsername: username, name: name, queryType: 'Store Visit', status: 'New', reportedInDailyEmail: false });
    return;
  }

  // 2.5 DETECT LOCATION INTENT
  if (messageText.includes("location") || messageText.includes("where") || messageText.includes("address") || messageText.includes("place") || messageText.includes("landmark")) {
    await sendWhatsAppMessage(senderId, `Namaste, ${name}\n\n📍Visit Our Store: \n312 Kuvempu Road, Mahakavi Kuvempu Rd, Kengeri, Bengaluru, Karnataka 560060\n\nContact: 9620741404\n\nGoogle Link:\nhttps://share.google/wfAwpsnVcIuq32IIx\n\nWe look forward to welcoming you! We are RH Jewellers Kengeri.`, config);
    await writeClient.create({ _type: 'lead', instagramUsername: username, name: name, queryType: 'Store Visit', status: 'New', reportedInDailyEmail: false });
    return;
  }
  
  // 3. DETECT PHONE NUMBER OR DATE (since senderId is already a phone number, they might just share a date)
  const phoneRegex = /\b\d{10}\b/;
  if (phoneRegex.test(messageText) || messageText.includes("monday") || messageText.includes("tuesday") || messageText.includes("wednesday") || messageText.includes("thursday") || messageText.includes("friday") || messageText.includes("saturday") || messageText.includes("sunday")) {
    let extractedDate = messageText.includes("day") ? rawMessageText : "Date not specified";

    await sendWhatsAppMessage(senderId, `Thank you! We have noted your appointment details. We'll be waiting for you!\n\n📍 Location: 312 Kuvempu Road, Kengeri, Bengaluru\nMap: https://share.google/wfAwpsnVcIuq32IIx\nContact: 9620741404\n\nWe are RH Jewellers Kengeri.`, config);
    
    const existingLead = await client.fetch(`*[_type == "lead" && instagramUsername == $username] | order(_createdAt desc)[0]`, { username });
    if (existingLead) {
      const updatePhone = phoneRegex.test(messageText) ? messageText.match(phoneRegex)?.[0] : senderId;
      await writeClient.patch(existingLead._id).set({ phoneNumber: updatePhone, visitDate: extractedDate }).commit();
    }
    return;
  }

  // 4. CHECK DYNAMIC FAQs
  const faqs = await getFaqs();
  for (const faq of faqs) {
    if (faq.keyword && messageText.includes(faq.keyword.toLowerCase())) {
      const responseText = faq.response.replace(/First Name/gi, name).replace(/\{name\}/gi, name);
      await sendWhatsAppMessage(senderId, responseText, config);
      return;
    }
  }

  // 5. PRICE CHECK (Unified for WhatsApp)
  let mediaId: string | null = null;
  const hasImage = message.type === 'image';

  if (message.type === "interactive" && message.interactive?.type === "product") {
    mediaId = message.interactive.product?.product_retailer_id || message.interactive.product?.product_id;
  }
  
  if (!mediaId) {
    const urlMatch = rawMessageText.match(/(?:instagram\.com\/(?:p|reel)\/|facebook\.com\/.*[?&]v=)([a-zA-Z0-9_-]+)/);
    if (urlMatch) {
      mediaId = urlMatch[1];
    } else if (messageText.includes("price") || messageText.includes("cost")) {
      const words = rawMessageText.split(/\s+/);
      const possibleSku = words.find((w: string) => /[a-zA-Z]/.test(w) && /[0-9]/.test(w) && w.length >= 3);
      if (possibleSku) mediaId = possibleSku;
    }
  }

  if (messageText.includes("price") || messageText.includes("cost") || mediaId || hasImage) {
    let product = null;
    if (mediaId) {
      product = await getProduct(mediaId);
    }

    const rates = await getRates();
    let dmMessage = "";

    if (product) {
      dmMessage = buildProductDmMessage(product, rates, name);
    } else if (mediaId || hasImage) {
      dmMessage = `Namaste, ${name},\n\nThis is our product. We will get back to you as soon as possible. Please wait while we update the price. We are RH Jewellers Kengeri.`;
    } else {
      dmMessage = `Namaste, ${name}! To give you the exact price, could you please share the reel link, product image, or the SKU of the specific jewelry piece you're interested in?\n\nOur team will check the details and get back to you with the exact live price! We are RH Jewellers Kengeri.`;
    }

    await sendWhatsAppMessage(senderId, dmMessage, config);

    if (dmMessage.includes("We will get back to you as soon as possible. Please wait while we update the price.")) {
      await writeClient.create({ 
        _type: 'lead', 
        instagramUsername: username, 
        name: name, 
        queryType: 'Pending Price', 
        status: 'Pending Reply', 
        platform: 'whatsapp',
        senderId: senderId,
        mediaId: mediaId,
        reportedInDailyEmail: false 
      });
    }

    return;
  }
}

export async function sendPendingReplies(product: any) {
  const leads = await client.fetch(`*[_type == "lead" && status == "Pending Reply" && mediaId != null]`);
  
  const matchingLeads = leads.filter((lead: any) => {
    return lead.mediaId === product.reelId || 
           lead.mediaId === product.fbPostId || 
           lead.mediaId === product.shortcode || 
           (product.sku && lead.mediaId === product.sku) ||
           (lead.mediaId.includes('_') && (lead.mediaId.split('_')[1] === product.reelId || lead.mediaId.split('_')[1] === product.fbPostId));
  });

  if (matchingLeads.length === 0) return;

  const rates = await getRates();

  for (const lead of matchingLeads) {
    const dmMessage = buildProductDmMessage(product, rates, lead.name);

    if (dmMessage.includes("We will get back to you as soon as possible")) continue;

    const config: BotConfig = {
      platform: lead.platform as 'instagram' | 'facebook' | 'whatsapp',
      token: lead.platform === 'instagram' ? process.env.INSTAGRAM_PAGE_ACCESS_TOKEN! : 
             lead.platform === 'facebook' ? process.env.FACEBOOK_PAGE_ACCESS_TOKEN! : 
             process.env.WHATSAPP_TOKEN!,
      botId: lead.platform === 'whatsapp' ? process.env.WHATSAPP_PHONE_NUMBER_ID! : 
             lead.platform === 'facebook' ? process.env.FACEBOOK_PAGE_ID! :
             process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID!
    };

    try {
      if (lead.platform === 'whatsapp') {
        // We'd need sendWhatsAppMessage, which is not exported, so let's use fetch directly
        await fetch(`https://graph.facebook.com/v20.0/${config.botId}/messages`, {
          method: "POST",
          headers: { "Authorization": `Bearer ${config.token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to: lead.senderId, type: "text", text: { body: dmMessage } })
        });
      } else if (lead.commentId) {
        // Send DM for comment
        const baseUrl = config.token.startsWith("IGAA") ? "https://graph.instagram.com" : "https://graph.facebook.com";
        await fetch(`${baseUrl}/v25.0/me/messages?access_token=${config.token}`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ recipient: { comment_id: lead.commentId }, message: { text: dmMessage } })
        });
      } else if (lead.senderId) {
        // Send DM
        const baseUrl = config.token.startsWith("IGAA") ? "https://graph.instagram.com" : "https://graph.facebook.com";
        await fetch(`${baseUrl}/v25.0/me/messages?access_token=${config.token}`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ recipient: { id: lead.senderId }, message: { text: dmMessage }, messaging_type: config.platform === 'facebook' ? "RESPONSE" : undefined })
        });
      }
      await writeClient.patch(lead._id).set({ status: 'Contacted' }).commit();
    } catch (e) {
      console.error("Failed to send pending reply for lead", lead._id, e);
    }
  }
}
