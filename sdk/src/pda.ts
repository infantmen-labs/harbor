import { PublicKey } from "@solana/web3.js";
import { HARBOR_PROGRAM_ID } from "./ids";

export function bondPda(
  merchant: PublicKey,
  mint: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("bond"), merchant.toBuffer(), mint.toBuffer()],
    HARBOR_PROGRAM_ID
  );
}

export function bindingPda(channel: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("binding"), channel.toBuffer()],
    HARBOR_PROGRAM_ID
  );
}

export function receiptPda(
  binding: PublicKey,
  nonce: bigint
): [PublicKey, number] {
  const nonceBuf = Buffer.alloc(8);
  nonceBuf.writeBigUInt64LE(nonce);
  return PublicKey.findProgramAddressSync(
    [Buffer.from("receipt"), binding.toBuffer(), nonceBuf],
    HARBOR_PROGRAM_ID
  );
}

export function disputePda(
  binding: PublicKey,
  nonce: bigint
): [PublicKey, number] {
  const nonceBuf = Buffer.alloc(8);
  nonceBuf.writeBigUInt64LE(nonce);
  return PublicKey.findProgramAddressSync(
    [Buffer.from("dispute"), binding.toBuffer(), nonceBuf],
    HARBOR_PROGRAM_ID
  );
}

export function treasuryPda(mint: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("treasury"), mint.toBuffer()],
    HARBOR_PROGRAM_ID
  );
}

export function channelPda(
  channelProgram: PublicKey,
  payer: PublicKey,
  payee: PublicKey,
  mint: PublicKey,
  authorizedSigner: PublicKey,
  salt: bigint,
  openSlot: bigint
): [PublicKey, number] {
  const saltBuf = Buffer.alloc(8);
  saltBuf.writeBigUInt64LE(salt);
  const slotBuf = Buffer.alloc(8);
  slotBuf.writeBigUInt64LE(openSlot);
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("channel"),
      payer.toBuffer(),
      payee.toBuffer(),
      mint.toBuffer(),
      authorizedSigner.toBuffer(),
      saltBuf,
      slotBuf,
    ],
    channelProgram
  );
}

export function channelAta(
  channel: PublicKey,
  tokenProgram: PublicKey,
  mint: PublicKey,
  ataProgram: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [channel.toBuffer(), tokenProgram.toBuffer(), mint.toBuffer()],
    ataProgram
  );
}
