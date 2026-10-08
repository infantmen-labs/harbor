import { PublicKey } from "@solana/web3.js";
import { writeU64LE } from "./u64";

export interface ReceiptFields {
  merchant: PublicKey;
  binding: PublicKey;
  cumulativeSpend: bigint;
  meterHash: Uint8Array;
  outputHash: Uint8Array;
  status: number;
  nonce: bigint;
  expirySlot: bigint;
  signer: PublicKey;
  /** v1 domain separators (appended — every v0 offset unchanged). */
  mint: PublicKey;
  programId: PublicKey;
}

function assertLen(b: Uint8Array, n: number, name: string): void {
  if (b.length !== n) throw new Error(`${name} must be ${n} bytes`);
}

/** Borsh encoding of the onchain ReceiptMessage. Field order is consensus. */
export function receiptMessageBytes(f: ReceiptFields): Buffer {
  assertLen(f.meterHash, 32, "meterHash");
  assertLen(f.outputHash, 32, "outputHash");
  const out = Buffer.alloc(249);
  let o = 0;
  f.merchant.toBuffer().copy(out, o);
  o += 32;
  f.binding.toBuffer().copy(out, o);
  o += 32;
  writeU64LE(out, f.cumulativeSpend, o);
  o += 8;
  Buffer.from(f.meterHash).copy(out, o);
  o += 32;
  Buffer.from(f.outputHash).copy(out, o);
  o += 32;
  out.writeUInt8(f.status, o);
  o += 1;
  writeU64LE(out, f.nonce, o);
  o += 8;
  writeU64LE(out, f.expirySlot, o);
  o += 8;
  f.signer.toBuffer().copy(out, o);
  o += 32;
  f.mint.toBuffer().copy(out, o);
  o += 32;
  f.programId.toBuffer().copy(out, o);
  o += 32;
  return out;
}

export const RECEIPT_MESSAGE_LEN = 249;

/**
 * Byte offset of expirySlot in the 249-byte receipt message (unchanged
 * from v0 — domain separators were appended after signer)
 * (merchant 32 | binding 32 | cumulative 8 | meter 32 | output 32 |
 * status 1 | nonce 8 | expiry 8 | signer 32).
 */
export const RECEIPT_EXPIRY_OFFSET = 145;

/** Reads the expiry slot from encoded receipt message bytes. */
export function receiptExpirySlot(message: Uint8Array): bigint {
  let v = 0n;
  for (let i = 0; i < 8; i++) {
    v |= BigInt(message[RECEIPT_EXPIRY_OFFSET + i]!) << BigInt(i * 8);
  }
  return v;
}

/**
 * Buyer-side expiry check: a receipt is expired once the chain passes its
 * expiry slot (mirrors the onchain `slot <= expiry_slot` gate in
 * submit_receipt — expired receipts fail submit with `Expired`).
 */
export function isReceiptExpired(
  message: Uint8Array,
  slot: bigint | number
): boolean {
  return BigInt(slot) > receiptExpirySlot(message);
}
