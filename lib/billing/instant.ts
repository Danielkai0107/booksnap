import { randomUUID } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadPlanConfigs } from "@/lib/plans";
import type { OrgPlan, SubscriptionRow } from "@/lib/supabase/types";
import { applyGatewayEvent, writeAuditLog } from "./apply";
import type {
  CreateSubscriptionInput,
  CreateSubscriptionResult,
  GatewayEvent,
  PaymentGateway,
} from "./gateway";

/**
 * First-party "click-to-upgrade" provider. There is no external API call and
 * no checkout redirect — pressing "Subscribe" treats payment as instantly
 * successful, writes the subscription/payment/audit rows, and bounces the
 * user back to `/billing?welcome=1`.
 *
 * We deliberately model it after a real gateway:
 *  - `createSubscription` builds an `activated` GatewayEvent and routes it
 *    through `applyGatewayEvent`, the same code path a real webhook would
 *    use. When we plug in ECPay / JKoPay later, the entire downstream
 *    pipeline (DB writes, audit log, admin views) is already exercised.
 *  - `cancelAtPeriodEnd` / `resume` mutate the local row directly because
 *    there is no remote state to sync.
 *  - `verifyAndParseWebhook` is a no-op; we don't receive webhooks.
 */
class InstantGateway implements PaymentGateway {
  readonly name = "instant";

  async createSubscription(
    input: CreateSubscriptionInput,
  ): Promise<CreateSubscriptionResult> {
    const gatewaySubId = randomUUID();
    const now = new Date();
    const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const { prices } = await loadPlanConfigs();

    const event: GatewayEvent = {
      kind: "activated",
      gatewaySubId,
      orgId: input.orgId,
      plan: input.plan,
      periodStart: now.toISOString(),
      periodEnd: periodEnd.toISOString(),
      payment: {
        gatewayPaymentId: `instant_${gatewaySubId}`,
        amount: prices[input.plan].monthly,
      },
      rawPayload: {
        gateway: "instant",
        note: "Auto-activated by InstantGateway (no real payment)",
      },
    };

    await applyGatewayEvent(event, {
      gateway: this.name,
      actorRole: "unit",
    });

    return {
      redirectUrl: input.successUrl,
      gatewaySubId,
    };
  }

  async cancelAtPeriodEnd(gatewaySubId: string): Promise<void> {
    const admin = createAdminClient();
    const { data: sub } = await admin
      .from("subscriptions")
      .select("*")
      .eq("gateway_sub_id", gatewaySubId)
      .maybeSingle();
    const row = sub as SubscriptionRow | null;
    if (!row) {
      throw new Error("subscription not found");
    }
    const { error } = await admin
      .from("subscriptions")
      .update({
        cancel_at_period_end: true,
        cancelled_at: new Date().toISOString(),
        scheduled_plan: "free",
      })
      .eq("id", row.id);
    if (error) throw error;

    await writeAuditLog(admin, {
      actor_id: null,
      actor_role: "unit",
      action: "sub.scheduled.free",
      target_org_id: row.organization_id,
      meta: {
        gateway: this.name,
        from_plan: row.plan,
        period_end: row.current_period_end,
      },
    });
  }

  async resume(gatewaySubId: string): Promise<void> {
    const admin = createAdminClient();
    const { data: sub } = await admin
      .from("subscriptions")
      .select("*")
      .eq("gateway_sub_id", gatewaySubId)
      .maybeSingle();
    const row = sub as SubscriptionRow | null;
    if (!row) {
      throw new Error("subscription not found");
    }
    const { error } = await admin
      .from("subscriptions")
      .update({
        cancel_at_period_end: false,
        cancelled_at: null,
        scheduled_plan: null,
      })
      .eq("id", row.id);
    if (error) throw error;

    await writeAuditLog(admin, {
      actor_id: null,
      actor_role: "unit",
      action: "sub.scheduled.cleared",
      target_org_id: row.organization_id,
      meta: {
        gateway: this.name,
        from_scheduled_plan: row.scheduled_plan,
      },
    });
  }

  async schedulePlanChange(
    gatewaySubId: string,
    targetPlan: Exclude<OrgPlan, "free"> | null,
  ): Promise<void> {
    const admin = createAdminClient();
    const { data: sub } = await admin
      .from("subscriptions")
      .select("*")
      .eq("gateway_sub_id", gatewaySubId)
      .maybeSingle();
    const row = sub as SubscriptionRow | null;
    if (!row) {
      throw new Error("subscription not found");
    }

    // If user re-selects their current plan, treat it as "keep current"
    // (clear any pending change). Otherwise pre-arrange the switch.
    const nextScheduled =
      targetPlan === null || targetPlan === row.plan ? null : targetPlan;

    const { error } = await admin
      .from("subscriptions")
      .update({
        scheduled_plan: nextScheduled,
        cancel_at_period_end: false,
        cancelled_at: null,
      })
      .eq("id", row.id);
    if (error) throw error;

    await writeAuditLog(admin, {
      actor_id: null,
      actor_role: "unit",
      action:
        nextScheduled === null ? "sub.scheduled.cleared" : "sub.scheduled.switch",
      target_org_id: row.organization_id,
      meta: {
        gateway: this.name,
        from_plan: row.plan,
        target_plan: nextScheduled,
        period_end: row.current_period_end,
      },
    });
  }

  async verifyAndParseWebhook(): Promise<GatewayEvent | null> {
    return null;
  }
}

export const instantGateway = new InstantGateway();
