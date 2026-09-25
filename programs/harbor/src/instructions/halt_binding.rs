use crate::{error::HarborError, state::*};
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct HaltBinding<'info> {
    #[account(mut)]
    pub merchant: Signer<'info>,
    #[account(
        mut,
        has_one = merchant @ HarborError::Unauthorized,
    )]
    pub binding: Account<'info, ChannelBinding>,
}

pub fn handle_halt_binding(ctx: Context<HaltBinding>) -> Result<()> {
    ctx.accounts.binding.halted = true;
    emit!(BindingHalted {
        binding: ctx.accounts.binding.key(),
    });
    Ok(())
}

#[event]
pub struct BindingHalted {
    pub binding: Pubkey,
}
