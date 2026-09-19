use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct MerchantBond {
    pub merchant: Pubkey,
    pub mint: Pubkey,
    pub amount: u64,
    pub sla_bps: u16,
    pub challenge_slots: u64,
    pub open_disputes: u64,
    pub last_change_epoch: u64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct ChannelBinding {
    pub channel: Pubkey,
    pub merchant: Pubkey,
    pub bond: Pubkey,
    pub max_spend: u64,
    pub bump: u8,
}
