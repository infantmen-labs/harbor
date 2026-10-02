# Harbor architecture

Bonded optimistic refunds for metered APIs: merchants lock collateral,
agents pay per request offchain, failed deliveries refund from the bond
after a timeout. Receipts never acquit — there is no delivered path.

```
                    ┌──────────────┐
                    │  upstream    │  solana-foundation/payment-channels
                    │  channels    │  (real program; Harbor is read-only)
                    │  program     │  channel PDA: payer escrow + vouchers
                    └──────┬───────┘
                           │ Harbor binds (checks payee/mint/payer/status)
                           ▼
┌────────┐  open/settle  ┌────────┐  receipts  ┌────────┐  /live  ┌─────┐
│ agent  │──────────────▶│ server │◀──────────▶│ keeper │◀──────▶│ web │
│ (payer │   metered     │(merchant│  resolve   │(operator│        │ UI  │
│ +claimant)  API        │ key)    │  matured   │ key)   │        └─────┘
└───┬────┘               └───┬────┘  disputes   └───┬────┘
    │  claim stake           │ bond vault            │ timeout refund
    ▼                        ▼                       ▼
┌─────────────────────────────────────────────────────────┐
│ Harbor program: bond │ binding │ receipt │ dispute │     │
│ claim (tombstone) │ treasury │ vault ATA                      │
└─────────────────────────────────────────────────────────┘
```

## Onchain (programs/harbor, backend-frozen)

| PDA | Seeds | Holds |
| --- | ----- | ----- |
| bond (`MerchantBond`) | `[bond, merchant, mint]` | amount, reserved, openDisputes |
| binding (`ChannelBinding`) | `[binding, channel]` | channel, merchant, bond, max_spend, last_nonce, halted |
| receipt (`ReceiptLog`) | `[receipt, binding, nonce]` | receipt_hash + cumulative spend (merchant-signed, liveness only) |
| dispute (`Dispute`) | `[dispute, binding, nonce]` | claimant, claimSpend, deadlineSlot |
| claim | `[claim, binding, nonce]` | empty tombstone: existence = nonce already claimed |
| treasury PDA | `[treasury, mint]` | signer only — funds sit in its ATA (5% fees + 2x penalties) |
| vault | ATA(bond, mint) | the actual collateral |

Money math per timeout resolve (claim C): claimant refund 95%, treasury
fee 5% + penalty 2C from the bond. Reserve locks 3C (claim + 2x penalty)
at open so the bond always covers it.

## Offchain services

| Service | Key | Does |
| ------- | --- | ---- |
| server | merchant | metered API, `bind_channel`, submits receipts onchain (best-effort), kill switch (bearer-gated) |
| agent | payer (= claimant) | opens/tops-up/settles channels, verifies receipts, logs JSONL evidence |
| keeper | operator | watches disputes, `resolve_timeout` past deadline only; dry-run default |
| web | wallet | mission control: bond/reserve/dispute state, kill + dispute buttons |
| sdk (`@infantmen-labs/harbor-sdk`) | — | PDAs, ix builders, receipt/voucher bytes, account decoders, `sendWithRetry` |
| examples/bond-watch | none | third-party-style read-only monitor (registry SDK only) |

## Trust rules (enforced onchain, see docs/authority.md)

1. Claimant must be the channel payer; only the channel's payee-merchant
   can bind it (kills squatting + induced binds, with the server
   allowlist as second gate).
2. Disputes open before settle-and-seal; resolution only past deadline.
3. Checked arithmetic everywhere — oversized claims error, never brick.
4. Kill switch gates delivery, never funds. Revive is public.

## Doc index

| Doc | What |
| --- | ---- |
| docs/setup.md | zero-to-loop onboarding (start here) |
| docs/proof-bundle.md | loop evidence ledger (history, not procedure) |
| docs/deploy.md | production runbook (Railway/Vercel + VPS/Caddy) |
| docs/authority.md | trust + authorization rules |
| docs/upstream-pin.md | upstream program pin + devnet deployment record |
| docs/review.md | hostile-audit rebuttals + escrow math |
| docs/ui-contracts.md | frozen frontend/backend contracts |
| docs/receipt-schema-v0.md | receipt wire format |
| docs/settle-coordination.md | settlement coordination notes |
| docs/disclosure.md | pre-existing code disclosure |
| docs/business.md | demand/LOI backlog (deprioritized pre-submission) |
| CONTRIBUTING.md | workflow rules (frozen zones, commit discipline) |
| SECURITY.md | threat model + key-rotation procedure pointer |
| CHANGELOG.md | release notes (SDK + program) |
