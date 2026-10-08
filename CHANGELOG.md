# Changelog

SDK versions are on npm (`@infantmen-labs/harbor-sdk`); program and
workspaces version together. Full history: `git log`.

## Unreleased

- Devnet reclaim proven live on the canonical program (withdrawPayer
  +45000 exact, distribute +5000 with the empirically mapped devnet
  `TREASURY_OWNER` `4zTeC5…DUspap`, full channel deallocation past the
  open-slot window); `reclaim-proof.mjs` takes `TREASURY_OWNER` (env);
  mapping method + probe costs recorded in `docs/upstream-pin.md` and
  `docs/proof-bundle.md`.
- Security: `refund_unused` enforces the canonical-vault gate like every
  other fund path (F-7); `test_fake_vault_rejected_on_refund` covers it.
- Receipt schema v1: `mint` + `program_id` appended (185 → 249 bytes,
  all v0 offsets unchanged); see `docs/receipt-schema-v1.md` migration
  note. Server/agent/SDK/tests moved together.
- `test_adversarial_settle_then_dispute`: merchant settles an
  unrendered-service voucher then distributes (escrow captured), while
  the bond dispute still resolves per math — F-1 codified as tested
  behavior, not shadow.

## 0.6.0 (SDK + server + agent + keeper; program/web/log unchanged)

- Upstream close lifecycle in SDK (`requestCloseIx` / `sealIx` /
  `withdrawPayerIx` / `distributeIx` / `reclaimIx`, empty-plan
  distribute verified live) + `refundUnusedIx` + `vaultAta` (keeper
  deduped onto it) + receipt-expiry readers. Live on npm;
  `examples/bond-watch` re-pinned with registry lockfile.
- Server `RECEIPT_EXPIRY_SLOTS`; agent `GRACE_PERIOD_SECS`.
- Loop: `--with-reclaim` (full reclaim lifecycle proven:
  withdraw +45000 exact, merchant +5000, Distributed) and
  `--with-merchant-paths` (short-expiry + Expired gate, halt,
  treasury withdraw, fresh register/post/withdraw/refund_unused);
  mid-dispute gate check on every run.

## 0.5.0 (SDK + agent; program/server/keeper/web unchanged)

- SDK buyer surface (from demand-sentinel validation): upstream channel
  builders (`openChannelIx` / `topUpIx` / `settleIx`, `deriveChannel`)
  moved from the reference agent (byte-identical, browser-safe
  encoders); `decodeBinding` + `ataFor`; `suggestClaimSpend` (safe claim
  = min(maxSpend, funded, floor(bondFree / 3))); `assertVoucherCoversQuote`
  with `VoucherUnderquoted` / `StaleVoucher` errors. Live on npm;
  `examples/bond-watch` re-pinned with registry lockfile.
- `scripts/local-loop.sh` runs with zero fixture env (committed local
  upstream pair in `scripts/fixtures/`); verify step reads the bond via
  the SDK instead of `web/dist-test`.

## 0.4.4

- SDK: `sendWithRetry` (fresh-blockhash resend on proven tx expiry only)
  and portable `u64le`/`writeU64LE`/`writeI64LE` (browser `Buffer`
  polyfills lack the BigInt methods — broke `disputePda` in web builds).
- Keeper startup log redacts the RPC query string.
- Published to npm; `examples/bond-watch` re-pinned with registry lockfile.
