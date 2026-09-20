import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import {
  ATA_PROGRAM_ID,
  IX_SYSVAR_ID,
  SYSTEM_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from "./ids";

const D = {
  registerMerchant: [238, 245, 77, 132, 161, 88, 216, 248],
  postBond: [168, 151, 202, 119, 163, 58, 147, 247],
  topUpBond: [110, 37, 8, 119, 210, 231, 202, 197],
  withdrawBond: [222, 199, 141, 31, 188, 93, 155, 40],
  bindChannel: [56, 13, 116, 192, 54, 234, 8, 201],
  haltBinding: [253, 79, 175, 71, 63, 49, 108, 135],
  submitReceipt: [172, 84, 119, 35, 195, 154, 214, 176],
  openDispute: [137, 25, 99, 119, 23, 223, 161, 42],
  resolveTimeout: [149, 55, 89, 144, 121, 143, 48, 210],
  resolveDelivered: [103, 223, 10, 163, 175, 200, 192, 62],
  refundUnused: [239, 108, 1, 110, 2, 81, 44, 174],
};

function u8(v: number): Buffer {
  const b = Buffer.alloc(1);
  b.writeUInt8(v);
  return b;
}
function u16(v: number): Buffer {
  const b = Buffer.alloc(2);
  b.writeUInt16LE(v);
  return b;
}
function u64(v: bigint): Buffer {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(v);
  return b;
}
function pk(k: PublicKey): Buffer {
  return k.toBuffer();
}
function bytes32(b: Uint8Array): Buffer {
  if (b.length !== 32) throw new Error("expected 32 bytes");
  return Buffer.from(b);
}

interface Meta {
  key: PublicKey;
  w?: boolean;
  s?: boolean;
}
function keys(programId: PublicKey, disc: number[], data: Buffer, metas: Meta[]) {
  return new TransactionInstruction({
    programId,
    keys: metas.map((m) => ({
      pubkey: m.key,
      isWritable: m.w ?? false,
      isSigner: m.s ?? false,
    })),
    data: Buffer.concat([Buffer.from(disc), data]),
  });
}

export function registerMerchantIx(
  programId: PublicKey,
  merchant: PublicKey,
  bond: PublicKey,
  mint: PublicKey,
  slaBps: number,
  challengeSlots: bigint,
) {
  return keys(programId, D.registerMerchant, Buffer.concat([u16(slaBps), u64(challengeSlots)]), [
    { key: merchant, w: true, s: true },
    { key: bond, w: true },
    { key: mint },
    { key: SYSTEM_PROGRAM_ID },
  ]);
}

export function postBondIx(
  programId: PublicKey,
  merchant: PublicKey,
  bond: PublicKey,
  mint: PublicKey,
  merchantAta: PublicKey,
  vault: PublicKey,
  amount: bigint,
) {
  return keys(programId, D.postBond, u64(amount), [
    { key: merchant, w: true, s: true },
    { key: bond, w: true },
    { key: mint },
    { key: merchantAta, w: true },
    { key: vault, w: true },
    { key: TOKEN_PROGRAM_ID },
    { key: ATA_PROGRAM_ID },
    { key: SYSTEM_PROGRAM_ID },
  ]);
}

export function withdrawBondIx(
  programId: PublicKey,
  merchant: PublicKey,
  bond: PublicKey,
  mint: PublicKey,
  merchantAta: PublicKey,
  vault: PublicKey,
  amount: bigint,
) {
  return keys(programId, D.withdrawBond, u64(amount), [
    { key: merchant, w: true, s: true },
    { key: bond, w: true },
    { key: mint },
    { key: merchantAta, w: true },
    { key: vault, w: true },
    { key: TOKEN_PROGRAM_ID },
  ]);
}

export function bindChannelIx(
  programId: PublicKey,
  merchant: PublicKey,
  bond: PublicKey,
  binding: PublicKey,
  channel: PublicKey,
  channelProgram: PublicKey,
  maxSpend: bigint,
) {
  return keys(
    programId,
    D.bindChannel,
    Buffer.concat([pk(channelProgram), u64(maxSpend)]),
    [
      { key: merchant, w: true, s: true },
      { key: bond },
      { key: binding, w: true },
      { key: channel },
      { key: SYSTEM_PROGRAM_ID },
    ],
  );
}

export interface SubmitReceiptArgs {
  cumulativeSpend: bigint;
  meterHash: Uint8Array;
  outputHash: Uint8Array;
  status: number;
  nonce: bigint;
  expirySlot: bigint;
  signer: PublicKey;
}

export function submitReceiptIx(
  programId: PublicKey,
  merchant: PublicKey,
  bond: PublicKey,
  binding: PublicKey,
  receipt: PublicKey,
  args: SubmitReceiptArgs,
) {
  return keys(
    programId,
    D.submitReceipt,
    Buffer.concat([
      u64(args.cumulativeSpend),
      bytes32(args.meterHash),
      bytes32(args.outputHash),
      u8(args.status),
      u64(args.nonce),
      u64(args.expirySlot),
      pk(args.signer),
    ]),
    [
      { key: merchant, w: true, s: true },
      { key: bond },
      { key: binding, w: true },
      { key: receipt, w: true },
      { key: IX_SYSVAR_ID },
      { key: SYSTEM_PROGRAM_ID },
    ],
  );
}

export function openDisputeIx(
  programId: PublicKey,
  claimant: PublicKey,
  bond: PublicKey,
  binding: PublicKey,
  dispute: PublicKey,
  nonce: bigint,
  reason: number,
) {
  return keys(programId, D.openDispute, Buffer.concat([u64(nonce), u8(reason)]), [
    { key: claimant, w: true, s: true },
    { key: bond, w: true },
    { key: binding },
    { key: dispute, w: true },
    { key: SYSTEM_PROGRAM_ID },
  ]);
}

export function haltBindingIx(
  programId: PublicKey,
  merchant: PublicKey,
  binding: PublicKey,
) {
  return keys(programId, D.haltBinding, Buffer.alloc(0), [
    { key: merchant, w: true, s: true },
    { key: binding, w: true },
  ]);
}
