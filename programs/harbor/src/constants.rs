use anchor_lang::prelude::*;

pub const BOND_SEED: &[u8] = b"bond";
pub const BINDING_SEED: &[u8] = b"binding";
pub const RECEIPT_SEED: &[u8] = b"receipt";
pub const DISPUTE_SEED: &[u8] = b"dispute";

pub const BPS_DENOMINATOR: u64 = 10_000;
pub const MAX_SLA_BPS: u16 = 1_000;
pub const MIN_CHALLENGE_SLOTS: u64 = 75;
pub const DISPUTE_STAKE_LAMPORTS: u64 = 10_000_000;
pub const WITHDRAW_DELAY_SLOTS: u64 = 150;
pub const TREASURY_SEED: &[u8] = b"treasury";
/// Protocol fee on dispute claims, in bps of the locked claim.
/// Paid to the per-mint backstop treasury on every timeout resolve.
pub const CLAIM_FEE_BPS: u64 = 500;
/// Burn multiple of the locked claim, paid from the bond to the treasury.
/// Total vault outflow per resolve = claim * (1 + PENALTY_MULT).
pub const PENALTY_MULT: u64 = 2;
