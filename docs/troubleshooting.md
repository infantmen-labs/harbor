# Troubleshooting

Symptom → cause → fix. Every entry below was observed live; error
strings are quoted verbatim. If your error isn't here, the failure is
new — record it with the exact message before changing anything.

## `EADDRINUSE` on :8900 / :3001 / :3000

Something else owns the port. `scripts/local-loop.sh` aborts rather
than kill strangers — free the port or override `RPC_URL` / `SERVER_URL`.
The loop never launches into a port it didn't start.

## `block height exceeded` / stale blockhash

The RPC served a blockhash that expired before landing (common under
Helius 429 throttling). App paths rebuild with a fresh blockhash via
SDK `sendWithRetry` — re-run validator-adjacent scripts; timeouts and
unknown states propagate untouched by design, so re-running is safe.

## `anchor build` fails

Check `anchor --version` (1.0.0) and that the `anchor` shim from avm —
not an old global install — is first on `PATH`. Run
`./scripts/bootstrap.sh` to converge the toolchain.

## Talking to someone else's validator

A high slot after `--reset`, or state you didn't create: your `--url` /
`RPC_URL` points at a stranger's chain. The loop's freshness tripwire
(slot > 2000 after reset) aborts for exactly this reason.

## Keeper `RUN_ONCE=1` resolves nothing

A single pass is not guaranteed to catch a dispute (RPC race, or the
pass ran pre-maturity). Poll loops are the deployment mode; rerun after
the deadline slot. See "Run the keeper" for the liveness contract.

## `wait-maturity` spins the full 300s and throws

Either the dispute never matured in-window (check slot vs
`deadlineSlot` directly), or you passed the wrong `NONCE` (default is
1 — a nonce-2 dispute needs `NONCE=2`).

## Persistent `0x899` (`SealGracePeriodNotElapsed`)

The seal crank is working; the grace window hasn't elapsed. Grace is
measured in seconds from `requestClose`, not slots: a grace-60 channel
seals in ~60s, a grace-7200 channel in ~2h. Wait or rerun later — funds
and watermark sit intact meanwhile.

## `0x961` (`TreasuryAccountMismatch`) on distribute

Wrong treasury owner for that upstream build. Localnet fixtures use the
0xBEEF sentinel; the canonical devnet program embeds `4zTeC5…DUspap`
(see `docs/upstream-pin.md`). Set `TREASURY_OWNER` accordingly.

## Expired submits fail with `Expired`

`submit_receipt` requires `slot <= expiry_slot`, checked first. Either
the receipt genuinely outlived its lifetime, or the merchant runs the
default near-infinite expiry and you hand-set a past slot. Both are
correct rejections — read `expirySlot` off the receipt and compare.

## Keeper test / dist path module errors

`keeper/dist` must be built from the repo root (`yarn build`), and the
keeper must run with cwd = repo root or an absolute dist path — its
`dist/scripts/dispute.js` resolves relative to the checkout.
