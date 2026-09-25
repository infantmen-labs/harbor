use crate::{constants::*, error::HarborError, state::*};
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct BindChannel<'info> {
    #[account(mut)]
    pub merchant: Signer<'info>,
    #[account(has_one = merchant @ HarborError::Unauthorized)]
    pub bond: Account<'info, MerchantBond>,
    #[account(
        init,
        payer = merchant,
        space = 8 + ChannelBinding::INIT_SPACE,
        seeds = [BINDING_SEED, channel.key().as_ref()],
        bump
    )]
    pub binding: Account<'info, ChannelBinding>,
    /// CHECK: Upstream payment-channel PDA. Full seed verification lands with
    /// devnet integration; until then the binding key commits to this address.
    pub channel: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

pub fn handle_bind_channel(ctx: Context<BindChannel>, channel_program: Pubkey, max_spend: u64) -> Result<()> {
    require!(max_spend > 0, HarborError::ZeroAmount);
    require!(
        ctx.accounts.channel.key() != Pubkey::default(),
        HarborError::BindingMismatch
    );
    require!(
        *ctx.accounts.channel.owner == channel_program,
        HarborError::BindingMismatch
    );

    let binding = &mut ctx.accounts.binding;
    binding.channel = ctx.accounts.channel.key();
    binding.merchant = ctx.accounts.merchant.key();
    binding.bond = ctx.accounts.bond.key();
    binding.channel_program = channel_program;
    binding.max_spend = max_spend;
    binding.last_nonce = 0;
    binding.last_cumulative_spend = 0;
    binding.halted = false;
    binding.bump = ctx.bumps.binding;

    emit!(ChannelBound {
        channel: binding.channel,
        merchant: binding.merchant,
        bond: binding.bond,
        max_spend,
    });
    Ok(())
}

#[event]
pub struct ChannelBound {
    pub channel: Pubkey,
    pub merchant: Pubkey,
    pub bond: Pubkey,
    pub max_spend: u64,
}
