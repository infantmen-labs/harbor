// Anchor's `#[program]` expansion trips `diverging_sub_expression` on code
// we cannot restructure; allow it crate-wide rather than sprinkling the
// macro call site (where the attribute does not propagate).
#![allow(clippy::diverging_sub_expression)]

pub mod constants;
pub mod error;
pub mod instructions;
pub mod mint_guard;
pub mod state;

use anchor_lang::prelude::*;

pub use constants::*;
pub use instructions::*;
pub use state::*;

declare_id!("BuRyKLqCsTLcyLVFEjxTjmF4DryCT3LmVDjwqhduvB4H");

#[program]
pub mod harbor {
    use super::*;

    pub fn register_merchant(
        ctx: Context<RegisterMerchant>,
        sla_bps: u16,
        challenge_slots: u64,
    ) -> Result<()> {
        register_merchant::handle_register_merchant(ctx, sla_bps, challenge_slots)
    }

    pub fn post_bond(ctx: Context<PostBond>, amount: u64) -> Result<()> {
        post_bond::handle_post_bond(ctx, amount)
    }

    pub fn top_up_bond(ctx: Context<TopUpBond>, amount: u64) -> Result<()> {
        top_up_bond::handle_top_up_bond(ctx, amount)
    }

    pub fn withdraw_bond(ctx: Context<WithdrawBond>, amount: u64) -> Result<()> {
        withdraw_bond::handle_withdraw_bond(ctx, amount)
    }

    pub fn bind_channel(
        ctx: Context<BindChannel>,
        channel_program: Pubkey,
        max_spend: u64,
    ) -> Result<()> {
        bind_channel::handle_bind_channel(ctx, channel_program, max_spend)
    }

    pub fn halt_binding(ctx: Context<HaltBinding>) -> Result<()> {
        halt_binding::handle_halt_binding(ctx)
    }

    // Instruction args are the onchain ABI (mirrored in the IDL and the
    // TS builder); they cannot be bundled without a protocol change.
    #[allow(clippy::too_many_arguments)]
    pub fn submit_receipt(
        ctx: Context<SubmitReceipt>,
        cumulative_spend: u64,
        meter_hash: [u8; 32],
        output_hash: [u8; 32],
        status: u8,
        nonce: u64,
        expiry_slot: u64,
        signer: Pubkey,
    ) -> Result<()> {
        submit_receipt::handle_submit_receipt(
            ctx,
            cumulative_spend,
            meter_hash,
            output_hash,
            status,
            nonce,
            expiry_slot,
            signer,
        )
    }

    pub fn open_dispute(
        ctx: Context<OpenDispute>,
        nonce: u64,
        reason: u8,
        claim_spend: u64,
    ) -> Result<()> {
        open_dispute::handle_open_dispute(ctx, nonce, reason, claim_spend)
    }

    pub fn resolve_timeout(ctx: Context<ResolveTimeout>, nonce: u64) -> Result<()> {
        resolve_dispute::handle_resolve_timeout(ctx, nonce)
    }

    pub fn refund_unused(ctx: Context<RefundUnused>) -> Result<()> {
        refund_unused::handle_refund_unused(ctx)
    }

    pub fn withdraw_treasury(ctx: Context<WithdrawTreasury>, amount: u64) -> Result<()> {
        withdraw_treasury::handle_withdraw_treasury(ctx, amount)
    }
}
