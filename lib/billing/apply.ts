import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  AuditActorRole,
  SubscriptionRow,
} from "@/lib/supabase/types";
import type { GatewayEvent } from "./gateway";

/**
 * Single point that mutates subscriptions / payments / audit_logs based on a
 * gateway event. Every flow — InstantGateway inline activation, real webhook,
 * test fixtures — funnels through here, so we only have one place to evolve
 * when the state machine changes.
 *
 * Returns the resulting subscription row, or `null` if the event referenced an
 * unknown `gatewaySubId` (and `activated` couldn't backfill it because no
 * `orgId` was provided).
 */
export async function applyGatewayEvent(
  event: GatewayEvent,
  context: {
    gateway: string;
    actorId?: string | null;
    actorRole?: AuditActorRole;
    client?: SupabaseClient;
  },
): Promise<SubscriptionRow | null> {
  const admin = context.client ?? createAdminClient();
  const actorRole: AuditActorRole = context.actorRole ?? "system";
  const actorId = context.actorId ?? null;

  if (event.kind === "activated") {
    const { data: existing } = await admin
      .from("subscriptions")
      .select("*")
      .eq("organization_id", event.orgId)
      .maybeSingle();

    const startedAt = (existing as SubscriptionRow | null)?.started_at ??
      event.periodStart;

    const upsertPayload = {
      organization_id: event.orgId,
      plan: event.plan,
      status: "active" as const,
      gateway: context.gateway,
      gateway_sub_id: event.gatewaySubId,
      started_at: startedAt,
      current_period_start: event.periodStart,
      current_period_end: event.periodEnd,
      cancel_at_period_end: false,
      cancelled_at: null,
      scheduled_plan: null,
    };

    const { data: updated, error } = await admin
      .from("subscriptions")
      .upsert(upsertPayload, { onConflict: "organization_id" })
      .select("*")
      .single();
    if (error) throw error;

    const sub = updated as SubscriptionRow;

    await admin.from("payments").insert({
      organization_id: event.orgId,
      subscription_id: sub.id,
      gateway: context.gateway,
      gateway_payment_id: event.payment.gatewayPaymentId,
      amount: event.payment.amount,
      status: "succeeded",
      period_start: event.periodStart,
      period_end: event.periodEnd,
      raw_payload: event.rawPayload ?? null,
    });

    await writeAuditLog(admin, {
      actor_id: actorId,
      actor_role: actorRole,
      action: "sub.created",
      target_org_id: event.orgId,
      meta: {
        plan: event.plan,
        gateway: context.gateway,
        period_start: event.periodStart,
        period_end: event.periodEnd,
      },
    });

    return sub;
  }

  if (event.kind === "renewed") {
    const sub = await findByGatewaySubId(admin, event.gatewaySubId);
    if (!sub) return null;
    const { data: updated, error } = await admin
      .from("subscriptions")
      .update({
        status: "active",
        current_period_start: event.periodStart,
        current_period_end: event.periodEnd,
      })
      .eq("id", sub.id)
      .select("*")
      .single();
    if (error) throw error;
    await admin.from("payments").insert({
      organization_id: sub.organization_id,
      subscription_id: sub.id,
      gateway: context.gateway,
      gateway_payment_id: event.payment.gatewayPaymentId,
      amount: event.payment.amount,
      status: "succeeded",
      period_start: event.periodStart,
      period_end: event.periodEnd,
      raw_payload: event.rawPayload ?? null,
    });
    await writeAuditLog(admin, {
      actor_id: actorId,
      actor_role: actorRole,
      action: "sub.renewed",
      target_org_id: sub.organization_id,
      meta: {
        plan: sub.plan,
        period_start: event.periodStart,
        period_end: event.periodEnd,
      },
    });
    return updated as SubscriptionRow;
  }

  if (event.kind === "payment_failed") {
    const sub = await findByGatewaySubId(admin, event.gatewaySubId);
    if (!sub) return null;
    const { data: updated, error } = await admin
      .from("subscriptions")
      .update({ status: "past_due" })
      .eq("id", sub.id)
      .select("*")
      .single();
    if (error) throw error;
    await admin.from("payments").insert({
      organization_id: sub.organization_id,
      subscription_id: sub.id,
      gateway: context.gateway,
      gateway_payment_id: null,
      amount: 0,
      status: "failed",
      raw_payload: event.rawPayload ?? null,
    });
    await writeAuditLog(admin, {
      actor_id: actorId,
      actor_role: actorRole,
      action: "sub.payment_failed",
      target_org_id: sub.organization_id,
      meta: { reason: event.reason },
    });
    return updated as SubscriptionRow;
  }

  if (event.kind === "cancelled") {
    const sub = await findByGatewaySubId(admin, event.gatewaySubId);
    if (!sub) return null;
    const { data: updated, error } = await admin
      .from("subscriptions")
      .update({ status: "cancelled" })
      .eq("id", sub.id)
      .select("*")
      .single();
    if (error) throw error;
    await writeAuditLog(admin, {
      actor_id: actorId,
      actor_role: actorRole,
      action: "sub.cancelled.by_gateway",
      target_org_id: sub.organization_id,
      meta: { gateway: context.gateway },
    });
    return updated as SubscriptionRow;
  }

  return null;
}

async function findByGatewaySubId(
  admin: SupabaseClient,
  gatewaySubId: string,
): Promise<SubscriptionRow | null> {
  const { data } = await admin
    .from("subscriptions")
    .select("*")
    .eq("gateway_sub_id", gatewaySubId)
    .maybeSingle();
  return (data as SubscriptionRow | null) ?? null;
}

export async function writeAuditLog(
  admin: SupabaseClient,
  row: {
    actor_id: string | null;
    actor_role: AuditActorRole;
    action: string;
    target_org_id: string | null;
    meta?: Record<string, unknown> | null;
  },
): Promise<void> {
  const { error } = await admin.from("audit_logs").insert({
    actor_id: row.actor_id,
    actor_role: row.actor_role,
    action: row.action,
    target_org_id: row.target_org_id,
    meta: row.meta ?? null,
  });
  if (error) {
    console.error("[billing] audit log insert failed", error, row);
  }
}
