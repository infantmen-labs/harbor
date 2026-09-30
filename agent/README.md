# harbor-agent

CLI agent: opens a payment channel (payee = the merchant it buys
from), streams metered requests with cumulative vouchers, verifies
merchant receipts, logs JSONL evidence, settles on close.

## Run

```sh
RPC_URL=https://api.devnet.solana.com \
SERVER_URL=http://127.0.0.1:3000 \
AGENT_KEYPAIR=./agent.json \
MERCHANT_PUBKEY=<merchant> \
CHANNEL_PROGRAM_ID=<channels-program> \
MINT=<mint> \
DEPOSIT=100000 REQUESTS=5 BUDGET_PER_REQUEST=5000 REQUEST_DELAY_MS=0 \
SALT=<fixed-or-random> LOG_PATH=agent-run.jsonl \
yarn start
```

Flow per request: authorize `lastSpent + budget` → verify receipt
against `MERCHANT_PUBKEY` → append JSONL. When the next authorization
would exceed the ceiling, tops up by half the deposit first. Closes
with a final upstream `settle` (skipped when nothing succeeded, so
failed runs leave escrow untouched for disputes).
