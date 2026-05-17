import type { PaidPlan } from "@/lib/supabase/types";

/**
 * Domain event emitted by a payment gateway. Both InstantGateway (first-party
 * "click-to-upgrade") and real providers (ECPay / JKoPay / Stripe) produce
 * these events. `applyGatewayEvent` (in `lib/billing/apply.ts`) is the *only*
 * function that mutates the subscriptions/payments/audit_logs trio, so every
 * code path that bumps a subscription's state goes through the same place.
 *
 * After the 2026-05 simplification there is only one paid tier (`pro`); the
 * `plan` field is kept (typed as `PaidPlan`) for forward compatibility in
 * case we re-introduce tiers.
 */
export type GatewayEvent =
  | {
      kind: "activated";
      gatewaySubId: string;
      orgId: string;
      plan: PaidPlan;
      periodStart: string;
      periodEnd: string;
      payment: { gatewayPaymentId: string; amount: number };
      /** Raw provider payload for debugging; stored on `payments.raw_payload`. */
      rawPayload?: Record<string, unknown>;
    }
  | {
      kind: "renewed";
      gatewaySubId: string;
      periodStart: string;
      periodEnd: string;
      payment: { gatewayPaymentId: string; amount: number };
      rawPayload?: Record<string, unknown>;
    }
  | {
      kind: "payment_failed";
      gatewaySubId: string;
      reason: string;
      rawPayload?: Record<string, unknown>;
    }
  | {
      kind: "cancelled";
      gatewaySubId: string;
      rawPayload?: Record<string, unknown>;
    };

export type CreateSubscriptionInput = {
  orgId: string;
  plan: PaidPlan;
  orgName: string;
  contactEmail: string;
  /** Absolute URL the gateway should bounce back to after a successful checkout. */
  successUrl: string;
  /** Absolute URL on cancellation / abort. */
  cancelUrl: string;
};

export type CreateSubscriptionResult = {
  /**
   * URL the user should be redirected to next. Real gateways return their
   * hosted checkout page; InstantGateway returns the billing page since
   * activation already happened inline.
   */
  redirectUrl: string;
  gatewaySubId: string;
};

/**
 * Provider-agnostic surface. Add new gateways by implementing this interface
 * and wiring them into `lib/billing/index.ts` (the factory).
 *
 * The 2026-05 simplification removed `schedulePlanChange` (there is only one
 * paid tier, so plan switching is no longer a concept). Cancel-and-resume
 * remain because users can still pause/restore their subscription.
 */
export interface PaymentGateway {
  readonly name: string;

  createSubscription(
    input: CreateSubscriptionInput,
  ): Promise<CreateSubscriptionResult>;

  cancelAtPeriodEnd(gatewaySubId: string): Promise<void>;

  resume(gatewaySubId: string): Promise<void>;

  /**
   * Validate and parse an incoming webhook. Returns `null` if the request
   * isn't a recognised event (e.g. signature mismatch, or InstantGateway
   * which never receives webhooks).
   */
  verifyAndParseWebhook(req: Request): Promise<GatewayEvent | null>;
}
