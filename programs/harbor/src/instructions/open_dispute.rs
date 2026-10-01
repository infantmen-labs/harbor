use crate::{constants::*, error::HarborError, mint_guard, state::*};
use anchor_lang::{prelude::*, system_program};
use anchor_spl::token_interface::{self, Mint, TokenAccount, TokenInterface};

#[derive(Accounts)]
#[instruction(nonce: u64)]
pub struct OpenDispute<'info> {
    #[account(mut)]
    pub claimant: Signer<'info>,
    #[account(mut)]
    pub bond: Account<'info, MerchantBond>,
    #[account(constraint = binding.bond == bond.key() @ HarborError::BindingMismatch)]
    pub binding: Account<'info, ChannelBinding>,
    /// CHECK: verified in handler against `binding.channel` +
    /// `binding.channel_program` ownership and the stored upstream
    /// payer — only the channel's buyer may claim.
    pub channel: UncheckedAccount<'info>,
    #[account(
        init,
        payer = claimant,
        space = 8 + Dispute::INIT_SPACE,
        seeds = [DISPUTE_SEED, binding.key().as_ref(), &nonce.to_le_bytes()],
        bump
    )]
    pub dispute: Account<'info, Dispute>,
    #[account(
        init,
        payer = claimant,
        space = 8,
        seeds = [CLAIM_SEED, binding.key().as_ref(), &nonce.to_le_bytes()],
        bump
    )]
    /// CHECK: pure tombstone — discriminator only, never read, never
    /// closed. Its existence is the single-claim guarantee.
    pub claim: UncheckedAccount<'info>,
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(
        mut,
        constraint = claimant_ata.owner == claimant.key() @ HarborError::Unauthorized,
        constraint = claimant_ata.mint == bond.mint @ HarborError::BadMint,
    )]
    pub claimant_ata: InterfaceAccount<'info, TokenAccount>,
    #[account(
        mut,
        constraint = vault.owner == bond.key() @ HarborError::BindingMismatch,
        constraint = vault.mint == bond.mint @ HarborError::BadMint,
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

/// Opens a dispute by locking the claimed spend.
///
/// The lock is the claim-size commitment: the max refund is exactly the
/// locked amount, so fabricated claims can never be profitable (gain <=
/// lock, minus fees, at every scale). Claims are additionally capped by
/// the merchant-declared `max_spend` for the binding. Halt does NOT gate
/// disputes — it gates receipts only — so halt can never shield a
/// merchant from claims.
pub fn handle_open_dispute(
    ctx: Context<OpenDispute>,
    nonce: u64,
    reason: u8,
    claim_spend: u64,
) -> Result<()> {
    // Canonical vault only: anyone can initialize a token account naming
    // the bond PDA as owner, so owner+mint checks alone do not bind the
    // protocol's vault.
    require!(
        ctx.accounts.vault.key()
            == mint_guard::expected_vault_key(
                &ctx.accounts.bond.key(),
                &ctx.accounts.token_program.key(),
                &ctx.accounts.mint.key(),
            ),
        HarborError::InvalidVault
    );
    require!(
        ctx.accounts.claimant.key() != ctx.accounts.bond.merchant,
        HarborError::Unauthorized
    );
    // Only the channel's buyer can claim: the upstream channel account
    // must be the bound one, owned by the bound program, carrying the
    // pinned struct version, and recording this claimant as its payer.
    require!(
        ctx.accounts.channel.key() == ctx.accounts.binding.channel,
        HarborError::BindingMismatch
    );
    require!(
        *ctx.accounts.channel.to_account_info().owner == ctx.accounts.binding.channel_program,
        HarborError::BindingMismatch
    );
    {
        let data = ctx
            .accounts
            .channel
            .try_borrow_data()
            .map_err(|_| HarborError::BindingMismatch)?;
        require!(
            data.len() == UPSTREAM_CHANNEL_LEN
                && data[0] == UPSTREAM_CHANNEL_DISC
                && data[1] == UPSTREAM_CHANNEL_VERSION,
            HarborError::BindingMismatch
        );
        require!(
            &data[UPSTREAM_PAYER_OFFSET..UPSTREAM_PAYER_OFFSET + 32]
                == ctx.accounts.claimant.key().as_ref(),
            HarborError::Unauthorized
        );
    }
    require!(claim_spend > 0, HarborError::ZeroAmount);
    require!(
        claim_spend <= ctx.accounts.binding.max_spend,
        HarborError::ClaimTooLarge
    );
    require!(
        ctx.accounts.mint.key() == ctx.accounts.bond.mint,
        HarborError::BadMint
    );
    let outflow = claim_spend
        .checked_mul(1 + PENALTY_MULT)
        .ok_or(HarborError::ArithmeticOverflow)?;
    let free = ctx
        .accounts
        .bond
        .amount
        .checked_sub(ctx.accounts.bond.reserved)
        .ok_or(HarborError::ArithmeticOverflow)?;
    require!(outflow <= free, HarborError::InsufficientBond);

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

    token_interface::transfer_checked(
        CpiContext::new(
            ctx.accounts.token_program.key(),
            token_interface::TransferChecked {
                from: ctx.accounts.claimant_ata.to_account_info(),
                to: ctx.accounts.vault.to_account_info(),
                authority: ctx.accounts.claimant.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
            },
        ),
        claim_spend,
        ctx.accounts.mint.decimals,
    )?;

    let slot = Clock::get()?.slot;
    let dispute = &mut ctx.accounts.dispute;
    dispute.binding = ctx.accounts.binding.key();
    dispute.nonce = nonce;
    dispute.reason = reason;
    dispute.claimant = ctx.accounts.claimant.key();
    dispute.deadline_slot = slot
        .checked_add(ctx.accounts.bond.challenge_slots)
        .ok_or(HarborError::ArithmeticOverflow)?;
    dispute.stake_lamports = DISPUTE_STAKE_LAMPORTS;
    dispute.claim_spend = claim_spend;
    dispute.bump = ctx.bumps.dispute;

    let bond = &mut ctx.accounts.bond;
    bond.open_disputes = bond
        .open_disputes
        .checked_add(1)
        .ok_or(HarborError::ArithmeticOverflow)?;
    bond.reserved = bond
        .reserved
        .checked_add(outflow)
        .ok_or(HarborError::ArithmeticOverflow)?;

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
