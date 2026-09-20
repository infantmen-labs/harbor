# harbor-agent

CLI agent: opens a payment channel, streams metered requests with cumulative
vouchers, verifies merchant receipts, logs JSONL evidence, settles on close.

## Run

```sh
RPC_URL=https://api.devnet.solana.com \
SERVER_URL=http://127.0.0.1:3000 \
AGENT_KEYPAIR=./agent.json \
MERCHANT_PUBKEY=<merchant> \
MINT=<mint> \
DEPOSIT=100000 REQUESTS=5 BUDGET_PER_REQUEST=5000 \
LOG_PATH=agent-run.jsonl \
yarn start
```

Flow per request: authorize `lastSpent + budget` → verify receipt against
`MERCHANT_PUBKEY` → append JSONL. Tops up the channel under 25% deposit.
Closes with a final upstream `settle`. Operator `distribute` is out of
scope (keeper phase).
