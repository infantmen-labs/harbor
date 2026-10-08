# Harbor Receipt Schema v1

Status: current (supersedes v0 for all new receipts as of the F-8
remediation).

## Migration note (v0 → v1)

Appends `mint` (32B) + `program_id` (32B) after `signer`: 185 → 249
bytes. Every v0 field offset is unchanged — v0 prefix decoders keep
working. v0-signed receipts cannot verify under v1 code (message
mismatch → `BadReceiptProof`); no migration path exists or is needed:
receipts are per-nonce and short-lived, so the fleet rolls over
within one challenge window. Nonces are NOT reset by the upgrade.

## HarborReceipt v1 (Borsh, exact field order)

| #   | Field              | Type     | Notes                                                                                                                        |
| --- | ------------------ | -------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 1   | `merchant`         | Pubkey   | Bond owner, authorized signer                                                                                                |
| 2   | `binding`          | Pubkey   | Bound Harbor binding PDA                                                                                                     |
| 3   | `cumulative_spend` | u64      | Total authorized spend in mint base units, monotonically increasing                                                          |
| 4   | `meter_hash`       | [u8; 32] | SHA-256 of the meter record (units delivered, e.g. token counts)                                                             |
| 5   | `output_hash`      | [u8; 32] | SHA-256 of the delivered output (or its commitment)                                                                          |
| 6   | `status`           | u8       | 0 = OK (see failure taxonomy for dispute reasons)                                                                            |
| 7   | `nonce`            | u64      | Strictly increasing per binding, starts at 1                                                                                 |
| 8   | `expiry_slot`      | u64      | Receipt invalid past this slot                                                                                               |
| 9   | `signer`           | Pubkey   | Must equal the bond merchant                                                                                                 |
| 10  | `mint`             | Pubkey   | NEW in v1: closes cross-mint replay (F-8)                                                                                    |
| 11  | `program_id`       | Pubkey   | NEW in v1: closes cross-program replay (F-8)                                                                                 |

Signing bytes: Borsh encoding of the struct above (249 bytes),
signed with Ed25519 by the merchant authorized signer.

## What v1 does and does not separate

Covered: cross-mint and cross-program replay (the signed bytes now
bind both). Still residual by design: cross-cluster replay (same
program ID can exist on multiple clusters; chain identity comes from
the RPC endpoint the verifier trusts, not the message) and the
model-level truths — receipts attest, never acquit; the bond covers
the rebate leg, never the escrow leg.
