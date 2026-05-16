import { NextResponse } from "next/server";
import { applyGatewayEvent } from "@/lib/billing/apply";
import { getGateway } from "@/lib/billing";

export const runtime = "nodejs";

/**
 * Webhook entry point. The active gateway is responsible for verifying the
 * signature and decoding the body; if it returns `null` we 404.
 *
 * InstantGateway never produces real webhooks, so this route is effectively a
 * placeholder while we're on the click-to-upgrade stub. Once we ship a real
 * provider (ECPay / JKoPay), `getGateway().verifyAndParseWebhook` will start
 * returning events and the rest of the pipeline already handles them.
 */
export async function POST(req: Request) {
  let event;
  try {
    event = await getGateway().verifyAndParseWebhook(req);
  } catch (err) {
    console.error("[billing/webhook] verify error", err);
    return NextResponse.json(
      { error: "invalid_webhook" },
      { status: 400 },
    );
  }
  if (!event) {
    return NextResponse.json({ ignored: true }, { status: 200 });
  }
  try {
    const sub = await applyGatewayEvent(event, {
      gateway: getGateway().name,
      actorRole: "system",
    });
    return NextResponse.json({ ok: true, subscriptionId: sub?.id ?? null });
  } catch (err) {
    console.error("[billing/webhook] apply error", err, event);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "apply_error" },
      { status: 500 },
    );
  }
}
