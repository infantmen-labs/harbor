import { PublicKey } from "@solana/web3.js";
import { HARBOR_PROGRAM_ID } from "./ids";
import { u64le } from "./u64";

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
  const nonceBuf = u64le(nonce);
  return PublicKey.findProgramAddressSync(
    [Buffer.from("receipt"), binding.toBuffer(), nonceBuf],
    HARBOR_PROGRAM_ID
  );
}

export function disputePda(
  binding: PublicKey,
  nonce: bigint
): [PublicKey, number] {
  const nonceBuf = u64le(nonce);
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

/** Tombstone marking a (binding, nonce) as claimed exactly once. */
export function claimPda(
  binding: PublicKey,
  nonce: bigint
): [PublicKey, number] {
  const nonceBuf = u64le(nonce);
  return PublicKey.findProgramAddressSync(
    [Buffer.from("claim"), binding.toBuffer(), nonceBuf],
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
  const saltBuf = u64le(salt);
  const slotBuf = u64le(openSlot);
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
