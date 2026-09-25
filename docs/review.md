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
- `bind_channel` pins the channel to an allowlisted program owner; full
  upstream seed re-derivation is deferred (documented in
  settle-coordination.md) — ownership is the load-bearing gate.
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

- All balance/counter updates use checked ops; slash is
  `min(bond, max_spend × sla / 10_000)` (u128 intermediate, cannot overflow
  u64 inputs); dispute stake is a fixed constant (no math).
- Deliberate non-enforcement: receipt `cumulative_spend` monotonicity is
  server-enforced (funds cannot move on receipts, only on slash math that
  ignores cumulative spend), and PARTIAL/INVALID reasons resolve only via
  timeout or delivery proof — re-execution oracles are post-MVP.

## Upstream composition

- Harbor never writes channel state and never needs to: bond vault and
  channel escrow are disjoint pools under different authorities, so slash
  and distribute commute (proven by escrow-intact assertions).
- Keeper refuses bindings pointed at non-allowlisted channel programs.

## Residual risks (accepted for MVP)

1. Full upstream seed re-derivation in `bind_channel` (mitigated by owner gate).
2. Re-execution oracle for partial-delivery claims (reason codes logged, unsettled).
3. No formal audit; Anchor safety lints enforced (`CHECK:` docs on every
   unchecked account).
4. `cargo audit` could not run here (toolchain download fails in this
   environment); mitigated by a minimal audited-framework dependency set
   (Anchor/SPL program crates) with `Cargo.lock` committed for review.
