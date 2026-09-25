import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
} from "@solana/spl-token";
import {
  ATA_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  bindingPda,
  bondPda,
  disputePda,
  openDisputeIx,
  registerMerchantIx,
  postBondIx,
  bindChannelIx,
  topUpBondIx,
  haltBindingIx,
  withdrawBondIx,
} from "harbor-sdk";
import { PROGRAM_ID } from "./env";

const PROGRAM = new PublicKey(PROGRAM_ID);

export async function ata(owner: PublicKey, mint: PublicKey): Promise<PublicKey> {
  return getAssociatedTokenAddress(mint, owner);
}

/** Idempotent ATA creation for a user that may not hold the mint yet. */
export function buildCreateAtaIx(
  payer: PublicKey,
  owner: PublicKey,
  mint: PublicKey,
  ata: PublicKey,
): TransactionInstruction {
  return createAssociatedTokenAccountInstruction(payer, ata, owner, mint);
}

export async function buildRegisterIx(
  merchant: PublicKey,
  mint: PublicKey,
  slaBps: number,
  challengeSlots: bigint,
): Promise<{ ix: TransactionInstruction; bond: PublicKey }> {
  const [bond] = bondPda(merchant, mint);
  return {
    ix: registerMerchantIx(PROGRAM, merchant, bond, mint, slaBps, challengeSlots),
    bond,
  };
}

export async function buildPostBondIx(
  merchant: PublicKey,
  bond: PublicKey,
  mint: PublicKey,
  amount: bigint,
): Promise<{ ixs: TransactionInstruction[]; vault: PublicKey }> {
  const merchantAta = await ata(merchant, mint);
  const [vault] = PublicKey.findProgramAddressSync(
    [bond.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ATA_PROGRAM_ID,
  );
  const ixs: TransactionInstruction[] = [];
  ixs.push(postBondIx(PROGRAM, merchant, bond, mint, merchantAta, vault, amount));
  return { ixs, vault };
}

export async function buildTopUpIx(
  merchant: PublicKey,
  bond: PublicKey,
  mint: PublicKey,
  merchantAta: PublicKey,
  vault: PublicKey,
  amount: bigint,
): Promise<TransactionInstruction> {
  return topUpBondIx(PROGRAM, merchant, bond, mint, merchantAta, vault, amount);
}

export async function buildBindIx(
  merchant: PublicKey,
  bond: PublicKey,
  channel: PublicKey,
  channelProgram: PublicKey,
  maxSpend: bigint,
): Promise<{ ix: TransactionInstruction; binding: PublicKey }> {
  const [binding] = bindingPda(channel);
  return {
    ix: bindChannelIx(PROGRAM, merchant, bond, binding, channel, channelProgram, maxSpend),
    binding,
  };
}

export async function buildHaltIx(
  merchant: PublicKey,
  binding: PublicKey,
): Promise<TransactionInstruction> {
  return haltBindingIx(PROGRAM, merchant, binding);
}

export async function buildWithdrawIx(
  merchant: PublicKey,
  bond: PublicKey,
  mint: PublicKey,
  merchantAta: PublicKey,
  vault: PublicKey,
  amount: bigint,
): Promise<TransactionInstruction> {
  return withdrawBondIx(PROGRAM, merchant, bond, mint, merchantAta, vault, amount);
}

export async function buildOpenDisputeIx(
  claimant: PublicKey,
  bond: PublicKey,
  binding: PublicKey,
  nonce: bigint,
  reason: number,
): Promise<{ ix: TransactionInstruction; dispute: PublicKey }> {
  const [dispute] = disputePda(binding, nonce);
  return {
    ix: openDisputeIx(PROGRAM, claimant, bond, binding, dispute, nonce, reason),
    dispute,
  };
}
