use anchor_lang::prelude::*;

/// Token-2022 program:
/// `TokenzQdBNbLqP5VEhdkAS6EPFLrVv6unobLDGkq`.
pub const TOKEN_2022_PROGRAM_ID: Pubkey = Pubkey::new_from_array([
    0, 0, 2, 78, 123, 43, 59, 179, 122, 230, 196, 68, 111, 55, 155, 31, 197, 43, 164, 97,
    49, 108, 211, 157, 147, 217, 197, 43, 57, 110, 50, 90,
]);

/// Base mint length before Token-2022 TLV extensions.
const BASE_MINT_LEN: usize = 82;

/// Extension discriminants that disqualify a mint as bond collateral:
/// NonTransferable (9), PermanentDelegate (12), Pausable (26).
/// See Token-2022 `ExtensionType` (repr u16, positional).
const BLOCKED_EXTENSIONS: [u16; 3] = [9, 12, 26];

/// True when the mint carries an extension that could seize, freeze, or
/// brick bond funds. Tokenkeg mints and short accounts never match.
pub fn mint_blocked(mint_data: &[u8], owner: &Pubkey) -> bool {
    if *owner != TOKEN_2022_PROGRAM_ID || mint_data.len() <= BASE_MINT_LEN {
        return false;
    }
    let mut off = BASE_MINT_LEN;
    while off + 4 <= mint_data.len() {
        let ty = u16::from_le_bytes([mint_data[off], mint_data[off + 1]]);
        let len = u16::from_le_bytes([mint_data[off + 2], mint_data[off + 3]]) as usize;
        if BLOCKED_EXTENSIONS.contains(&ty) {
            return true;
        }
        off += 4 + len;
    }
    false
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tlv(types: &[(u16, usize)]) -> Vec<u8> {
        let mut v = vec![0u8; BASE_MINT_LEN];
        for (ty, len) in types {
            v.extend_from_slice(&ty.to_le_bytes());
            v.extend_from_slice(&(*len as u16).to_le_bytes());
            v.extend(vec![7u8; *len]);
        }
        v
    }

    const OWNER_2022: Pubkey = TOKEN_2022_PROGRAM_ID;
    const OWNER_CLASSIC: Pubkey = Pubkey::new_from_array([1u8; 32]);

    #[test]
    fn classic_mint_never_blocked() {
        assert!(!mint_blocked(&vec![0u8; 82], &OWNER_CLASSIC));
        assert!(!mint_blocked(&vec![0u8; 200], &OWNER_CLASSIC));
    }

    #[test]
    fn short_data_never_blocked() {
        assert!(!mint_blocked(&vec![0u8; 82], &OWNER_2022));
        assert!(!mint_blocked(&[], &OWNER_2022));
    }

    #[test]
    fn benign_extensions_pass() {
        // TransferFeeConfig (1) + MemoTransfer (8).
        assert!(!mint_blocked(&tlv(&[(1, 20), (8, 4)]), &OWNER_2022));
    }

    #[test]
    fn blocked_extensions_rejected() {
        // NonTransferable (9), zero-length body.
        assert!(mint_blocked(&tlv(&[(9, 0)]), &OWNER_2022));
        // PermanentDelegate (12) after a benign extension.
        assert!(mint_blocked(&tlv(&[(1, 20), (12, 32)]), &OWNER_2022));
        // Pausable (26).
        assert!(mint_blocked(&tlv(&[(26, 16)]), &OWNER_2022));
    }
}
