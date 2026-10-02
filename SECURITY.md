# Security

Harbor on devnet is experimental software handling real (devnet) funds.
Threat model and honesty notes live in `docs/review.md` (disclosed
optimistic refunds — receipts never acquit) and `docs/authority.md`.

- The program is backend-frozen; security fixes are the only exception.
  Report vulnerabilities by opening a GitHub issue with the `security`
  label — there is no bounty program.
- Kill switch (`POST /admin/kill`) is bearer-gated in production and
  demo control only, never a funds control: bond funds are onchain.
- If a secret reaches a log or the tree, rotate it immediately
  (procedure: `docs/deploy.md` §1b).
- Upstream dependency: `solana-foundation/payment-channels`, pinned —
  see `docs/upstream-pin.md`. Harbor checks its layout at bind time and
  fails loud on drift, never silent.
