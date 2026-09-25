use crate::{constants::*, error::HarborError, state::*};
use anchor_lang::prelude::*;
use anchor_spl::token_interface::Mint;

#[derive(Accounts)]
pub struct RegisterMerchant<'info> {
    #[account(mut)]
    pub merchant: Signer<'info>,
    #[account(
        init,
        payer = merchant,
        space = 8 + MerchantBond::INIT_SPACE,
        seeds = [BOND_SEED, merchant.key().as_ref(), mint.key().as_ref()],
        bump
    )]
    pub bond: Account<'info, MerchantBond>,
    pub mint: InterfaceAccount<'info, Mint>,
    pub system_program: Program<'info, System>,
}

pub fn handle_register_merchant(
    ctx: Context<RegisterMerchant>,
    sla_bps: u16,
    challenge_slots: u64,
) -> Result<()> {
    require!(
        sla_bps > 0 && sla_bps <= MAX_SLA_BPS,
        HarborError::InvalidSla
    );
    require!(
        challenge_slots >= MIN_CHALLENGE_SLOTS,
        HarborError::InvalidChallengeWindow
    );
    let bond = &mut ctx.accounts.bond;
    bond.merchant = ctx.accounts.merchant.key();
    bond.mint = ctx.accounts.mint.key();
    bond.amount = 0;
    bond.sla_bps = sla_bps;
    bond.challenge_slots = challenge_slots;
    bond.open_disputes = 0;
    bond.last_change_slot = Clock::get()?.slot;
    bond.bump = ctx.bumps.bond;

    emit!(MerchantRegistered {
        merchant: bond.merchant,
        mint: bond.mint,
        sla_bps,
        challenge_slots,
    });
    Ok(())
}

#[event]
pub struct MerchantRegistered {
    pub merchant: Pubkey,
    pub mint: Pubkey,
    pub sla_bps: u16,
    pub challenge_slots: u64,
}
