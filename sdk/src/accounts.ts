import { PublicKey } from "@solana/web3.js";

/**
 * Zero-dependency account decoders (Uint8Array in, typed structs out).
 * Layouts must match programs/harbor/src/state.rs exactly; the LiteSVM
 * suites and web coder test pin both sides.
 */

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

export interface Dispute {
  binding: PublicKey;
  nonce: bigint;
  reason: number;
  claimant: PublicKey;
  deadlineSlot: bigint;
  stakeLamports: bigint;
  claimSpend: bigint;
}

export interface Binding {
  channel: PublicKey;
  merchant: PublicKey;
  bond: PublicKey;
  channelProgram: PublicKey;
  maxSpend: bigint;
  lastNonce: bigint;
  lastCumulativeSpend: bigint;
  halted: boolean;
}

function u64(d: Uint8Array, o: number): bigint {
  return (
    BigInt(d[o]!) |
    (BigInt(d[o + 1]!) << 8n) |
    (BigInt(d[o + 2]!) << 16n) |
    (BigInt(d[o + 3]!) << 24n) |
    (BigInt(d[o + 4]!) << 32n) |
    (BigInt(d[o + 5]!) << 40n) |
    (BigInt(d[o + 6]!) << 48n) |
    (BigInt(d[o + 7]!) << 56n)
  );
}

function u16(d: Uint8Array, o: number): number {
  return d[o]! | (d[o + 1]! << 8);
}

function pk(d: Uint8Array, o: number): PublicKey {
  return new PublicKey(d.slice(o, o + 32));
}

/** MerchantBond layout: disc(8) + merchant(32) + mint(32) + amount(8) +
 * slaBps(2) + challengeSlots(8) + openDisputes(8) + lastChangeSlot(8) +
 * reserved(8) + bump(1). */
export function decodeBond(data: Uint8Array): Bond {
  return {
    merchant: pk(data, 8),
    mint: pk(data, 40),
    amount: u64(data, 72),
    slaBps: u16(data, 80),
    challengeSlots: u64(data, 82),
    openDisputes: u64(data, 90),
    lastChangeSlot: u64(data, 98),
    reserved: u64(data, 106),
  };
}

/** ChannelBinding layout: disc(8) + channel(32) + merchant(32) +
 * bond(32) + channel_program(32) + maxSpend(8) + lastNonce(8) +
 * lastCumulativeSpend(8) + halted(1) + bump(1) = 162 bytes.
 * Offsets verified against a live devnet binding. */
export function decodeBinding(data: Uint8Array): Binding {
  return {
    channel: pk(data, 8),
    merchant: pk(data, 40),
    bond: pk(data, 72),
    channelProgram: pk(data, 104),
    maxSpend: u64(data, 136),
    lastNonce: u64(data, 144),
    lastCumulativeSpend: u64(data, 152),
    halted: data[160] !== 0,
  };
}

/** Dispute layout: disc(8) + binding(32) + nonce(8) + reason(1) +
 * claimant(32) + deadlineSlot(8) + stakeLamports(8) + claimSpend(8) +
 * bump(1). */
export function decodeDispute(data: Uint8Array): Dispute {
  return {
    binding: pk(data, 8),
    nonce: u64(data, 40),
    reason: data[48]!,
    claimant: pk(data, 49),
    deadlineSlot: u64(data, 81),
    stakeLamports: u64(data, 89),
    claimSpend: u64(data, 97),
  };
}
