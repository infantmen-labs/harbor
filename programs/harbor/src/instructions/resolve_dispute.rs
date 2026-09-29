use crate::{constants::*, error::HarborError, mint_guard, state::*};
use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::{self, AssociatedToken},
    token_interface::{self, Mint, TokenAccount, TokenInterface},
};

fn expected_treasury_key(mint: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(&[TREASURY_SEED, mint.as_ref()], &crate::ID).0
}

#[derive(Accounts)]
#[instruction(nonce: u64)]
pub struct ResolveTimeout<'info> {
    #[account(mut)]
    pub resolver: Signer<'info>,
    #[account(mut, has_one = mint @ HarborError::BadMint)]
    pub bond: Box<Account<'info, MerchantBond>>,
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(constraint = binding.bond == bond.key() @ HarborError::BindingMismatch)]
    pub binding: Account<'info, ChannelBinding>,
    #[account(
        mut,
        close = claimant,
        seeds = [DISPUTE_SEED, binding.key().as_ref(), &nonce.to_le_bytes()],
        bump = dispute.bump,
        constraint = dispute.binding == binding.key() @ HarborError::BindingMismatch,
    )]
    pub dispute: Box<Account<'info, Dispute>>,
    #[account(mut, constraint = claimant.key() == dispute.claimant @ HarborError::Unauthorized)]
    pub claimant: SystemAccount<'info>,
    /// CHECK: key verified in handler; the treasury PDA itself is
    /// deliberately never funded — funds live in its ATA below.
    pub treasury: UncheckedAccount<'info>,
    #[account(
        mut,
        constraint = vault.owner == bond.key() @ HarborError::BindingMismatch,
        constraint = vault.mint == mint.key() @ HarborError::BadMint,
    )]
    pub vault: Box<InterfaceAccount<'info, TokenAccount>>,
    /// CHECK: verified as the canonical treasury ATA in the handler
    /// before creation/use. Manual creation (not `init`) mirroring the
    /// vault pattern in post_bond; rent paid by the resolver.
    #[account(mut)]
    pub treasury_ata: UncheckedAccount<'info>,
    #[account(
        mut,
        constraint = claimant_ata.owner == dispute.claimant @ HarborError::Unauthorized,
        constraint = claimant_ata.mint == mint.key() @ HarborError::BadMint,
    )]
    pub claimant_ata: Box<InterfaceAccount<'info, TokenAccount>>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

/// Resolves a matured dispute: refund the locked claim minus the
/// protocol fee, and drain the penalty from the bond. Both fee and
/// penalty land in the per-mint treasury ATA (program-controlled
/// backstop). This is the ONLY resolve path — there is no acquittal:
/// receipts are merchant-signed liveness attestations and are never
/// evidence against a claim.
pub fn handle_resolve_timeout(ctx: Context<ResolveTimeout>, nonce: u64) -> Result<()> {
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
        ctx.accounts.treasury.key() == expected_treasury_key(&ctx.accounts.mint.key()),
        HarborError::BindingMismatch
    );
    // Canonical treasury ATA commits to (treasury, token program, mint).
    let (expected_ata, _) = Pubkey::find_program_address(
        &[
            ctx.accounts.treasury.key().as_ref(),
            ctx.accounts.token_program.key().as_ref(),
            ctx.accounts.mint.key().as_ref(),
        ],
        &ctx.accounts.associated_token_program.key(),
    );
    require!(
        ctx.accounts.treasury_ata.key() == expected_ata,
        HarborError::BindingMismatch
    );
    if ctx.accounts.treasury_ata.lamports() == 0 {
        associated_token::create_idempotent(CpiContext::new(
            ctx.accounts.associated_token_program.key(),
            associated_token::Create {
                payer: ctx.accounts.resolver.to_account_info(),
                associated_token: ctx.accounts.treasury_ata.to_account_info(),
                authority: ctx.accounts.treasury.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
                system_program: ctx.accounts.system_program.to_account_info(),
                token_program: ctx.accounts.token_program.to_account_info(),
            },
        ))?;
    }

    require!(
        Clock::get()?.slot > ctx.accounts.dispute.deadline_slot,
        HarborError::DisputeNotMature
    );

    let claim = ctx.accounts.dispute.claim_spend;
    let fee = claim
        .checked_mul(CLAIM_FEE_BPS)
        .ok_or(HarborError::ArithmeticOverflow)?
        .checked_div(BPS_DENOMINATOR)
        .ok_or(HarborError::ArithmeticOverflow)?;
    let refund = claim
        .checked_sub(fee)
        .ok_or(HarborError::ArithmeticOverflow)?;
    let penalty = claim
        .checked_mul(PENALTY_MULT)
        .ok_or(HarborError::ArithmeticOverflow)?;
    let outflow = refund
        .checked_add(fee)
        .ok_or(HarborError::ArithmeticOverflow)?
        .checked_add(penalty)
        .ok_or(HarborError::ArithmeticOverflow)?;
    require!(outflow > 0, HarborError::ZeroAmount);

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
        refund,
        ctx.accounts.mint.decimals,
    )?;
    token_interface::transfer_checked(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.key(),
            token_interface::TransferChecked {
                from: ctx.accounts.vault.to_account_info(),
                to: ctx.accounts.treasury_ata.to_account_info(),
                authority: ctx.accounts.bond.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
            },
            &[seeds],
        ),
        fee.checked_add(penalty)
            .ok_or(HarborError::ArithmeticOverflow)?,
        ctx.accounts.mint.decimals,
    )?;

    let bond = &mut ctx.accounts.bond;
    // The fee comes out of the claimant's locked principal; only the
    // penalty hits the bond. Invariant: vault == amount + open claims.
    bond.amount = bond
        .amount
        .checked_sub(penalty)
        .ok_or(HarborError::ArithmeticOverflow)?;
    bond.reserved = bond
        .reserved
        .checked_sub(outflow)
        .ok_or(HarborError::ArithmeticOverflow)?;
    bond.open_disputes = bond
        .open_disputes
        .checked_sub(1)
        .ok_or(HarborError::ArithmeticOverflow)?;

    emit!(BondSlashed {
        binding: ctx.accounts.binding.key(),
        nonce,
        claimant: ctx.accounts.dispute.claimant,
        slash: penalty,
    });
    emit!(ClaimRefunded {
        binding: ctx.accounts.binding.key(),
        nonce,
        claimant: ctx.accounts.dispute.claimant,
        refund,
        fee,
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
pub struct ClaimRefunded {
    pub binding: Pubkey,
    pub nonce: u64,
    pub claimant: Pubkey,
    pub refund: u64,
    pub fee: u64,
}
