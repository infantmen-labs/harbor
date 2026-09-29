use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct MerchantBond {
    pub merchant: Pubkey,
    pub mint: Pubkey,
    pub amount: u64,
    /// Reserved for future fee parameterization; currently unread by any
    /// instruction (v0.2–v0.4 use a fixed 2x penalty multiple instead).
    pub sla_bps: u16,
    pub challenge_slots: u64,
    pub open_disputes: u64,
    pub last_change_slot: u64,
    /// Outflow locked by open disputes (refund + fee + penalty).
    /// Withdrawals may only touch amount - reserved.
    pub reserved: u64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct ChannelBinding {
    pub channel: Pubkey,
    pub merchant: Pubkey,
    pub bond: Pubkey,
    pub channel_program: Pubkey,
    pub max_spend: u64,
    pub last_nonce: u64,
    pub last_cumulative_spend: u64,
    pub halted: bool,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct ReceiptLog {
    pub binding: Pubkey,
    pub nonce: u64,
    pub receipt_hash: [u8; 32],
    pub cumulative_spend: u64,
    pub status: u8,
    pub slot: u64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Dispute {
    pub binding: Pubkey,
    pub nonce: u64,
    pub reason: u8,
    pub claimant: Pubkey,
    pub deadline_slot: u64,
    pub stake_lamports: u64,
    /// Claimant-locked claim size. Max refund is exactly this: fabrication
    /// can never be profitable (gain <= lock, minus fees, at every scale).
    pub claim_spend: u64,
    pub bump: u8,
}
