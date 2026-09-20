use crate::{constants::*, error::HarborError, state::*};
use anchor_lang::{prelude::*, system_program};

#[derive(Accounts)]
#[instruction(nonce: u64)]
pub struct OpenDispute<'info> {
    #[account(mut)]
    pub claimant: Signer<'info>,
    #[account(mut)]
    pub bond: Account<'info, MerchantBond>,
    #[account(constraint = binding.bond == bond.key() @ HarborError::BindingMismatch)]
    pub binding: Account<'info, ChannelBinding>,
    #[account(
        init,
        payer = claimant,
        space = 8 + Dispute::INIT_SPACE,
        seeds = [DISPUTE_SEED, binding.key().as_ref(), &nonce.to_le_bytes()],
        bump
    )]
    pub dispute: Account<'info, Dispute>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<OpenDispute>, nonce: u64, reason: u8) -> Result<()> {
    require!(
        ctx.accounts.claimant.key() != ctx.accounts.bond.merchant,
        HarborError::Unauthorized
    );
    require!(!ctx.accounts.binding.halted, HarborError::Halted);

    system_program::transfer(
        CpiContext::new(
            ctx.accounts.system_program.key(),
            system_program::Transfer {
                from: ctx.accounts.claimant.to_account_info(),
                to: ctx.accounts.dispute.to_account_info(),
            },
        ),
        DISPUTE_STAKE_LAMPORTS,
    )?;

    let slot = Clock::get()?.slot;
    let dispute = &mut ctx.accounts.dispute;
    dispute.binding = ctx.accounts.binding.key();
    dispute.nonce = nonce;
    dispute.reason = reason;
    dispute.claimant = ctx.accounts.claimant.key();
    dispute.deadline_slot = slot.checked_add(ctx.accounts.bond.challenge_slots).unwrap();
    dispute.stake_lamports = DISPUTE_STAKE_LAMPORTS;
    dispute.bump = ctx.bumps.dispute;

    ctx.accounts.bond.open_disputes = ctx.accounts.bond.open_disputes.checked_add(1).unwrap();

    emit!(DisputeOpened {
        binding: dispute.binding,
        nonce,
        reason,
        claimant: dispute.claimant,
        deadline_slot: dispute.deadline_slot,
    });
    Ok(())
}

#[event]
pub struct DisputeOpened {
    pub binding: Pubkey,
    pub nonce: u64,
    pub reason: u8,
    pub claimant: Pubkey,
    pub deadline_slot: u64,
}
