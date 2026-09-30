# harbor-keeper

Watches open Harbor disputes and resolves matured ones as timeout
refunds. There is no delivered path: receipts are merchant-signed
liveness attestations and never acquit a claim (see
`docs/ui-contracts.md` Amendments v0.2.0). Dry-run by default;
`MODE=live` sends transactions from the operator key.

## Run

```sh
OPERATOR_KEYPAIR=~/.config/solana/id.json \
RPC_URL=https://api.devnet.solana.com \
HARBOR_PROGRAM_ID=BuRyKLqCsTLcyLVFEjxTjmF4DryCT3LmVDjwqhduvB4H \
UPSTREAM_PROGRAM_ALLOWLIST=CHNLxYvVA28MJP9PrFuDXccuoGXAx7jBacfLEkahyGsX \
POLL_MS=30000 MODE=dry-run LOG_PATH=keeper.log.jsonl \
RUN_ONCE=1 \
yarn start
```

Every pass scans program disputes, classifies each
(`resolve-timeout` / `pending`), and either logs
the intent or executes it. There is no delivered path: receipts are
merchant-signed liveness attestations and never acquit a claim (see
`docs/ui-contracts.md` Amendments v0.2.0). Upstream channel
`settle`/`distribute` stays operator-side; the keeper never finalizes
anything with an open dispute because resolution IS the finalization.
