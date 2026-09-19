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
}
