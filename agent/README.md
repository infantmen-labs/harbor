# harbor-agent

CLI agent: opens a payment channel (payee = the merchant it buys
from), streams metered requests with cumulative vouchers, verifies
merchant receipts, logs JSONL evidence, settles on close.

## Quickstart

```sh
# 1. Build first (the CLI runs from dist/):
yarn build

# 2. Run against a live server (see ../server/README.md):
RPC_URL=https://api.devnet.solana.com \
SERVER_URL=http://127.0.0.1:3000 \
AGENT_KEYPAIR=./agent.json \
MERCHANT_PUBKEY=<merchant> \
MINT=<mint> \
DEPOSIT=100000 REQUESTS=5 BUDGET_PER_REQUEST=5000 \
yarn start
```

## Env

`RPC_URL`, `SERVER_URL`, `AGENT_KEYPAIR` (required, path),
`MERCHANT_PUBKEY` (required), `CHANNEL_PROGRAM_ID` (default
canonical), `MINT` (required), `DEPOSIT` (100000), `REQUESTS` (5),
`BUDGET_PER_REQUEST` (5000), `REQUEST_DELAY_MS` (0),
`SALT` (default random — set fixed for reproducible channels),
`LOG_PATH` (default `agent-run.jsonl`).

Flow per request: authorize `lastSpent + budget` → verify receipt
against `MERCHANT_PUBKEY` → append JSONL. When the next authorization
would exceed the ceiling, tops up by half the deposit first. Closes
with a final upstream `settle` (skipped when nothing succeeded, so
failed runs leave escrow untouched for disputes).
