use anchor_lang::prelude::*;

/// Classic Tokenkeg program — the only token program Harbor vaults support.
/// Token-2022 mints are rejected: vault creation and transfer paths are
/// built and tested for Tokenkeg (MVP mint is Tokenkeg USDC).
/// `TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA`.
pub const TOKENKEG_PROGRAM_ID: Pubkey = Pubkey::new_from_array([
    6, 221, 246, 225, 215, 101, 161, 147, 217, 203, 225, 70, 206, 235, 121, 172,
    28, 180, 133, 237, 95, 91, 55, 145, 58, 140, 245, 133, 126, 255, 0, 169,
]);

/// True when the mint's program is not the supported Tokenkeg program.
pub fn mint_unsupported(owner: &Pubkey) -> bool {
    *owner != TOKENKEG_PROGRAM_ID
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn program_id_matches_known_address() {
        // Guards against hand-decoded byte skew: Display uses the trusted encoder.
        assert_eq!(
            TOKENKEG_PROGRAM_ID.to_string(),
            "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        );
    }

    #[test]
    fn only_tokenkeg_passes() {
        let other = Pubkey::new_from_array([9u8; 32]);
        assert!(!mint_unsupported(&TOKENKEG_PROGRAM_ID));
        assert!(mint_unsupported(&other));
    }
}
