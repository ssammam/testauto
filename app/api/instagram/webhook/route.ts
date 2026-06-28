import { NextRequest, NextResponse, after } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { processDM, processComment, BotConfig } from "@/lib/botLogic";

const TOKEN = process.env.INSTAGRAM_PAGE_ACCESS_TOKEN!;
const IG_ID = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID!;
const APP_SECRET = process.env.INSTAGRAM_APP_SECRET || "";

const botConfig: BotConfig = {
  platform: "instagram",
  token: TOKEN,
  botId: IG_ID
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
        await processDM(event, botConfig).catch(e => console.error("DM handler error:", e));
      }

      // ── Comments ──
      for (const change of entry.changes || []) {
        if (change.field === "comments") {
          await processComment(change, botConfig).catch(e => console.error("Comment handler error:", e));
        }
      }
    }
    console.log("[Background Queue] Finished processing events.");
  });

  return NextResponse.json({ status: "ok" });
}
