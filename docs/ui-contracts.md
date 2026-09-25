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
`DisputeResolved { binding, nonce, winner, slashed }`,
`BondClosed { merchant, mint }`,
`BindingHalted { binding }`.

## Receipt JSON (`GET /receipt/:channel/:nonce`)

`{ merchant, binding, cumulativeSpend, meterHash, outputHash, status,
nonce, expirySlot, signer, signature }` — all pubkeys base58, all ints
decimal strings, hashes hex, signature base64. Byte layout matches
`docs/receipt-schema-v0.md` (185 bytes).

## Dispute log entry (keeper JSONL)

`{ dispute, binding, nonce, action, slot, mode, signature? }` where action
is `resolve-timeout | resolve-delivered | pending |
skipped-untrusted-channel-program`.

## Bond status (derived, not stored)

`{ merchant, mint, amount, slaBps, challengeSlots, openDisputes,
lastChangeSlot }` read from the bond account; health = amount vs open
exposure across bindings.
