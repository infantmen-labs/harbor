import { PublicKey } from "@solana/web3.js";

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
}

function assertLen(b: Uint8Array, n: number, name: string): void {
  if (b.length !== n) throw new Error(`${name} must be ${n} bytes`);
}

/** Borsh encoding of the onchain ReceiptMessage. Field order is consensus. */
export function receiptMessageBytes(f: ReceiptFields): Buffer {
  assertLen(f.meterHash, 32, "meterHash");
  assertLen(f.outputHash, 32, "outputHash");
  const out = Buffer.alloc(185);
  let o = 0;
  f.merchant.toBuffer().copy(out, o); o += 32;
  f.binding.toBuffer().copy(out, o); o += 32;
  out.writeBigUInt64LE(f.cumulativeSpend, o); o += 8;
  Buffer.from(f.meterHash).copy(out, o); o += 32;
  Buffer.from(f.outputHash).copy(out, o); o += 32;
  out.writeUInt8(f.status, o); o += 1;
  out.writeBigUInt64LE(f.nonce, o); o += 8;
  out.writeBigUInt64LE(f.expirySlot, o); o += 8;
  f.signer.toBuffer().copy(out, o); o += 32;
  return out;
}

export const RECEIPT_MESSAGE_LEN = 185;
