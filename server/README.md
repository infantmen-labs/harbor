# harbor-server

Metered API behind Harbor surety. One merchant, one metered endpoint.

## Routes

- `POST /session {channel, channelProgram, deposit, authorizedSigner}` —
  rejects non-allowlisted `channelProgram` (400), registers the channel
  and submits onchain `bind_channel` (skipped with `SKIP_CHAIN=1`).
  Returns `{binding}`.
- `POST /complete {channel, nonce, input, voucherCumulative, voucherSignature}` —
  verifies the voucher (signature + strict nonce +1 + cost coverage)
  against the **onchain** channel deposit (over-authorization returns
  402; top-ups are re-read from chain, never trusted from the client),
  serves a deterministic completion, submits the receipt onchain
  (best-effort; delivery never 500s on submit failure), and returns a
  merchant-signed Harbor receipt. Nonces must advance by exactly one.
  Returns 402 on bad/insufficient vouchers, 500 when killed.
- `GET /receipt/:channel/:nonce` — stored receipt JSON (schema v0).
- `GET /info` — merchant, price, kill state.
- `POST /admin/kill {killed}` — injects delivery failure (demo fail
  path). Killing requires `Authorization: Bearer $KILL_TOKEN` when set;
  reviving is always public.

## Env

`MERCHANT_KEYPAIR`, `MINT`, `RPC_URL`, `HARBOR_PROGRAM_ID`,
`PRICE_PER_TOKEN` (default 10), `PORT` (default 3000),
`UPSTREAM_PROGRAM_ALLOWLIST` (default canonical; localnet fixture ID
for rehearsals), `KILL_TOKEN` (unset = open), `STORE_PATH` (snapshot
file for restart-safe sessions; unset = in-memory only),
`SKIP_CHAIN=1` (offline mode: no chain reads/writes).

## Run

```sh
MERCHANT_KEYPAIR=~/.config/solana/id.json MINT=<mint> yarn start
MERCHANT_KEYPAIR=... MINT=... yarn setup   # register bond + post collateral
SKIP_CHAIN=1 yarn test
```
