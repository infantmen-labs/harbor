import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import {
  ATA_PROGRAM_ID,
  IX_SYSVAR_ID,
  RENT_SYSVAR_ID,
  SYSTEM_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from "./ids";
import { channelPda } from "./pda";
import { u64le } from "./u64";

/**
 * Upstream payment-channels instruction builders. These encode the pinned
 * upstream layouts (see docs/upstream-pin.md) so third-party buyers never
 * reimplement consensus-critical bytes by copy-paste. Previously lived in
 * the reference agent; moved here verbatim (byte-identical output).
 */

function m(pubkey: PublicKey, writable: boolean, signer: boolean) {
  return { pubkey, isWritable: writable, isSigner: signer };
}

function u32(v: number): Buffer {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(v);
  return b;
}

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
    u64le(args.salt),
    u64le(args.deposit),
    u32(args.gracePeriod),
    u64le(args.openSlot),
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
    data: Buffer.concat([Buffer.from([3]), u64le(args.amount)]),
  });
}

/**
 * Upstream forced-close lifecycle (buyer reclaim path). All no-arg beyond
 * the discriminator; discriminators from the pinned upstream IDL
 * (requestClose 5, seal 6, withdrawPayer 8, reclaim 9).
 *
 * Reclaim flow: `requestClose` (payer starts grace) → wait past grace →
 * `seal` → `withdrawPayer` (unspent remainder back to the payer) →
 * `reclaim` (deallocate channel, rent to rentPayer). Cooperative
 * alternative: `settleAndSeal` (needs payee signature — not built here).
 */
export function requestCloseIx(args: {
  programId: PublicKey;
  payer: PublicKey;
  channel: PublicKey;
}): TransactionInstruction {
  return new TransactionInstruction({
    programId: args.programId,
    keys: [m(args.payer, false, true), m(args.channel, true, false)],
    data: Buffer.from([5]),
  });
}

export function sealIx(args: {
  programId: PublicKey;
  channel: PublicKey;
}): TransactionInstruction {
  return new TransactionInstruction({
    programId: args.programId,
    keys: [m(args.channel, true, false)],
    data: Buffer.from([6]),
  });
}

export function withdrawPayerIx(args: {
  programId: PublicKey;
  payer: PublicKey;
  channel: PublicKey;
  channelAta: PublicKey;
  payerAta: PublicKey;
  mint: PublicKey;
}): TransactionInstruction {
  return new TransactionInstruction({
    programId: args.programId,
    keys: [
      m(args.payer, false, true),
      m(args.channel, true, false),
      m(args.channelAta, true, false),
      m(args.payerAta, true, false),
      m(args.mint, false, false),
      m(TOKEN_PROGRAM_ID, false, false),
    ],
    data: Buffer.from([8]),
  });
}

export function reclaimIx(args: {
  programId: PublicKey;
  channel: PublicKey;
  rentPayer: PublicKey;
}): TransactionInstruction {
  return new TransactionInstruction({
    programId: args.programId,
    keys: [m(args.channel, true, false), m(args.rentPayer, true, false)],
    data: Buffer.from([9]),
  });
}

/**
 * Upstream `distribute` with an explicit recipient list (empty = payee
 * remainder only). Data: disc(7) | count(u32 LE) | entries. The onchain
 * program rehashes the revealed plan and compares against the commitment
 * stored at `open` — agent-opened channels commit to the empty plan
 * (count 0), so empty args verify for them.
 *
 * Fixed accounts: channel(mut) | payer | rentPayer(mut) | channelAta(mut)
 * | payerAta(mut) | payeeAta(mut) | treasuryAta(mut) | mint |
 * tokenProgram | eventAuthority | selfProgram, then recipient ATAs in plan
 * order. Permissionless crank: payer is deliberately NOT marked signer
 * (the upstream docs require payer-side signatures only for topUp,
 * requestClose and withdrawPayer — the fee payer signs the tx itself).
 */
export function distributeIx(args: {
  programId: PublicKey;
  channel: PublicKey;
  payer: PublicKey;
  rentPayer: PublicKey;
  channelAta: PublicKey;
  payerAta: PublicKey;
  payeeAta: PublicKey;
  treasuryAta: PublicKey;
  mint: PublicKey;
  eventAuthority: PublicKey;
  recipientAtas?: PublicKey[];
}): TransactionInstruction {
  const data = Buffer.concat([Buffer.from([7]), u32(0)]);
  return new TransactionInstruction({
    programId: args.programId,
    keys: [
      m(args.channel, true, false),
      m(args.payer, false, false),
      m(args.rentPayer, true, false),
      m(args.channelAta, true, false),
      m(args.payerAta, true, false),
      m(args.payeeAta, true, false),
      m(args.treasuryAta, true, false),
      m(args.mint, false, false),
      m(TOKEN_PROGRAM_ID, false, false),
      m(args.eventAuthority, false, false),
      m(args.programId, false, false),
      ...(args.recipientAtas ?? []).map((a) => m(a, true, false)),
    ],
    data,
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
