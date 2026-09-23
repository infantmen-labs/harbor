import { createHash } from "node:crypto";
import { PublicKey } from "@solana/web3.js";

export function accountDiscriminator(name: string): Buffer {
  return createHash("sha256").update(`account:${name}`, "utf8").digest().subarray(0, 8);
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
  };
}

export interface Dispute {
  binding: PublicKey;
  nonce: bigint;
  reason: number;
  claimant: PublicKey;
  deadlineSlot: bigint;
  stakeLamports: bigint;
}

export function parseDispute(data: Buffer): Dispute {
  return {
    binding: new PublicKey(data.subarray(8, 40)),
    nonce: data.readBigUInt64LE(40),
    reason: data.readUInt8(48),
    claimant: new PublicKey(data.subarray(49, 81)),
    deadlineSlot: data.readBigUInt64LE(81),
    stakeLamports: data.readBigUInt64LE(89),
  };
}

export type Action =
  | { kind: "resolve-timeout" }
  | { kind: "resolve-delivered" }
  | { kind: "pending"; why: string };

/** Pure adjudication: delivery proof always wins; past-deadline absence slashes. */
export function decide(d: Dispute, receiptExists: boolean, slot: bigint): Action {
  if (receiptExists) return { kind: "resolve-delivered" };
  if (slot > d.deadlineSlot) return { kind: "resolve-timeout" };
  return { kind: "pending", why: "within challenge window" };
}
