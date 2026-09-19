pub mod constants;
pub mod error;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

pub use constants::*;
pub use instructions::*;
pub use state::*;

declare_id!("6EawHaUrwSBpAHJ8eqQo2Lf9nAwJKZ54mfgSjFiUsjyQ");

#[program]
pub mod harbor {
    use super::*;

    pub fn register_merchant(
        ctx: Context<RegisterMerchant>,
        sla_bps: u16,
        challenge_slots: u64,
    ) -> Result<()> {
        register_merchant::handler(ctx, sla_bps, challenge_slots)
    }

    pub fn post_bond(ctx: Context<PostBond>, amount: u64) -> Result<()> {
        post_bond::handler(ctx, amount)
    }

    pub fn top_up_bond(ctx: Context<TopUpBond>, amount: u64) -> Result<()> {
        top_up_bond::handler(ctx, amount)
    }

    pub fn withdraw_bond(ctx: Context<WithdrawBond>, amount: u64) -> Result<()> {
        withdraw_bond::handler(ctx, amount)
    }

    pub fn bind_channel(ctx: Context<BindChannel>, max_spend: u64) -> Result<()> {
        bind_channel::handler(ctx, max_spend)
    }
}
