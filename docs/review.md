# Security Review — Harbor program (manual, structured)

Scope: `programs/harbor` at the committed revision. Method: instruction-by-
instruction account validation review against the event log of every CPI.

## Signer discipline

- Every state-mutating instruction requires its economic actor as signer:
  merchant for register/post/top-up/withdraw/bind/halt/refund/submit;
  claimant for open_dispute; any resolver for resolves (permissionless by
  design — resolution only moves funds along adjudicated paths).
- `open_dispute` rejects claimant == merchant (agent-only rule).
- No delegate, multisig, or PDA-signed user paths exist.

## PDA discipline

- All PDAs use fixed seeds + canonical bump; no `init_if_needed`.
- `bind_channel` verifies the upstream channel struct at the pinned
  offsets (owner, discriminator, version, status, payee, mint — see
  v0.2.1 close-out under Residual risks); only the channel's payee on
  the bond's mint can bind it.
- `resolve_*` recomputes the receipt PDA from binding + nonce and rejects
  mismatches; disputes are namespaced per binding + nonce so one binding's
  dispute can never resolve another's.
- `refund_unused` closes bond (to merchant) only after the vault is proven
  empty; bindings are intentionally left allocated (tiny rent; closing them
  would complicate dispute references).

## Token discipline

- Vault collateral is classic Tokenkeg only (`UnsupportedMint` gate).
  Token-2022 support was cut after proving the vault-creation path cannot
  serve it: Anchor resolves `init` CPIs before later-field constraints, so
  a declarative mint gate never fires first — and the classic ATA program
  cannot create Token-2022 vaults anyway.
- Vault creation is manual in the handler (canonical-PDA check, then
  idempotent create) precisely so the mint gate provably runs before any
  vault CPI. Lesson: never rely on field-constraint ordering against
  `init`.
- All transfers use `transfer_checked` with mint decimals; TokenInterface
  types are retained for account compatibility.
- Vault/merchant ATAs are constrained by owner + mint on every path.

## Arithmetic

- All balance/counter updates use checked ops. v0.2 dispute math per
  claim S: fee = S × 500 / 10_000 (u128 intermediate), refund = S − fee,
  penalty = 2S, outflow = 3S reserved at open; `resolve_timeout` moves
  refund to the claimant and fee+penalty to the treasury, dropping
  `bond.amount` by the penalty only (the fee comes from the claimant's
  locked principal). Invariant: vault == bond.amount + Σ open claims.
- Withdrawals may only touch `amount − reserved` (every open claim's
  full outflow is locked); the 150-slot timelock still applies.
- Deliberate non-enforcement: receipt `cumulative_spend` monotonicity is
  server-enforced (funds cannot move on receipts), and PARTIAL/INVALID
  reasons resolve via the same timeout path — re-execution oracles are
  post-MVP.

## Upstream composition

- Harbor never writes channel state and never needs to: bond vault and
  channel escrow are disjoint pools under different authorities, so slash
  and distribute commute (proven by escrow-intact assertions).
- Keeper refuses bindings pointed at non-allowlisted channel programs.

## Residual risks (accepted for MVP)

1. ~~Full upstream seed re-derivation in `bind_channel`~~ — CLOSED in
   v0.2.1: `bind_channel` reads the upstream 256-byte Channel struct
   (payee@120, mint@184, verified against pinned commit `3ffa4d67`)
   and requires payee == binder on the bond's mint. PDA re-derivation
   proved unnecessary (stored payee is upstream-written).
2. Re-execution oracle for partial-delivery claims (reason codes logged, unsettled).
3. No formal audit; Anchor safety lints enforced (`CHECK:` docs on every
   unchecked account).
4. `cargo audit` could not run here (toolchain download fails in this
   environment); mitigated by a minimal audited-framework dependency set
   (Anchor/SPL program crates) with `Cargo.lock` committed for review.

## Adjudication economics (v0.2) — no acquittal, by design

`resolve_delivered` was removed in v0.2: merchant-signed receipts are
liveness attestations, never evidence against the merchant, so no
receipt-based defense can exist. Any claim locks S and pays out after
the challenge window. Two properties follow, both load-bearing:

**Claim fabrication is never profitable.** The claimant's outlay is
S (locked) and the income cap is exactly S (refund = S − fee), so
fabrication nets −5% − tx fees at every scale. A frequently-claimed
"profitable dishonest buyer" theorem forgets the escrow leg: a buyer
who *received* service has already paid the channel escrow for it
(the server holds buyer-signed vouchers for every served unit, and the
upstream `settle` instruction is permissionless — no buyer signature
needed), so that payment is unrecoverable. Full accounting for a
dishonest buyer who receives service worth V and claims S: outlay
S_escrow + S_lock, income 0.95·S_lock, net −S_escrow − 0.05·S_lock —
always ≥ 105% of the service value. There is no profitable strategy.

**Spite-burn is the accepted residual.** Anyone willing to destroy
≥5% + fees of their own capital can burn 2× the claim from a merchant's
bond. This is bounded (no theft path — all outflows are capped by
locked principal), unprofitable for the attacker, and proportionally
small against honest volume. The clean fix (an agent-signed delivery
ack oracle gating receipts) is post-contest work, deliberately not
rushed before the deadline; the mechanism is shipped as *disclosed
optimistic refunds*, not delivery assurance.
