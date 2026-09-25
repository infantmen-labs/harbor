use crate::{constants::*, error::HarborError, state::*};
use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::{self, AssociatedToken},
    token_interface::{self, Mint, TokenAccount, TokenInterface},
};

#[derive(Accounts)]
pub struct PostBond<'info> {
    #[account(mut)]
    pub merchant: Signer<'info>,
    #[account(
        mut,
        seeds = [BOND_SEED, merchant.key().as_ref(), mint.key().as_ref()],
        bump = bond.bump,
        has_one = merchant @ HarborError::Unauthorized,
        has_one = mint @ HarborError::BadMint,
    )]
    pub bond: Account<'info, MerchantBond>,
    #[account(
        constraint = !crate::mint_guard::mint_unsupported(mint.to_account_info().owner)
            @ HarborError::UnsupportedMint
    )]
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(
        mut,
        constraint = merchant_ata.mint == mint.key() @ HarborError::BadMint,
        constraint = merchant_ata.owner == merchant.key() @ HarborError::Unauthorized,
    )]
    pub merchant_ata: InterfaceAccount<'info, TokenAccount>,
    /// CHECK: verified as the canonical bond vault ATA in the handler
    /// before creation/use. Manual creation (not `init`) so the mint gate
    /// provably runs before any vault CPI. `mut` for CPI writability only;
    /// key and creation are enforced in the handler.
    #[account(mut)]
    pub vault: UncheckedAccount<'info>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<PostBond>, amount: u64) -> Result<()> {
    require!(amount > 0, HarborError::ZeroAmount);
    // Mint gate runs before any vault CPI (field constraints cannot be
    // relied on to order before init CPIs).
    require!(
        !crate::mint_guard::mint_unsupported(ctx.accounts.mint.to_account_info().owner),
        HarborError::UnsupportedMint
    );

    // Canonical vault address commits to (bond, token program, mint).
    let (expected_vault, _) = Pubkey::find_program_address(
        &[
            ctx.accounts.bond.key().as_ref(),
            ctx.accounts.token_program.key().as_ref(),
            ctx.accounts.mint.key().as_ref(),
        ],
        &ctx.accounts.associated_token_program.key(),
    );
    require!(
        ctx.accounts.vault.key() == expected_vault,
        HarborError::InvalidVault
    );
    if ctx.accounts.vault.lamports() == 0 {
        associated_token::create_idempotent(CpiContext::new(
            ctx.accounts.associated_token_program.key(),
            associated_token::Create {
                payer: ctx.accounts.merchant.to_account_info(),
                associated_token: ctx.accounts.vault.to_account_info(),
                authority: ctx.accounts.bond.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
                system_program: ctx.accounts.system_program.to_account_info(),
                token_program: ctx.accounts.token_program.to_account_info(),
            },
        ))?;
    }

    token_interface::transfer_checked(
        CpiContext::new(
            ctx.accounts.token_program.key(),
            token_interface::TransferChecked {
                from: ctx.accounts.merchant_ata.to_account_info(),
                to: ctx.accounts.vault.to_account_info(),
                authority: ctx.accounts.merchant.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
            },
        ),
        amount,
        ctx.accounts.mint.decimals,
    )?;

    let bond = &mut ctx.accounts.bond;
    bond.amount = bond.amount.checked_add(amount).unwrap();
    bond.last_change_slot = Clock::get()?.slot;

    emit!(BondPosted {
        merchant: bond.merchant,
        mint: bond.mint,
        amount,
        total: bond.amount,
    });
    Ok(())
}

#[event]
pub struct BondPosted {
    pub merchant: Pubkey,
    pub mint: Pubkey,
    pub amount: u64,
    pub total: u64,
}
