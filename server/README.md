# harbor-server

Metered API behind Harbor surety. One merchant, one metered endpoint.

## Routes

- `POST /session {channel, channelProgram, deposit, authorizedSigner}` —
  registers the channel and submits onchain `bind_channel` (skipped with
  `SKIP_CHAIN=1`). Returns `{binding}`.
- `POST /complete {channel, nonce, input, voucherCumulative, voucherSignature}` —
  verifies the voucher (signature + monotonicity + cost coverage), serves a
  deterministic completion, and returns a merchant-signed Harbor receipt.
  Nonces must advance by exactly one. Returns 402 on bad/insufficient
  vouchers, 500 when killed.
- `GET /receipt/:channel/:nonce` — stored receipt JSON (schema v0).
- `GET /info` — merchant, price, kill state.
- `POST /admin/kill {killed}` — injects delivery failure (demo fail path).

## Run

```sh
MERCHANT_KEYPAIR=~/.config/solana/id.json MINT=<mint> yarn start
MERCHANT_KEYPAIR=... MINT=... yarn setup   # register bond + post collateral
SKIP_CHAIN=1 yarn test
```

MPP sessions are the production transport; this server speaks the same
voucher/receipt bytes over HTTP for the MVP.
