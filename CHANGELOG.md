# Changelog

SDK versions are on npm (`@infantmen-labs/harbor-sdk`); program and
workspaces version together. Full history: `git log`.

## Unreleased

- Upstream close lifecycle in SDK (`requestCloseIx` / `sealIx` /
  `withdrawPayerIx` / `distributeIx` / `reclaimIx`, empty-plan
  distribute verified live) + `refundUnusedIx` + `vaultAta` (keeper
  deduped onto it) + receipt-expiry readers.
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
