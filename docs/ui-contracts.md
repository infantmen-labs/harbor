# UI Contracts (frozen for backend-freeze-v0)

Backend will not change these shapes without a version bump. UI builds
against them; no UI code lives in this phase.

## Events (tail onchain or via indexer)

`MerchantRegistered { merchant, mint, sla_bps, challenge_slots }`,
`BondPosted { merchant, mint, amount, total }`,
`ChannelBound { channel, merchant, bond, max_spend }`,
`ReceiptSubmitted { binding, nonce, cumulative_spend }`,
`DisputeOpened { binding, nonce, reason, claimant, deadline_slot }`,
`BondSlashed { binding, nonce, claimant, slash }`,
`ClaimRefunded { binding, nonce, claimant, refund, fee }`,
`BondClosed { merchant, mint }`,
`BindingHalted { binding }`.

## Receipt JSON (`GET /receipt/:channel/:nonce`)

`{ merchant, binding, cumulativeSpend, meterHash, outputHash, status,
nonce, expirySlot, signer, signature }` — all pubkeys base58, all ints
decimal strings, hashes hex, signature base64. Byte layout matches
`docs/receipt-schema-v0.md` (185 bytes).

## Dispute log entry (keeper JSONL)

`{ dispute, binding, nonce, action, slot, mode, signature? }` where action
is `resolve-timeout | pending |
skipped-untrusted-channel-program`.

## Bond status (derived, not stored)

`{ merchant, mint, amount, slaBps, challengeSlots, openDisputes,
lastChangeSlot }` read from the bond account; health = amount vs open
exposure across bindings.

## Amendments (v0.2.0) — claim-staked optimistic refunds

Adjudication was redesigned (prior model let the merchant acquit itself
with self-signed receipts). Frozen sections above are untouched; the
following changed:

- `open_dispute` takes `claim_spend: u64` and new accounts
  (`mint`, `claimant_ata`, `vault`, `token_program`). The claimant locks
  the claim from its own ATA into the vault; `S <= binding.max_spend`;
  outflow `3*S` is reserved on the bond. Halt no longer gates disputes.
- `resolve_delivered` is REMOVED (no acquittal path exists anymore).
- `resolve_timeout` drops the `receipt` account and adds `treasury`
  (PDA, key-checked) + `treasury_ata` (lazily created, rent by
  resolver) + `associated_token_program` + `system_program`. Math for
  claim S: fee = S*500/10_000, refund = S-fee (claimant), penalty = 2*S
  (treasury). `BondSlashed.slash` now means the penalty; new
  `ClaimRefunded { binding, nonce, claimant, refund, fee }` event.
- Account layouts: `MerchantBond` gains `reserved: u64` (after
  `last_change_slot`); `Dispute` gains `claim_spend: u64` (after
  `stake_lamports`). Old bond/dispute accounts are NOT forward
  compatible — migrate by withdraw + refund_unused + re-register.
- Receipt JSON, keeper log entry, and event names in §Events keep their
  shapes; `resolve-delivered` never appears in keeper logs anymore.
- Bond status gains `reserved`; dispute status gains `claimSpend`.
  Health = (amount - reserved) withdrawable; reserved covers every open
  claim's full outflow.

## Amendments (v0.3.0) — payer-bound claims, governed treasury

- `open_dispute` takes a new `channel` account (after `binding`): it
  must equal `binding.channel`, be owned by `binding.channel_program`,
  carry the pinned upstream struct version, and record the claimant as
  its payer (offset 88). Only the channel's buyer may claim; drive-by
  claims by strangers are rejected. Demo callers use the agent key as
  claimant (the buyer disputes its own purchases).
- New `withdraw_treasury(amount)` instruction: moves fee + penalty funds
  out of the per-mint treasury ATA. Gated by the program upgrade
  authority read from the programdata account (same key that could
  already drain vaults via upgrade — no new trust). Until a multisig
  holds that key (see `docs/authority.md`), a governance escape hatch.
