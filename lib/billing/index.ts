import { instantGateway } from "./instant";
import type { PaymentGateway } from "./gateway";

/**
 * Returns the active payment gateway. Swap providers without touching any
 * other code by setting `BILLING_PROVIDER` in the environment.
 *
 *  - `instant` (default): first-party "click-to-upgrade" stub, no external
 *    money movement. Used while we run a closed beta.
 *  - `ecpay` / `jkopay` / ...: implement `PaymentGateway` in a new file
 *    and add a `case` here.
 */
export function getGateway(): PaymentGateway {
  const provider = process.env.BILLING_PROVIDER ?? "instant";
  switch (provider) {
    case "instant":
      return instantGateway;
    default:
      throw new Error(`unsupported BILLING_PROVIDER: ${provider}`);
  }
}

export type { PaymentGateway, GatewayEvent } from "./gateway";
