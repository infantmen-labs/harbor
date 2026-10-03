import { Connection, PublicKey } from "@solana/web3.js";
import { decodeBinding, decodeBond } from "./accounts";
import { ataFor } from "./pda";

/**
 * Buyer-side incident helpers. These encode the operator judgments a
 * demand buyer otherwise hand-rolls at 2am: how large a claim is safe,
 * and whether a voucher covers the quoted price. Pure chain reads —
 * nothing here opens disputes or moves funds.
 */

/** A voucher authorizing less than the quoted cost. */
export class VoucherUnderquoted extends Error {
  constructor(readonly quoted: bigint, readonly authorized: bigint) {
    super(`voucher authorizes ${authorized} but merchant quoted ${quoted}`);
    this.name = "VoucherUnderquoted";
  }
}

/** A voucher older than the channel watermark (replay or reorder). */
export class StaleVoucher extends Error {
  constructor(readonly watermark: bigint, readonly voucherCumulative: bigint) {
    super(
      `voucher cumulative ${voucherCumulative} is behind watermark ${watermark}`
    );
    this.name = "StaleVoucher";
  }
}

/**
 * Coverage check: the voucher's marginal authorization must cover the
 * quoted cost. This is billing-ack hygiene, NOT delivery acceptance —
 * a covered voucher says the merchant may be paid, never that the
 * output was correct (verify output bytes separately).
 */
export function assertVoucherCoversQuote(args: {
  lastCumulative: bigint;
  voucherCumulative: bigint;
  quotedCost: bigint;
}): void {
  if (args.voucherCumulative < args.lastCumulative) {
    throw new StaleVoucher(args.lastCumulative, args.voucherCumulative);
  }
  const authorized = args.voucherCumulative - args.lastCumulative;
  if (authorized < args.quotedCost) {
    throw new VoucherUnderquoted(args.quotedCost, authorized);
  }
}

export interface ClaimSuggestion {
  /** Nonce to dispute (explicit, or binding.lastNonce + 1). */
  nonce: bigint;
  /** Onchain ceiling: claim_spend must be ≤ this (binding.maxSpend). */
  maxSpend: bigint;
  /** Claimant ATA balance for the bond mint. */
  funded: bigint;
  /** Bond free collateral (amount − reserved). */
  bondFree: bigint;
  /** Largest claim the bond can back: floor(free / 3). */
  bondCap: bigint;
  /**
   * Suggested claim_spend = min(maxSpend, funded, bondCap). 0n means no
   * safe claim exists — do NOT open a dispute (claim_spend must be > 0
   * onchain); top up, wait, or walk away instead.
   */
  claimSpend: bigint;
}

/**
 * Maps "failed nonce N" to a safe claim amount. Reads the binding (cap +
 * nonce default), the bond (free collateral — every unit of claim locks
 * 3x: refund + fee + penalty), and the claimant's ATA (the claim stake
 * must actually be funded). Throws when the binding or bond account is
 * missing.
 */
export async function suggestClaimSpend(
  conn: Connection,
  args: {
    binding: PublicKey;
    claimant: PublicKey;
    mint: PublicKey;
    nonce?: bigint;
  }
): Promise<ClaimSuggestion> {
  const bindingInfo = await conn.getAccountInfo(args.binding);
  if (bindingInfo === null) throw new Error("binding account missing");
  const binding = decodeBinding(bindingInfo.data);
  const nonce = args.nonce ?? binding.lastNonce + 1n;

  const bondInfo = await conn.getAccountInfo(binding.bond);
  if (bondInfo === null) throw new Error("bond account missing");
  const bond = decodeBond(bondInfo.data);
  const bondFree = bond.amount - bond.reserved;
  // Outflow per unit of claim is 3x (refund + fee + penalty).
  const bondCap = bondFree >= 0n ? bondFree / 3n : 0n;

  const claimantAta = ataFor(args.claimant, args.mint);
  const ataInfo = await conn.getAccountInfo(claimantAta);
  let funded = 0n;
  if (ataInfo !== null) {
    const bal = await conn.getTokenAccountBalance(claimantAta);
    funded = BigInt(bal.value.amount);
  }

  let claimSpend = binding.maxSpend;
  if (funded < claimSpend) claimSpend = funded;
  if (bondCap < claimSpend) claimSpend = bondCap;
  return {
    nonce,
    maxSpend: binding.maxSpend,
    funded,
    bondFree,
    bondCap,
    claimSpend,
  };
}
