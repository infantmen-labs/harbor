# Changelog

SDK versions are on npm (`@infantmen-labs/harbor-sdk`); program and
workspaces version together. Full history: `git log`.

## Unreleased

- `scripts/local-loop.sh` runs with zero fixture env (committed local
  upstream pair in `scripts/fixtures/`); verify step reads the bond via
  the SDK instead of `web/dist-test`.

## 0.4.4

- SDK: `sendWithRetry` (fresh-blockhash resend on proven tx expiry only)
  and portable `u64le`/`writeU64LE`/`writeI64LE` (browser `Buffer`
  polyfills lack the BigInt methods — broke `disputePda` in web builds).
- Keeper startup log redacts the RPC query string.
- Published to npm; `examples/bond-watch` re-pinned with registry lockfile.
