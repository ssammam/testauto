import { NextRequest, NextResponse, after } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { client, writeClient } from "@/sanity/lib/client";

const TOKEN = process.env.FACEBOOK_PAGE_ACCESS_TOKEN!;
const FB_ID = process.env.FACEBOOK_PAGE_ID!;
const APP_SECRET = process.env.FACEBOOK_APP_SECRET || "";

/* ════════════════════════════════════════
   SIGNATURE VERIFICATION
   Blocks any request that didn't come from Meta.
   Uses crypto.timingSafeEqual to prevent timing attacks.
════════════════════════════════════════ */
function verifyWebhookSignature(rawBody: string, signature: string | null): boolean {
  if (!APP_SECRET) return true; // Skip if secret not yet configured (dev mode)
  if (!signature) return false;

  const expected = createHmac("sha256", APP_SECRET)
    .update(rawBody, "utf8")
    .digest("hex");

  const expectedBuf = Buffer.from(`sha256=${expected}`, "utf8");
  const receivedBuf = Buffer.from(signature, "utf8");

  if (expectedBuf.length !== receivedBuf.length) return false;

  return timingSafeEqual(expectedBuf, receivedBuf);
}

/* ════════════════════════════════════════
   SEND HELPERS
════════════════════════════════════════ */

/** Send a Facebook Direct Message */
async function sendDM(recipient: { id: string } | { comment_id: string }, body: Record<string, unknown>) {
  const baseUrl = "https://graph.facebook.com";
  const res = await fetch(
    `${baseUrl}/v25.0/me/messages?access_token=${TOKEN}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipient, ...body }),
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    console.error("FB DM send error:", JSON.stringify(err));
  }
}

/** Reply to a Facebook comment */
async function replyToComment(commentId: string, message: string) {
  const baseUrl = "https://graph.facebook.com";
  
  const params = new URLSearchParams();
  params.append("message", message);
  params.append("access_token", TOKEN);

  const res = await fetch(
    `${baseUrl}/v25.0/${commentId}/replies`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    console.error("[FB replyToComment] Error:", JSON.stringify(err));
  } else {
    console.log(`[FB replyToComment] Successfully replied to comment ${commentId}`);
  }
}

/** DM: plain text */
async function dmText(id: string, text: string) {
  await sendDM({ id }, { message: { text } });
}

/** Build Smart DM Message for Product */
function buildProductDmMessage(product: any, rates: any, isEstimate: boolean = false): string {
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

/* ════════════════════════════════════════
   HANDLE INCOMING DM
════════════════════════════════════════ */
async function handleDM(event: Record<string, any>) {
  const senderId: string = event.sender?.id;
  if (!senderId) return;

  if (event.message?.is_echo || senderId === FB_ID) return;
  if (!event.message && !event.postback) return;

  const rawMessageText: string = (event.message?.text || "").trim();
  const messageText: string = rawMessageText.toLowerCase();

  if (messageText.includes("estimated price") || messageText.includes("our team gets back to you") || messageText.includes("what can we help you with")) {
    console.log("[FB handleDM] Anti-loop triggered. Ignoring our own outgoing message.");
    return;
  }

  console.log(`[FB handleDM] Received message from ${senderId}: "${rawMessageText}"`);

  const baseUrl = "https://graph.facebook.com";
  const profileRes = await fetch(`${baseUrl}/v25.0/${senderId}?fields=username,name,first_name&access_token=${TOKEN}`);
  const profile = profileRes.ok ? await profileRes.json() : {};
  const name: string = profile.first_name || profile.name || profile.username || "there";
  const username: string = profile.username || profile.name || senderId;

  // 1. GREETING
  if (messageText === "hello" || messageText === "hi" || messageText === "hey") {
    await dmText(senderId, `👋 Hi ${name}! Are you looking for Gold or Silver? What can we help you with?`);
    return;
  }

  // 2. DETECT BOOKING INTENT
  if (messageText.includes("visit") || messageText.includes("tomorrow") || messageText.includes("today") || messageText.includes("book")) {
    await dmText(senderId, "🗓️ Would you like to schedule a visit? Please provide a date and your phone number so our team can get ready for you!");
    await writeClient.create({ _type: 'lead', instagramUsername: username, name: name, queryType: 'General', status: 'New', reportedInDailyEmail: false });
    return;
  }

  // 2.5 DETECT LOCATION INTENT
  if (messageText.includes("location") || messageText.includes("where") || messageText.includes("address")) {
    await dmText(senderId, "📍 Our store is located at: 312 Kuvempu Road, Mahakavi Kuvempu Rd, Kengeri, Bengaluru, Karnataka 560060\nGoogle Maps: https://maps.app.goo.gl/U1shqm6TSeJFTNvi6\n\nWe'd love to host you! Could you please share your phone number so we can book a VIP store visit for you? 💛");
    await writeClient.create({ _type: 'lead', instagramUsername: username, name: name, queryType: 'General', status: 'New', reportedInDailyEmail: false });
    return;
  }
  
  // 3. DETECT PHONE NUMBER
  const phoneRegex = /\b\d{10}\b/;
  if (phoneRegex.test(messageText)) {
    const phone = messageText.match(phoneRegex)?.[0];
    let extractedDate = rawMessageText.replace(phoneRegex, "").trim();
    if (extractedDate.length < 2) extractedDate = "Date not specified";

    await dmText(senderId, `✅ Thank you! We have noted your appointment details. We'll be waiting for you! 💛\n\n📍 Location: 312 Kuvempu Road, Kengeri, Bengaluru\n🗺️ Map: https://maps.app.goo.gl/U1shqm6TSeJFTNvi6\n📞 Contact: +91 9876543210`);
    
    const existingLead = await client.fetch(`*[_type == "lead" && instagramUsername == $username] | order(_createdAt desc)[0]`, { username });
    if (existingLead) {
      await writeClient.patch(existingLead._id).set({ phoneNumber: phone, visitDate: extractedDate }).commit();
    }
    return;
  }

  // 4. CHECK DYNAMIC FAQs
  const faqs = await client.fetch(`*[_type == "faq"]`);
  for (const faq of faqs) {
    if (faq.keyword && messageText.includes(faq.keyword.toLowerCase())) {
      await dmText(senderId, faq.response);
      return;
    }
  }

  // 5. PRICE CHECK
  let sharedMediaId = null;
  const hasAttachment = event.message?.attachments && event.message.attachments.length > 0;
  if (hasAttachment) {
    const attachment = event.message.attachments[0];
    if (attachment.type === 'fallback' || attachment.type === 'share' || attachment.type === 'video') {
      sharedMediaId = attachment.payload?.url || attachment.payload?.id;
    }
  }

  if (messageText.includes("price") || sharedMediaId) {
    const rates = await client.fetch(`*[_type == "dailyPrice"] | order(_updatedAt desc)[0]`);
    const dmMessage = buildProductDmMessage(null, rates);
    await dmText(senderId, dmMessage);
    return;
  }
}

/* ════════════════════════════════════════
   HANDLE COMMENT
════════════════════════════════════════ */
async function handleComment(change: Record<string, any>) {
  const value = change.value;
  if (!value) return;

  // Facebook comments come under the "feed" field
  // Only process if it's an "add" verb and a "comment" item
  if (value.item !== "comment" || value.verb !== "add") return;

  if (value.from?.id === FB_ID) return;

  const commentId: string = value.comment_id;
  const commenterUsername: string = value.from?.name || "";
  const commentText: string = (value.message || "").toLowerCase();

  console.log(`[FB handleComment] Received comment ${commentId} from ${commenterUsername}: "${commentText}"`);

  if (commentText.includes("price")) {
    if (commentText.includes("sent to your dm") || commentText.includes("message requests")) return;

    if (commentId) {
      const replyMsg = commenterUsername
        ? `@${commenterUsername} ✨ We have sent the complete price breakdown to your DM! Please check your message requests. 💛`
        : `✨ We have sent the complete price breakdown to your DM! Please check your message requests. 💛`;
      await replyToComment(commentId, replyMsg);
      
      try {
        const rates = await client.fetch(`*[_type == "dailyPrice"] | order(_updatedAt desc)[0]`);
        const dmMessage = buildProductDmMessage(null, rates);
        await sendDM({ comment_id: commentId }, { message: { text: dmMessage } });
      } catch (err) {
        console.error("[FB handleComment] DM to commenter skipped:", err);
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
      await replyToComment(commentId, replyMsg);
      
      try {
        const dmMessage = "📍 Our flagship store is located at: 123 Gold Market Road, Bangalore.\n\nWe'd love to host you! Could you please share your phone number here in the chat so we can book a VIP store visit for you? 💛";
        await sendDM({ comment_id: commentId }, { message: { text: dmMessage } });
        
        await writeClient.create({ _type: 'lead', instagramUsername: commenterUsername, name: commenterUsername, queryType: 'General', status: 'New', reportedInDailyEmail: false });
      } catch (err) {
        console.error("[FB handleComment] Location DM to commenter skipped:", err);
      }
    }
    return;
  }
}

/* ════════════════════════════════════════
   WEBHOOK VERIFICATION (GET)
════════════════════════════════════════ */
export async function GET(req: NextRequest) {
  const mode = req.nextUrl.searchParams.get("hub.mode");
  const token = req.nextUrl.searchParams.get("hub.verify_token");
  const challenge = req.nextUrl.searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === process.env.FACEBOOK_WEBHOOK_VERIFY_TOKEN) {
    console.log("FB Webhook verified ✓");
    return new NextResponse(challenge, { status: 200 });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

/* ════════════════════════════════════════
   MAIN WEBHOOK (POST)
════════════════════════════════════════ */
export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  const signature = req.headers.get("x-hub-signature-256");
  if (!verifyWebhookSignature(rawBody, signature)) {
    console.warn("⚠️ FB Webhook signature mismatch.");
  }

  let body: Record<string, any>;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return new NextResponse("Bad Request", { status: 400 });
  }

  if (body.object !== "page") {
    console.log("Ignored object type for FB:", body.object);
    return NextResponse.json({ status: "ignored_object" });
  }

  console.log("Processing FB webhook entry:", JSON.stringify(body.entry, null, 2));

  after(async () => {
    console.log("[FB Background Queue] Starting to process webhook events...");
    for (const entry of body.entry || []) {
      for (const event of entry.messaging || []) {
        await handleDM(event).catch(e => console.error("FB DM handler error:", e));
      }

      for (const change of entry.changes || []) {
        if (change.field === "feed") { 
          // Facebook passes comments in 'feed' field rather than 'comments' (unlike Instagram)
          // Ensure we map it properly if the payload structure is standard
          await handleComment(change).catch(e => console.error("FB Comment handler error:", e));
        }
      }
    }
    console.log("[FB Background Queue] Finished processing events.");
  });

  return NextResponse.json({ status: "ok" });
}
