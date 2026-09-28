import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import {
  ATA_PROGRAM_ID,
  IX_SYSVAR_ID,
  RENT_SYSVAR_ID,
  SYSTEM_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  channelPda,
} from "@infantmen-labs/harbor-sdk";

/** Upstream `open`. Layout: disc(1) | salt(8) | deposit(8) | grace(4) | slot(8) | recipients u32. */
export function openChannelIx(args: {
  programId: PublicKey;
  payer: PublicKey;
  payee: PublicKey;
  mint: PublicKey;
  authorizedSigner: PublicKey;
  channel: PublicKey;
  payerAta: PublicKey;
  channelAta: PublicKey;
  eventAuthority: PublicKey;
  salt: bigint;
  deposit: bigint;
  gracePeriod: number;
  openSlot: bigint;
}): TransactionInstruction {
  const data = Buffer.concat([
    Buffer.from([1]),
    u64(args.salt),
    u64(args.deposit),
    u32(args.gracePeriod),
    u64(args.openSlot),
    u32(0),
  ]);
  return new TransactionInstruction({
    programId: args.programId,
    keys: [
      m(args.payer, true, true),
      m(args.payer, true, true),
      m(args.payee, false, false),
      m(args.mint, false, false),
      m(args.authorizedSigner, false, false),
      m(args.channel, true, false),
      m(args.payerAta, true, false),
      m(args.channelAta, true, false),
      m(TOKEN_PROGRAM_ID, false, false),
      m(SYSTEM_PROGRAM_ID, false, false),
      m(RENT_SYSVAR_ID, false, false),
      m(ATA_PROGRAM_ID, false, false),
      m(args.eventAuthority, false, false),
      m(args.programId, false, false),
    ],
    data,
  });
}

export function settleIx(
  programId: PublicKey,
  channel: PublicKey
): TransactionInstruction {
  return new TransactionInstruction({
    programId,
    keys: [m(channel, true, false), m(IX_SYSVAR_ID, false, false)],
    data: Buffer.from([2]),
  });
}

/** Upstream `top_up`. Layout: disc(3) | amount(8). */
export function topUpIx(args: {
  programId: PublicKey;
  payer: PublicKey;
  channel: PublicKey;
  payerAta: PublicKey;
  channelAta: PublicKey;
  mint: PublicKey;
  amount: bigint;
}): TransactionInstruction {
  return new TransactionInstruction({
    programId: args.programId,
    keys: [
      m(args.payer, true, true),
      m(args.channel, true, false),
      m(args.payerAta, true, false),
      m(args.channelAta, true, false),
      m(args.mint, false, false),
      m(TOKEN_PROGRAM_ID, false, false),
    ],
    data: Buffer.concat([Buffer.from([3]), u64(args.amount)]),
  });
}

export function deriveChannel(
  programId: PublicKey,
  payer: PublicKey,
  payee: PublicKey,
  mint: PublicKey,
  authorizedSigner: PublicKey,
  salt: bigint,
  openSlot: bigint
): { channel: PublicKey } {
  const [channel] = channelPda(
    programId,
    payer,
    payee,
    mint,
    authorizedSigner,
    salt,
    openSlot
  );
  return { channel };
}

function m(pubkey: PublicKey, writable: boolean, signer: boolean) {
  return { pubkey, isWritable: writable, isSigner: signer };
}

function u64(v: bigint): Buffer {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(v);
  return b;
}

function u32(v: number): Buffer {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(v);
  return b;
}
