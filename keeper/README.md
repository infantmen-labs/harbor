# harbor-keeper

Watches open Harbor disputes and resolves the adjudicated ones:
delivery proof always wins, past-deadline absence slashes. Dry-run by
default; `MODE=live` sends transactions from the operator key.

## Run

```sh
OPERATOR_KEYPAIR=~/.config/solana/id.json \
RPC_URL=https://api.devnet.solana.com \
HARBOR_PROGRAM_ID=BuRyKLqCsTLcyLVFEjxTjmF4DryCT3LmVDjwqhduvB4H \
POLL_MS=30000 MODE=dry-run LOG_PATH=keeper.log.jsonl \
RUN_ONCE=1 \
yarn start
```

Every pass scans program disputes, classifies each
(`resolve-timeout` / `resolve-delivered` / `pending`), and either logs
the intent or executes it. Upstream channel `settle`/`distribute` stays
operator-side; the keeper never finalizes anything with an open dispute
because resolution IS the finalization.
