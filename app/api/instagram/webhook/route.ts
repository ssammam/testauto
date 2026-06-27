import { NextRequest, NextResponse, after } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { client, writeClient } from "@/sanity/lib/client";

const TOKEN = process.env.INSTAGRAM_PAGE_ACCESS_TOKEN!;
const IG_ID = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID!;
const APP_SECRET = process.env.INSTAGRAM_APP_SECRET || "";

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

/** Send an Instagram Direct Message */
async function sendDM(recipient: { id: string } | { comment_id: string }, body: Record<string, unknown>) {
  const baseUrl = TOKEN.startsWith("IGAA") ? "https://graph.instagram.com" : "https://graph.facebook.com";
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
    console.error("DM send error:", JSON.stringify(err));
  }
}

/** Reply to an Instagram comment */
async function replyToComment(commentId: string, message: string) {
  const baseUrl = TOKEN.startsWith("IGAA") ? "https://graph.instagram.com" : "https://graph.facebook.com";
  
  // The Graph API often prefers x-www-form-urlencoded for comment replies
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
    console.error("[replyToComment] Error:", JSON.stringify(err));
  } else {
    console.log(`[replyToComment] Successfully replied to comment ${commentId}`);
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
      else if (product.materialType === 'silver') ratePerGram = rates?.silverRate || 0;

      rawGoldValue = product.weightGrams * ratePerGram;
      
      if (product.makingChargeType === 'percentage') {
        makingChargeTotal = rawGoldValue * ((product.makingCharges || 0) / 100);
      } else if (product.makingChargeType === 'per_gram') {
        makingChargeTotal = (product.makingCharges || 0) * product.weightGrams;
      } else {
        makingChargeTotal = product.makingCharges || 0;
      }

      const basePrice = rawGoldValue + makingChargeTotal;
      gst = basePrice * 0.03; // 3% GST
      totalPrice = Math.round(basePrice + gst);

      let makingStr = "";
      if (product.makingChargeType === 'percentage') makingStr = `(${product.makingCharges}%)`;
      else if (product.makingChargeType === 'per_gram') makingStr = `(₹${product.makingCharges}/g)`;

      breakdownText = `\n🪙 Material Value: ₹${Math.round(rawGoldValue).toLocaleString('en-IN')}\n✨ Making Charges ${makingStr}: ₹${Math.round(makingChargeTotal).toLocaleString('en-IN')}\n⚖️ GST (3%): ₹${Math.round(gst).toLocaleString('en-IN')}\n`;
    }

    return `✨ ${product.name}
${product.materialType === 'silver' ? 'Silver' : 'Hallmarked Gold'}

⚖️ Weight: ${product.weightGrams}g
${product.sku ? `[SKU: ${product.sku}]` : ''}${breakdownText}
💰 Total Price: ₹${totalPrice.toLocaleString('en-IN')}
${product.isPriceLocked ? '*(Incl. making & 3% GST)*\n' : ''}
✓ BIS Hallmarked
✓ Certified
✓ Insured Shipping

Reply to this message to book an appointment or ask for similar designs! 💛`;
  }
  
  return "👋 Hey there! To give you the exact price, could you please share the reel, reply directly to the story, or comment on the post of the specific jewelry piece you're interested in? 💛\n\nOur team will check the details and get back to you with the exact live price!\n\n*(Note: Please avoid sending screenshots for price checks. Images are only used if you want to place a custom jewelry order.)*";
}

/* ════════════════════════════════════════
   HANDLE INCOMING DM
════════════════════════════════════════ */
async function handleDM(event: Record<string, any>) {
  const senderId: string = event.sender?.id;
  if (!senderId) return;

  if (event.message?.is_echo || senderId === IG_ID) return;
  if (!event.message && !event.postback) return;

  const rawMessageText: string = (event.message?.text || "").trim();
  const messageText: string = rawMessageText.toLowerCase();

  // ANTI-LOOP: If this message contains our own bot signatures, ignore it completely
  if (messageText.includes("estimated price") || messageText.includes("our team gets back to you") || messageText.includes("what can we help you with")) {
    console.log("[handleDM] Anti-loop triggered. Ignoring our own outgoing message.");
    return;
  }

  console.log(`[handleDM] Received message from ${senderId}: "${rawMessageText}"`);

  // Get sender profile for name
  const baseUrl = TOKEN.startsWith("IGAA") ? "https://graph.instagram.com" : "https://graph.facebook.com";
  const profileRes = await fetch(`${baseUrl}/v25.0/${senderId}?fields=username,name&access_token=${TOKEN}`);
  const profile = profileRes.ok ? await profileRes.json() : {};
  const name: string = profile.name || profile.username || "there";
  const username: string = profile.username || "";

  // 1. GREETING
  if (messageText === "hello" || messageText === "hi" || messageText === "hey") {
    await dmText(senderId, `👋 Hi ${name}! Are you looking for Gold or Silver? What can we help you with?`);
    return;
  }

  // 2. DETECT BOOKING INTENT (date/time/visit)
  if (messageText.includes("visit") || messageText.includes("tomorrow") || messageText.includes("today") || messageText.includes("book")) {
    await dmText(senderId, "🗓️ Would you like to schedule a visit? Please provide a date, time, and your phone number so our team can get ready for you!");
    
    // Save lead as New
    await writeClient.create({
      _type: 'lead',
      instagramUsername: username,
      name: name,
      queryType: 'General',
      status: 'New',
      reportedInDailyEmail: false
    });
    return;
  }

  // 2.5 DETECT LOCATION INTENT
  if (messageText.includes("location") || messageText.includes("where") || messageText.includes("address")) {
    await dmText(senderId, "📍 Our flagship store is located at: 123 Gold Market Road, Bangalore.\n\nWe'd love to host you! Could you please share your phone number so we can book a VIP store visit for you? 💛");
    
    // Save lead as New
    await writeClient.create({
      _type: 'lead',
      instagramUsername: username,
      name: name,
      queryType: 'General',
      status: 'New',
      reportedInDailyEmail: false
    });
    return;
  }
  
  // 3. DETECT PHONE NUMBER
  const phoneRegex = /\b\d{10}\b/;
  if (phoneRegex.test(messageText)) {
    const phone = messageText.match(phoneRegex)?.[0];
    await dmText(senderId, `✅ Thank you! We have noted your number (${phone}). We'll be ready for your visit.`);
    
    // Update lead with phone number
    const existingLead = await client.fetch(`*[_type == "lead" && instagramUsername == $username] | order(_createdAt desc)[0]`, { username });
    if (existingLead) {
      await writeClient.patch(existingLead._id).set({ phoneNumber: phone }).commit();
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

  // 5. PRICE CHECK (From Story Reply OR general DM)
  const replyToStory = event.message?.reply_to?.story;
  if (messageText.includes("price")) {
    const reelId = replyToStory?.id;
    
    let dmMessage = replyToStory 
      ? "Hey there! 👋 You asked for the price of the item in our story."
      : "Hey there! 👋 You asked for a price estimate.";

    let product = null;
    if (reelId) {
      // Fetch product details based on reelId
      product = await client.fetch(`*[_type == "productReel" && reelId == $reelId][0]`, { reelId });
    }

    // Fetch today's rates
    const rates = await client.fetch(`*[_type == "dailyPrice"] | order(date desc)[0]`);
    
    if (product || rates) {
      dmMessage = buildProductDmMessage(product, rates);
    } else {
      dmMessage = "Thank you for asking! 💛 Please wait a moment while our team gets back to you with the exact pricing for this item.";
    }

    console.log(`[handleDM] Triggering dmText to ${senderId}. Calculated dmMessage length: ${dmMessage.length}`);
    await dmText(senderId, dmMessage);
    return;
  } else {
    console.log(`[handleDM] Message didn't match any keyword. messageText: "${messageText}"`);
  }
}

/* ════════════════════════════════════════
   HANDLE COMMENT
════════════════════════════════════════ */
async function handleComment(change: Record<string, any>) {
  const value = change.value;
  if (!value) return;

  // Ignore replies to our own comments
  if (value.from?.id === IG_ID) return;

  const commentId: string = value.id;
  const commenterUsername: string = value.from?.username || "";
  const commentText: string = (value.text || "").toLowerCase();
  const mediaId: string = value.media?.id;

  console.log(`[handleComment] Received comment ${commentId} from ${commenterUsername}: "${commentText}" (mediaId: ${mediaId})`);

  // 👉 Comment Price Inquiry
  if (commentText.includes("price")) {
    
    // ANTI-LOOP: Prevent bot from replying to its own comment if IG_ID is wrong
    if (commentText.includes("sent to your dm") || commentText.includes("message requests")) {
      console.log("[handleComment] Anti-loop triggered. Ignoring our own comment.");
      return;
    }

    if (commentId) {
      // 1. Reply to the comment mentioning the user
      const replyMsg = commenterUsername
        ? `@${commenterUsername} ✨ We have sent the complete price breakdown to your DM! Please check your message requests. 💛`
        : `✨ We have sent the complete price breakdown to your DM! Please check your message requests. 💛`;
      await replyToComment(commentId, replyMsg);
      
      // 2. Calculate price and send via Private DM
      try {
        let dmMessage = "Hey there! 👋 You asked for the price on our recent post.";
        let product = null;
        if (mediaId) {
          // Fetch product details based on mediaId (reelId)
          product = await client.fetch(`*[_type == "productReel" && reelId == $mediaId][0]`, { mediaId });
        }

        const rates = await client.fetch(`*[_type == "dailyPrice"] | order(date desc)[0]`);

        if (product || rates) {
          dmMessage = buildProductDmMessage(product, rates);
        } else {
          dmMessage += " Please reply to this message and our team will get back to you with the exact live price for that item!";
        }

        // Send private reply using comment_id
        console.log(`[handleComment] Sending private reply for comment ${commentId}`);
        await sendDM({ comment_id: commentId }, { message: { text: dmMessage } });
      } catch (err) {
        console.error("[handleComment] DM to commenter skipped:", err);
      }
    }
    return;
  }

  // 👉 Comment Location Inquiry
  if (commentText.includes("location") || commentText.includes("where") || commentText.includes("address")) {
    if (commentText.includes("dm") || commentText.includes("message requests")) return; // Anti-loop
    
    if (commentId) {
      const replyMsg = commenterUsername
        ? `@${commenterUsername} ✨ Our store is in Bangalore! I have sent you a DM with the exact address and map link. 💛`
        : `✨ Our store is in Bangalore! I have sent you a DM with the exact address and map link. 💛`;
      await replyToComment(commentId, replyMsg);
      
      try {
        const dmMessage = "📍 Our flagship store is located at: 123 Gold Market Road, Bangalore.\n\nWe'd love to host you! Could you please share your phone number here in the chat so we can book a VIP store visit for you? 💛";
        await sendDM({ comment_id: commentId }, { message: { text: dmMessage } });
        
        // Save lead
        await writeClient.create({
          _type: 'lead',
          instagramUsername: commenterUsername,
          name: commenterUsername,
          queryType: 'General',
          status: 'New',
          reportedInDailyEmail: false
        });
      } catch (err) {
        console.error("[handleComment] Location DM to commenter skipped:", err);
      }
    }
    return;
  } else {
    console.log(`[handleComment] Comment didn't match price keywords. Text: "${commentText}"`);
  }
}

/* ════════════════════════════════════════
   WEBHOOK VERIFICATION (GET)
════════════════════════════════════════ */
export async function GET(req: NextRequest) {
  const mode = req.nextUrl.searchParams.get("hub.mode");
  const token = req.nextUrl.searchParams.get("hub.verify_token");
  const challenge = req.nextUrl.searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN) {
    console.log("Webhook verified ✓");
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
    console.warn("⚠️ Webhook signature mismatch. (Allowing request temporarily for debugging)");
    // return new NextResponse("Forbidden", { status: 403 });
  }

  let body: Record<string, any>;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return new NextResponse("Bad Request", { status: 400 });
  }

  if (body.object !== "instagram" && body.object !== "page") {
    console.log("Ignored object type:", body.object);
    return NextResponse.json({ status: "ignored_object" });
  }

  console.log("Processing webhook entry:", JSON.stringify(body.entry, null, 2));

  // Use Next.js 'after' to process tasks in the background!
  // This instantly returns 200 OK to Meta so we NEVER hit Meta's timeout deadline,
  // even if 200 comments come in at once.
  after(async () => {
    console.log("[Background Queue] Starting to process webhook events...");
    for (const entry of body.entry || []) {
      // ── DMs ──
      for (const event of entry.messaging || []) {
        await handleDM(event).catch(e => console.error("DM handler error:", e));
      }

      // ── Comments ──
      for (const change of entry.changes || []) {
        if (change.field === "comments") {
          await handleComment(change).catch(e => console.error("Comment handler error:", e));
        }
      }
    }
    console.log("[Background Queue] Finished processing events.");
  });

  return NextResponse.json({ status: "ok" });
}
