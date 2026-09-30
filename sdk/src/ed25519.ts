import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import { ED25519_PROGRAM_ID } from "./ids";
import { writeI64LE, writeU64LE } from "./u64";

/**
 * Canonical single-signature Ed25519 precompile ix. Offsets point into this
 * ix's own data (indices u16::MAX). Layout: header(16) | pubkey(32) |
 * signature(64) | message(n).
 */
export function buildEd25519Ix(
  pubkey: PublicKey,
  signature: Uint8Array,
  message: Uint8Array
): TransactionInstruction {
  if (signature.length !== 64) throw new Error("signature must be 64 bytes");
  const header = Buffer.alloc(16);
  header.writeUInt8(1, 0);
  header.writeUInt8(0, 1);
  header.writeUInt16LE(48, 2);
  header.writeUInt16LE(0xffff, 4);
  header.writeUInt16LE(16, 6);
  header.writeUInt16LE(0xffff, 8);
  header.writeUInt16LE(112, 10);
  header.writeUInt16LE(message.length, 12);
  header.writeUInt16LE(0xffff, 14);
  return new TransactionInstruction({
    programId: ED25519_PROGRAM_ID,
    keys: [],
    data: Buffer.concat([
      header,
      pubkey.toBuffer(),
      Buffer.from(signature),
      Buffer.from(message),
    ]),
  });
}

/** Upstream channel voucher payload: magic || channel || cumulative || expires. */
export function channelVoucherBytes(
  channel: PublicKey,
  cumulative: bigint,
  expiresAt: bigint
): Buffer {
  const out = Buffer.alloc(50);
  out.writeUInt8(0x56, 0);
  out.writeUInt8(0x01, 1);
  channel.toBuffer().copy(out, 2);
  writeU64LE(out, cumulative, 34);
  writeI64LE(out, expiresAt, 42);
  return out;
}

export const VOUCHER_LEN = 50;
