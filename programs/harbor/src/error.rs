use anchor_lang::prelude::*;

#[error_code]
pub enum HarborError {
    #[msg("Bond too small for requested slash")]
    InsufficientBond,
    #[msg("Channel binding does not match")]
    BindingMismatch,
    #[msg("Unexpected mint")]
    BadMint,
    #[msg("Unauthorized signer")]
    Unauthorized,
    #[msg("Bond timelock has not passed")]
    TimelockNotPassed,
    #[msg("Bond has open disputes")]
    DisputeOpen,
    #[msg("SLA out of range")]
    InvalidSla,
    #[msg("Challenge window out of range")]
    InvalidChallengeWindow,
    #[msg("Amount must be greater than zero")]
    ZeroAmount,
    #[msg("Receipt proof failed")]
    BadReceiptProof,
    #[msg("Nonce already recorded")]
    Replay,
    #[msg("Receipt expired")]
    Expired,
    #[msg("Dispute window has not elapsed")]
    DisputeNotMature,
    #[msg("Vault is not empty")]
    VaultNotEmpty,
    #[msg("Bond still holds funds")]
    BondNotEmpty,
    #[msg("Delivery receipt exists; timeout slash unavailable")]
    AlreadyDelivered,
    #[msg("No delivery receipt for this nonce")]
    NoDelivery,
    #[msg("Mint carries a blocked Token-2022 extension")]
    BlockedMint,
    #[msg("Binding is halted")]
    Halted,
}
