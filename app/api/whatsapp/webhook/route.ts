import { NextRequest, NextResponse, after } from "next/server";
import { processWhatsAppMessage, BotConfig } from "@/lib/botLogic";

const TOKEN = process.env.WHATSAPP_ACCESS_TOKEN!;
const WA_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID!;
const VERIFY_TOKEN = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN!;

const botConfig: BotConfig = {
  platform: "whatsapp",
  token: TOKEN,
  botId: WA_PHONE_NUMBER_ID
};

/* ════════════════════════════════════════
   WEBHOOK VERIFICATION (GET)
════════════════════════════════════════ */
export async function GET(req: NextRequest) {
  const mode = req.nextUrl.searchParams.get("hub.mode");
  const token = req.nextUrl.searchParams.get("hub.verify_token");
  const challenge = req.nextUrl.searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("WhatsApp Webhook verified ✓");
    return new NextResponse(challenge, { status: 200 });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

/* ════════════════════════════════════════
   MAIN WEBHOOK (POST)
════════════════════════════════════════ */
export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return new NextResponse("Bad Request", { status: 400 });
  }

  if (body.object !== "whatsapp_business_account") {
    console.log("Ignored object type for WhatsApp:", body.object);
    return NextResponse.json({ status: "ignored_object" });
  }

  console.log("Processing WhatsApp webhook entry:", JSON.stringify(body.entry, null, 2));

  after(async () => {
    console.log("[WhatsApp Background Queue] Starting to process webhook events...");
    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        if (change.field === "messages" && change.value?.messages) {
          const contacts = change.value.contacts || [];
          for (const message of change.value.messages) {
            await processWhatsAppMessage(message, contacts, botConfig).catch(e => console.error("WhatsApp Message handler error:", e));
          }
        }
      }
    }
    console.log("[WhatsApp Background Queue] Finished processing events.");
  });

  return NextResponse.json({ status: "ok" });
}
