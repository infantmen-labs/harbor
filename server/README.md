# harbor-server

Metered API behind Harbor surety. One merchant, one metered endpoint.

## Quickstart

```sh
# 1. Build first (all entrypoints below run from dist/):
yarn build

# 2. Start (port 3000 by default; set PORT to change it):
MERCHANT_KEYPAIR=~/.config/solana/id.json MINT=<mint> yarn start
```

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
- `POST /faucet {address}` — devnet tUSDC drip (top-up to the lifetime
  cap, never a flat re-drip). 50/drip, 100/address lifetime, 5/day per
  IP; 409 when already funded, 429 at the IP cap, 503 when disabled,
  empty, or low on SOL. Creates the recipient ATA (PDA owners included,
  idempotent) and pays fees + rent from the faucet wallet. Off unless
  `FAUCET_KEYPAIR` is set.
- `GET /receipt/:channel/:nonce` — stored receipt JSON.
- `GET /info` — merchant, price, kill state.
- `POST /admin/kill {killed}` — injects delivery failure (demo fail
  path). Killing requires `Authorization: Bearer $KILL_TOKEN` when set;
  reviving is always public.

## Env

`MERCHANT_KEYPAIR` (required, path), `MINT` (required),
`RPC_URL` (default devnet), `HARBOR_PROGRAM_ID` (default canonical),
`PRICE_PER_TOKEN` (default 10), `PORT` (default 3000),
`UPSTREAM_PROGRAM_ALLOWLIST` (default canonical; localnet fixture ID
for rehearsals), `KILL_TOKEN` (unset = open), `STORE_PATH` (snapshot
file for restart-safe sessions; unset = in-memory only),
`SKIP_CHAIN=1` (offline mode: no chain reads/writes), and the optional
faucet env: `FAUCET_KEYPAIR` (path to the drip wallet keypair; unset =
faucet off), `FAUCET_DRIP_AMOUNT` (50000000), `FAUCET_LIFETIME_CAP`
(100000000), `FAUCET_IP_DAY_CAP` (5).

## Scripts (`node dist/scripts/<name>.js` after `yarn build`)

- `setup.js` — register bond + post collateral. Env: same server env
  plus `SLA_BPS` (50), `CHALLENGE_SLOTS` (150), `BOND_AMOUNT` (500000).
  Also runnable as `yarn setup`.
- `mint.js` — create a dev mint (or reuse `MINT`) and fund merchant +
  agent ATAs. Env: `RPC_URL`, `PAYER_KEYPAIR` (default
  `~/.config/solana/id.json`), `MERCHANT_PUBKEY` (default payer),
  `AGENT_PUBKEY`, `MINT_DECIMALS` (6), `MINT_AMOUNT` (1000000000).
- `upload-buffer.js` — resumable program deploy (sliced reads survive
  rate-limited RPC). Env: `RPC_URL`, `PROGRAM_KEYPAIR`,
  `BUFFER_KEYPAIR`, `AUTHORITY_KEYPAIR`, `SO_PATH`,
  `FINALIZE=1` to finalize.
