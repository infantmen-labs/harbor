import type { Dispute } from "./accounts";

export type Action =
  | { kind: "resolve-timeout" }
  | { kind: "pending"; why: string };

/** Pure adjudication: every matured dispute resolves as a timeout refund.
 * There is no delivered path — receipts are merchant-signed liveness
 * attestations, never evidence against a claim. */
export function decide(d: Dispute, slot: bigint): Action {
  if (slot > d.deadlineSlot) return { kind: "resolve-timeout" };
  return { kind: "pending", why: "within challenge window" };
}
