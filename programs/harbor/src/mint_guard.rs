use anchor_lang::prelude::*;

/// Classic Tokenkeg program — the only token program Harbor vaults support.
/// Token-2022 mints are rejected: vault creation and transfer paths are
/// built and tested for Tokenkeg (MVP mint is Tokenkeg USDC).
/// `TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA`.
pub const TOKENKEG_PROGRAM_ID: Pubkey = Pubkey::new_from_array([
    6, 221, 246, 225, 215, 101, 161, 147, 217, 203, 225, 70, 206, 235, 121, 172, 28, 180, 133, 237,
    95, 91, 55, 145, 58, 140, 245, 133, 126, 255, 0, 169,
]);

/// True when the mint's program is not the supported Tokenkeg program.
pub fn mint_unsupported(owner: &Pubkey) -> bool {
    *owner != TOKENKEG_PROGRAM_ID
}

/// Canonical bond-vault ATA for (bond, token program, mint).
/// Every instruction that moves vault funds must check this — owner+mint
/// constraints alone are insufficient because anyone can initialize a
/// token account naming the bond PDA as owner (no owner signature
/// required), diverting locks into an account the protocol cannot
/// fully operate on.
pub fn expected_vault_key(bond: &Pubkey, token_program: &Pubkey, mint: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(
        &[bond.as_ref(), token_program.as_ref(), mint.as_ref()],
        &anchor_spl::associated_token::ID,
    )
    .0
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

    #[test]
    fn vault_key_matches_ata_derivation() {
        // Guards seed-order skew: recompute via the ATA program ID parsed
        // from its trusted base58 encoding, not our byte array.
        use std::str::FromStr;
        let ata_id = Pubkey::from_str("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL").unwrap();
        let bond = Pubkey::new_from_array([1u8; 32]);
        let mint = Pubkey::new_from_array([2u8; 32]);
        let (a, _) = Pubkey::find_program_address(
            &[bond.as_ref(), TOKENKEG_PROGRAM_ID.as_ref(), mint.as_ref()],
            &ata_id,
        );
        assert_eq!(expected_vault_key(&bond, &TOKENKEG_PROGRAM_ID, &mint), a);
        // Different token program => different vault (no cross-program alias).
        let other = Pubkey::new_from_array([9u8; 32]);
        assert_ne!(expected_vault_key(&bond, &other, &mint), a);
    }
}
