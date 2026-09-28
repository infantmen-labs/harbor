import { createHash } from "node:crypto";
import { PublicKey } from "@solana/web3.js";
import { decodeBond, decodeDispute, type Bond, type Dispute } from "harbor-sdk";

// Single source of truth lives in the SDK; re-exported here so existing
// keeper imports keep working.
export { decodeBond, decodeDispute, type Bond, type Dispute };

export function accountDiscriminator(name: string): Buffer {
  return createHash("sha256")
    .update(`account:${name}`, "utf8")
    .digest()
    .subarray(0, 8);
}

export const DISPUTE_DISC = accountDiscriminator("Dispute");

/** Binding layout: disc(8) + channel(32) + merchant(32) + bond(32) + channel_program(32) + ... */
export function bindingChannelProgram(data: Buffer): PublicKey {
  return new PublicKey(data.subarray(8 + 32 + 32 + 32, 8 + 32 + 32 + 32 + 32));
}

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
