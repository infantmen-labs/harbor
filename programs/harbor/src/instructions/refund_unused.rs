use crate::{constants::*, error::HarborError, state::*};
use anchor_lang::{
    prelude::*,
    solana_program::{
        instruction::{AccountMeta, Instruction},
        program::invoke_signed,
    },
};
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

#[derive(Accounts)]
pub struct RefundUnused<'info> {
    #[account(mut)]
    pub merchant: Signer<'info>,
    #[account(
        mut,
        close = merchant,
        has_one = merchant @ HarborError::Unauthorized,
        has_one = mint @ HarborError::BadMint,
        constraint = bond.amount == 0 @ HarborError::BondNotEmpty,
        constraint = bond.open_disputes == 0 @ HarborError::DisputeOpen,
    )]
    pub bond: Account<'info, MerchantBond>,
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(
        mut,
        constraint = vault.owner == bond.key() @ HarborError::BindingMismatch,
        constraint = vault.mint == mint.key() @ HarborError::BadMint,
        constraint = vault.amount == 0 @ HarborError::VaultNotEmpty,
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,
    #[account(
        mut,
        constraint = merchant_ata.owner == merchant.key() @ HarborError::Unauthorized,
        constraint = merchant_ata.mint == mint.key() @ HarborError::BadMint,
    )]
    pub merchant_ata: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Interface<'info, TokenInterface>,
}

pub fn handle_refund_unused(ctx: Context<RefundUnused>) -> Result<()> {
    let unlock = ctx
        .accounts
        .bond
        .last_change_slot
        .checked_add(WITHDRAW_DELAY_SLOTS)
        .ok_or(HarborError::ArithmeticOverflow)?;
    require!(Clock::get()?.slot > unlock, HarborError::TimelockNotPassed);

    // Close the empty vault ATA (Tokenkeg/Token-2022 close discriminant: 9).
    let merchant_key = ctx.accounts.merchant.key();
    let mint_key = ctx.accounts.mint.key();
    let seeds: &[&[u8]] = &[
        BOND_SEED,
        merchant_key.as_ref(),
        mint_key.as_ref(),
        &[ctx.accounts.bond.bump],
    ];
    let ix = Instruction {
        program_id: ctx.accounts.token_program.key(),
        accounts: vec![
            AccountMeta::new(ctx.accounts.vault.key(), false),
            AccountMeta::new(ctx.accounts.merchant_ata.key(), false),
            AccountMeta::new_readonly(ctx.accounts.bond.key(), true),
        ],
        data: vec![9],
    };
    invoke_signed(
        &ix,
        &[
            ctx.accounts.vault.to_account_info(),
            ctx.accounts.merchant_ata.to_account_info(),
            ctx.accounts.bond.to_account_info(),
        ],
        &[seeds],
    )?;

    emit!(BondClosed {
        merchant: ctx.accounts.merchant.key(),
        mint: ctx.accounts.mint.key(),
    });
    Ok(())
}

#[event]
pub struct BondClosed {
    pub merchant: Pubkey,
    pub mint: Pubkey,
}
