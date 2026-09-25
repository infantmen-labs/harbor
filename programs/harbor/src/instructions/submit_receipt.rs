use crate::{constants::*, error::HarborError, state::*};
use anchor_lang::prelude::*;
use borsh::to_vec;
use solana_sha256_hasher::hashv;
use solana_instructions_sysvar::{
    load_current_index_checked, load_instruction_at_checked, ID as INSTRUCTIONS_SYSVAR_ID,
};

/// Ed25519 signature-verification precompile:
/// `Ed25519SigVerify111111111111111111111111111`.
const ED25519_PROGRAM_ID: Pubkey = Pubkey::new_from_array([
    3, 125, 70, 214, 124, 147, 251, 190, 18, 249, 66, 143, 131, 141, 64, 255, 5, 112, 116,
    73, 39, 244, 138, 100, 252, 202, 112, 68, 128, 0, 0, 0,
]);

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct ReceiptMessage {
    pub merchant: Pubkey,
    pub binding: Pubkey,
    pub cumulative_spend: u64,
    pub meter_hash: [u8; 32],
    pub output_hash: [u8; 32],
    pub status: u8,
    pub nonce: u64,
    pub expiry_slot: u64,
    pub signer: Pubkey,
}

pub fn receipt_message_bytes(
    merchant: &Pubkey,
    binding: &Pubkey,
    cumulative_spend: u64,
    meter_hash: &[u8; 32],
    output_hash: &[u8; 32],
    status: u8,
    nonce: u64,
    expiry_slot: u64,
    signer: &Pubkey,
) -> Vec<u8> {
    let message = to_vec(&ReceiptMessage {
        merchant: *merchant,
        binding: *binding,
        cumulative_spend,
        meter_hash: *meter_hash,
        output_hash: *output_hash,
        status,
        nonce,
        expiry_slot,
        signer: *signer,
    })
    .unwrap();
    message
}

fn verify_ed25519_proof(
    ix_sysvar: &AccountInfo,
    signer: &Pubkey,
    message: &[u8],
) -> Result<()> {
    let current = load_current_index_checked(ix_sysvar)? as usize;
    let prev_index = current.checked_sub(1).ok_or(HarborError::BadReceiptProof)?;
    let prev = load_instruction_at_checked(prev_index, ix_sysvar)?;
    require!(
        prev.program_id == ED25519_PROGRAM_ID,
        HarborError::BadReceiptProof
    );

    let d = &prev.data;
    require!(d.len() >= 16 && d[0] == 1, HarborError::BadReceiptProof);
    let u = |o: usize| u16::from_le_bytes([d[o], d[o + 1]]) as usize;
    let (sig_off, key_off, msg_off, msg_len) = (u(2), u(6), u(10), u(12));
    require!(
        d.len() >= sig_off + 64 && d.len() >= key_off + 32 && d.len() >= msg_off + msg_len,
        HarborError::BadReceiptProof
    );
    require!(&d[key_off..key_off + 32] == signer.as_ref(), HarborError::Unauthorized);
    require!(&d[msg_off..msg_off + msg_len] == message, HarborError::BadReceiptProof);
    Ok(())
}

#[derive(Accounts)]
#[instruction(
    cumulative_spend: u64,
    meter_hash: [u8; 32],
    output_hash: [u8; 32],
    status: u8,
    nonce: u64
)]
pub struct SubmitReceipt<'info> {
    #[account(mut)]
    pub merchant: Signer<'info>,
    #[account(has_one = merchant @ HarborError::Unauthorized)]
    pub bond: Account<'info, MerchantBond>,
    #[account(
        mut,
        has_one = merchant @ HarborError::Unauthorized,
        constraint = binding.bond == bond.key() @ HarborError::BindingMismatch,
    )]
    pub binding: Account<'info, ChannelBinding>,
    #[account(
        init,
        payer = merchant,
        space = 8 + ReceiptLog::INIT_SPACE,
        seeds = [RECEIPT_SEED, binding.key().as_ref(), &nonce.to_le_bytes()],
        bump
    )]
    pub receipt: Account<'info, ReceiptLog>,
    /// CHECK: verified against the Ed25519 precompile pattern in the handler.
    #[account(address = INSTRUCTIONS_SYSVAR_ID)]
    pub ix_sysvar: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[allow(clippy::too_many_arguments)]
pub fn handle_submit_receipt(
    ctx: Context<SubmitReceipt>,
    cumulative_spend: u64,
    meter_hash: [u8; 32],
    output_hash: [u8; 32],
    status: u8,
    nonce: u64,
    expiry_slot: u64,
    signer: Pubkey,
) -> Result<()> {
    let slot = Clock::get()?.slot;
    require!(slot <= expiry_slot, HarborError::Expired);
    require!(!ctx.accounts.binding.halted, HarborError::Halted);
    require!(nonce > ctx.accounts.binding.last_nonce, HarborError::Replay);
    require!(signer == ctx.accounts.merchant.key(), HarborError::Unauthorized);

    let message = receipt_message_bytes(
        &ctx.accounts.merchant.key(),
        &ctx.accounts.binding.key(),
        cumulative_spend,
        &meter_hash,
        &output_hash,
        status,
        nonce,
        expiry_slot,
        &signer,
    );
    verify_ed25519_proof(
        &ctx.accounts.ix_sysvar.to_account_info(),
        &signer,
        &message,
    )?;

    let receipt = &mut ctx.accounts.receipt;
    receipt.binding = ctx.accounts.binding.key();
    receipt.nonce = nonce;
    receipt.receipt_hash = hashv(&[&message]).to_bytes();
    receipt.cumulative_spend = cumulative_spend;
    receipt.status = status;
    receipt.slot = slot;
    receipt.bump = ctx.bumps.receipt;

    let binding = &mut ctx.accounts.binding;
    binding.last_nonce = nonce;
    binding.last_cumulative_spend = cumulative_spend;

    emit!(ReceiptSubmitted {
        binding: binding.key(),
        nonce,
        cumulative_spend,
    });
    Ok(())
}

#[event]
pub struct ReceiptSubmitted {
    pub binding: Pubkey,
    pub nonce: u64,
    pub cumulative_spend: u64,
}
