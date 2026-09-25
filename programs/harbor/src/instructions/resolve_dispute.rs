use crate::{constants::*, error::HarborError, state::*};
use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self, Mint, TokenAccount, TokenInterface};

fn expected_receipt_key(binding: &Pubkey, nonce: u64) -> Pubkey {
    Pubkey::find_program_address(
        &[RECEIPT_SEED, binding.as_ref(), &nonce.to_le_bytes()],
        &crate::ID,
    )
    .0
}

fn receipt_exists(receipt: &UncheckedAccount) -> bool {
    receipt
        .try_borrow_data()
        .map(|d| !d.is_empty())
        .unwrap_or(false)
}

#[derive(Accounts)]
#[instruction(nonce: u64)]
pub struct ResolveTimeout<'info> {
    pub resolver: Signer<'info>,
    #[account(mut, has_one = mint @ HarborError::BadMint)]
    pub bond: Account<'info, MerchantBond>,
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(constraint = binding.bond == bond.key() @ HarborError::BindingMismatch)]
    pub binding: Account<'info, ChannelBinding>,
    #[account(
        mut,
        close = claimant,
        seeds = [DISPUTE_SEED, binding.key().as_ref(), &nonce.to_le_bytes()],
        bump = dispute.bump,
        constraint = dispute.binding == binding.key() @ HarborError::BindingMismatch,
    )]
    pub dispute: Account<'info, Dispute>,
    #[account(mut, constraint = claimant.key() == dispute.claimant @ HarborError::Unauthorized)]
    pub claimant: SystemAccount<'info>,
    /// CHECK: key verified in handler; must be empty for a timeout slash.
    pub receipt: UncheckedAccount<'info>,
    #[account(
        mut,
        constraint = vault.owner == bond.key() @ HarborError::BindingMismatch,
        constraint = vault.mint == mint.key() @ HarborError::BadMint,
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,
    #[account(
        mut,
        constraint = claimant_ata.owner == dispute.claimant @ HarborError::Unauthorized,
        constraint = claimant_ata.mint == mint.key() @ HarborError::BadMint,
    )]
    pub claimant_ata: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Interface<'info, TokenInterface>,
}

pub fn handle_resolve_timeout(ctx: Context<ResolveTimeout>, nonce: u64) -> Result<()> {
    require!(
        ctx.accounts.receipt.key() == expected_receipt_key(&ctx.accounts.binding.key(), nonce),
        HarborError::BindingMismatch
    );
    require!(
        !receipt_exists(&ctx.accounts.receipt),
        HarborError::AlreadyDelivered
    );
    require!(
        Clock::get()?.slot > ctx.accounts.dispute.deadline_slot,
        HarborError::DisputeNotMature
    );
    require!(ctx.accounts.bond.amount > 0, HarborError::InsufficientBond);

    let cap = (ctx.accounts.binding.max_spend as u128)
        .checked_mul(ctx.accounts.bond.sla_bps as u128)
        .unwrap()
        .checked_div(BPS_DENOMINATOR as u128)
        .unwrap() as u64;
    let slash = ctx.accounts.bond.amount.min(cap);
    require!(slash > 0, HarborError::ZeroAmount);

    let merchant_key = ctx.accounts.bond.merchant;
    let mint_key = ctx.accounts.mint.key();
    let seeds: &[&[u8]] = &[
        BOND_SEED,
        merchant_key.as_ref(),
        mint_key.as_ref(),
        &[ctx.accounts.bond.bump],
    ];
    token_interface::transfer_checked(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.key(),
            token_interface::TransferChecked {
                from: ctx.accounts.vault.to_account_info(),
                to: ctx.accounts.claimant_ata.to_account_info(),
                authority: ctx.accounts.bond.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
            },
            &[seeds],
        ),
        slash,
        ctx.accounts.mint.decimals,
    )?;

    let bond = &mut ctx.accounts.bond;
    bond.amount = bond.amount.checked_sub(slash).unwrap();
    bond.open_disputes = bond.open_disputes.checked_sub(1).unwrap();

    emit!(BondSlashed {
        binding: ctx.accounts.binding.key(),
        nonce,
        claimant: ctx.accounts.dispute.claimant,
        slash,
    });
    Ok(())
}

#[derive(Accounts)]
#[instruction(nonce: u64)]
pub struct ResolveDelivered<'info> {
    pub resolver: Signer<'info>,
    #[account(mut, has_one = merchant @ HarborError::Unauthorized)]
    pub bond: Account<'info, MerchantBond>,
    #[account(mut)]
    pub merchant: SystemAccount<'info>,
    #[account(constraint = binding.bond == bond.key() @ HarborError::BindingMismatch)]
    pub binding: Account<'info, ChannelBinding>,
    #[account(
        mut,
        close = merchant,
        seeds = [DISPUTE_SEED, binding.key().as_ref(), &nonce.to_le_bytes()],
        bump = dispute.bump,
        constraint = dispute.binding == binding.key() @ HarborError::BindingMismatch,
    )]
    pub dispute: Account<'info, Dispute>,
    /// CHECK: key verified in handler; must hold a receipt for this path.
    pub receipt: UncheckedAccount<'info>,
}

pub fn handle_resolve_delivered(ctx: Context<ResolveDelivered>, nonce: u64) -> Result<()> {
    require!(
        ctx.accounts.receipt.key() == expected_receipt_key(&ctx.accounts.binding.key(), nonce),
        HarborError::BindingMismatch
    );
    require!(
        receipt_exists(&ctx.accounts.receipt),
        HarborError::NoDelivery
    );

    ctx.accounts.bond.open_disputes = ctx.accounts.bond.open_disputes.checked_sub(1).unwrap();

    emit!(DisputeResolved {
        binding: ctx.accounts.binding.key(),
        nonce,
        winner: ctx.accounts.merchant.key(),
        slashed: false,
    });
    Ok(())
}

#[event]
pub struct BondSlashed {
    pub binding: Pubkey,
    pub nonce: u64,
    pub claimant: Pubkey,
    pub slash: u64,
}

#[event]
pub struct DisputeResolved {
    pub binding: Pubkey,
    pub nonce: u64,
    pub winner: Pubkey,
    pub slashed: bool,
}
