use crate::{constants::*, error::HarborError, state::*};
use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
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
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(
        mut,
        constraint = merchant_ata.mint == mint.key() @ HarborError::BadMint,
        constraint = merchant_ata.owner == merchant.key() @ HarborError::Unauthorized,
    )]
    pub merchant_ata: InterfaceAccount<'info, TokenAccount>,
    #[account(
        init,
        payer = merchant,
        associated_token::mint = mint,
        associated_token::authority = bond,
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<PostBond>, amount: u64) -> Result<()> {
    require!(amount > 0, HarborError::ZeroAmount);
    {
        let mint_info = ctx.accounts.mint.to_account_info();
        let data = mint_info.try_borrow_data()?;
        require!(
            !crate::mint_guard::mint_blocked(&data, mint_info.owner),
            HarborError::BlockedMint
        );
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
