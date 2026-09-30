use crate::{constants::*, error::HarborError, mint_guard, state::*};
use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self, Mint, TokenAccount, TokenInterface};

#[derive(Accounts)]
pub struct WithdrawBond<'info> {
    #[account(mut)]
    pub merchant: Signer<'info>,
    #[account(
        mut,
        has_one = merchant @ HarborError::Unauthorized,
        has_one = mint @ HarborError::BadMint,
    )]
    pub bond: Account<'info, MerchantBond>,
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(
        mut,
        constraint = merchant_ata.mint == mint.key() @ HarborError::BadMint,
        constraint = merchant_ata.owner == merchant.key() @ HarborError::Unauthorized,
    )]
    pub merchant_ata: InterfaceAccount<'info, TokenAccount>,
    #[account(
        mut,
        constraint = vault.owner == bond.key() @ HarborError::BindingMismatch,
        constraint = vault.mint == mint.key() @ HarborError::BadMint,
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Interface<'info, TokenInterface>,
}

pub fn handle_withdraw_bond(ctx: Context<WithdrawBond>, amount: u64) -> Result<()> {
    require!(amount > 0, HarborError::ZeroAmount);
    require!(
        ctx.accounts.vault.key()
            == mint_guard::expected_vault_key(
                &ctx.accounts.bond.key(),
                &ctx.accounts.token_program.key(),
                &ctx.accounts.mint.key(),
            ),
        HarborError::InvalidVault
    );
    let unlock = ctx
        .accounts
        .bond
        .last_change_slot
        .checked_add(WITHDRAW_DELAY_SLOTS)
        .ok_or(HarborError::ArithmeticOverflow)?;
    require!(
        Clock::get()?.slot > unlock,
        HarborError::TimelockNotPassed
    );
    // Open disputes lock their full outflow (refund + fee + penalty);
    // withdrawals may only touch the unreserved remainder.
    let free = ctx
        .accounts
        .bond
        .amount
        .checked_sub(ctx.accounts.bond.reserved)
        .ok_or(HarborError::ArithmeticOverflow)?;
    require!(amount <= free, HarborError::DisputeOpen);

    let mint_key = ctx.accounts.mint.key();
    let seeds: &[&[u8]] = &[
        BOND_SEED,
        ctx.accounts.merchant.key.as_ref(),
        mint_key.as_ref(),
        &[ctx.accounts.bond.bump],
    ];
    token_interface::transfer_checked(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.key(),
            token_interface::TransferChecked {
                from: ctx.accounts.vault.to_account_info(),
                to: ctx.accounts.merchant_ata.to_account_info(),
                authority: ctx.accounts.bond.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
            },
            &[seeds],
        ),
        amount,
        ctx.accounts.mint.decimals,
    )?;

    let bond = &mut ctx.accounts.bond;
    bond.amount = bond
        .amount
        .checked_sub(amount)
        .ok_or(HarborError::ArithmeticOverflow)?;
    bond.last_change_slot = Clock::get()?.slot;
    Ok(())
}
