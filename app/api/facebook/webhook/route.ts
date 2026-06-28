import { NextRequest, NextResponse, after } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { processDM, processComment, BotConfig } from "@/lib/botLogic";

const TOKEN = process.env.FACEBOOK_PAGE_ACCESS_TOKEN!;
const FB_ID = process.env.FACEBOOK_PAGE_ID!;
const APP_SECRET = process.env.FACEBOOK_APP_SECRET || "";

const botConfig: BotConfig = {
  platform: "facebook",
  token: TOKEN,
  botId: FB_ID
};

/* ════════════════════════════════════════
   SIGNATURE VERIFICATION
   Blocks any request that didn't come from Meta.
   Uses crypto.timingSafeEqual to prevent timing attacks.
════════════════════════════════════════ */
function verifyWebhookSignature(rawBody: string, signature: string | null): boolean {
  if (!APP_SECRET) return true;
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
    // Facebook sends large 18-digit IDs as unquoted numbers in some payloads (e.g. attachment.payload.id).
    // Native JSON.parse rounds numbers > 16 digits, destroying the exact ID.
    // This regex wraps any number >= 16 digits in quotes before parsing so it becomes a string.
    const safeRawBody = rawBody.replace(/:\s*(-?\d{16,})(?=[,\}\]])/g, ': "$1"');
    body = JSON.parse(safeRawBody);
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
        await processDM(event, botConfig).catch(e => console.error("FB DM handler error:", e));
      }

      for (const change of entry.changes || []) {
        if (change.field === "feed") { 
          // Facebook passes comments in 'feed' field rather than 'comments' (unlike Instagram)
          // Ensure we map it properly if the payload structure is standard
          await processComment(change, botConfig).catch(e => console.error("FB Comment handler error:", e));
        }
      }
    }
    console.log("[FB Background Queue] Finished processing events.");
  });

  return NextResponse.json({ status: "ok" });
}
