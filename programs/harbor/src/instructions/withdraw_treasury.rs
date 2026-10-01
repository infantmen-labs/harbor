use crate::{constants::*, error::HarborError};
use anchor_lang::prelude::*;
use anchor_lang::solana_program::bpf_loader_upgradeable;
use anchor_spl::token_interface::{self, Mint, TokenAccount, TokenInterface};

#[derive(Accounts)]
pub struct WithdrawTreasury<'info> {
    pub authority: Signer<'info>,
    /// CHECK: verified in handler as this program's programdata account;
    /// the upgrade authority read from its bytes must match the signer.
    pub programdata: UncheckedAccount<'info>,
    /// CHECK: verified in handler as the treasury PDA for the mint.
    pub treasury: UncheckedAccount<'info>,
    #[account(
        mut,
        constraint = treasury_ata.owner == treasury.key() @ HarborError::BindingMismatch,
        constraint = treasury_ata.mint == mint.key() @ HarborError::BadMint,
    )]
    pub treasury_ata: InterfaceAccount<'info, TokenAccount>,
    #[account(
        mut,
        constraint = destination_ata.mint == mint.key() @ HarborError::BadMint,
    )]
    pub destination_ata: InterfaceAccount<'info, TokenAccount>,
    pub mint: InterfaceAccount<'info, Mint>,
    pub token_program: Interface<'info, TokenInterface>,
}

/// Moves accumulated fee + penalty funds out of the per-mint backstop
/// treasury. Only the program's upgrade authority can do this — the same
/// key that could already drain the vaults via upgrade, so no new trust
/// is introduced. Until a multisig holds that key (see docs/authority.md),
/// this is a governance escape hatch, not a spending path.
pub fn handle_withdraw_treasury(ctx: Context<WithdrawTreasury>, amount: u64) -> Result<()> {
    require!(amount > 0, HarborError::ZeroAmount);

    let (expected_pd, _) =
        Pubkey::find_program_address(&[crate::ID.as_ref()], &bpf_loader_upgradeable::ID);
    require!(
        ctx.accounts.programdata.key() == expected_pd,
        HarborError::BindingMismatch
    );
    // BPFLoaderUpgradeable ProgramData layout:
    // discriminator[4] | slot[8] | Option<Pubkey> upgrade authority.
    let pd = ctx
        .accounts
        .programdata
        .try_borrow_data()
        .map_err(|_| HarborError::Unauthorized)?;
    require!(pd.len() >= 45 && pd[12] == 1, HarborError::Unauthorized);
    require!(
        &pd[13..45] == ctx.accounts.authority.key().as_ref(),
        HarborError::Unauthorized
    );

    let (treasury_key, bump) = Pubkey::find_program_address(
        &[TREASURY_SEED, ctx.accounts.mint.key().as_ref()],
        &crate::ID,
    );
    require!(
        ctx.accounts.treasury.key() == treasury_key,
        HarborError::BindingMismatch
    );

    let mint_key = ctx.accounts.mint.key();
    let seeds: &[&[u8]] = &[TREASURY_SEED, mint_key.as_ref(), &[bump]];
    token_interface::transfer_checked(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.key(),
            token_interface::TransferChecked {
                from: ctx.accounts.treasury_ata.to_account_info(),
                to: ctx.accounts.destination_ata.to_account_info(),
                authority: ctx.accounts.treasury.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
            },
            &[seeds],
        ),
        amount,
        ctx.accounts.mint.decimals,
    )?;
    Ok(())
}
