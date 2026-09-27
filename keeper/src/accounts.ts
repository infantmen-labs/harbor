import { createHash } from "node:crypto";
import { PublicKey } from "@solana/web3.js";

export function accountDiscriminator(name: string): Buffer {
  return createHash("sha256")
    .update(`account:${name}`, "utf8")
    .digest()
    .subarray(0, 8);
}

export const DISPUTE_DISC = accountDiscriminator("Dispute");

export interface Bond {
  merchant: PublicKey;
  mint: PublicKey;
  amount: bigint;
  slaBps: number;
  challengeSlots: bigint;
  openDisputes: bigint;
  lastChangeSlot: bigint;
  reserved: bigint;
}

export function parseBond(data: Buffer): Bond {
  return {
    merchant: new PublicKey(data.subarray(8, 40)),
    mint: new PublicKey(data.subarray(40, 72)),
    amount: data.readBigUInt64LE(72),
    slaBps: data.readUInt16LE(80),
    challengeSlots: data.readBigUInt64LE(82),
    openDisputes: data.readBigUInt64LE(90),
    lastChangeSlot: data.readBigUInt64LE(98),
    reserved: data.readBigUInt64LE(106),
  };
}

export interface Dispute {
  binding: PublicKey;
  nonce: bigint;
  reason: number;
  claimant: PublicKey;
  deadlineSlot: bigint;
  stakeLamports: bigint;
  claimSpend: bigint;
}

export function parseDispute(data: Buffer): Dispute {
  return {
    binding: new PublicKey(data.subarray(8, 40)),
    nonce: data.readBigUInt64LE(40),
    reason: data.readUInt8(48),
    claimant: new PublicKey(data.subarray(49, 81)),
    deadlineSlot: data.readBigUInt64LE(81),
    stakeLamports: data.readBigUInt64LE(89),
    claimSpend: data.readBigUInt64LE(97),
  };
}

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
