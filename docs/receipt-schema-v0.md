# Harbor Receipt Schema v0 (FROZEN)

Status: frozen. Any change requires a version bump to v1 plus a migration note.
Scope: one merchant, one agent, one metered API.

## HarborReceipt (Borsh, exact field order)

| #   | Field              | Type     | Notes                                                                                                                        |
| --- | ------------------ | -------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 1   | `merchant`         | Pubkey   | Bond owner, authorized signer                                                                                                |
| 2   | `binding`          | Pubkey   | Bound Harbor binding PDA (errata: earlier revisions of this doc mislabeled it `channel`; the code has always used `binding`) |
| 3   | `cumulative_spend` | u64      | Total authorized spend in mint base units, monotonically increasing                                                          |
| 4   | `meter_hash`       | [u8; 32] | SHA-256 of the meter record (units delivered, e.g. token counts)                                                             |
| 5   | `output_hash`      | [u8; 32] | SHA-256 of the delivered output (or its commitment)                                                                          |
| 6   | `status`           | u8       | 0 = OK (see failure taxonomy for dispute reasons)                                                                            |
| 7   | `nonce`            | u64      | Strictly increasing per binding, starts at 1                                                                                 |
| 8   | `expiry_slot`      | u64      | Receipt invalid past this slot                                                                                               |

Signing bytes: Borsh encoding of the struct above, signed with Ed25519 by the
merchant authorized signer. Verification mirrors the upstream precompile +
Instructions-sysvar pattern: the signature instruction immediately precedes
the submission instruction.

## Replay / expiry rules

- Accept only if `nonce > binding.last_nonce`.
- Accept only if `current_slot <= expiry_slot`.
- Accept only if signer equals the binding's merchant signer.
- Each violation maps to a distinct error (see below), never a generic reject.

## Failure taxonomy (dispute reasons)

| Code | Name           | Meaning                                      |
| ---- | -------------- | -------------------------------------------- |
| 0    | OK             | Full delivery, receipt valid                 |
| 1    | TIMEOUT        | No receipt within the service window         |
| 2    | PARTIAL_METER  | `cumulative_spend` exceeds delivered meter   |
| 3    | INVALID_OUTPUT | `output_hash` does not match delivered bytes |
| 4    | REPLAY         | Nonce already recorded                       |
| 5    | EXPIRED        | Past `expiry_slot`                           |

## Economic parameters (MVP defaults)

| Param                    | Value          | Notes                                                                                                                                               |
| ------------------------ | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sla_bps`                | 50             | Reserved; currently unread by any instruction (no SLA-scaled math ships in v0.2–v0.4; penalty is a fixed 2x multiple — see ui-contracts Amendments) |
| `challenge_slots`        | 150            | Dispute window after opening                                                                                                                        |
| `dispute_stake`          | 0.01 SOL equiv | Opener stake, returned on resolve (close = claimant on the only resolve path); the 5% claim fee — not the stake — is the false-claim cost           |
| `bond_withdraw_timelock` | 1 epoch        | Withdraw only with zero open disputes                                                                                                               |
| `dispute_opener`         | agent-only     | Permissionless disputes deferred post-MVP                                                                                                           |
| `max_leverage`           | n/a            | No leverage in MVP; ceiling deposits only                                                                                                           |

## Events (contract for future consumers)

`MerchantRegistered`, `BondPosted`, `ChannelBound`, `ReceiptSubmitted`,
`DisputeOpened`, `BondSlashed`, `ClaimRefunded`. Consumers tail these;
no other receipt source is canonical. (Errata: earlier revisions listed
`DisputeResolved`, removed with the delivered path in v0.2.0.)
