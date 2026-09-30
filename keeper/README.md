# harbor-keeper

Watches open Harbor disputes and resolves matured ones as timeout
refunds. There is no delivered path: receipts are merchant-signed
liveness attestations and never acquit a claim (see
`docs/ui-contracts.md` Amendments v0.2.0). Dry-run by default;
`MODE=live` sends transactions from the operator key.

## Quickstart

```sh
# 1. Build first (watcher + scripts run from dist/):
yarn build

# 2. Watch (dry-run logs intent, live sends):
OPERATOR_KEYPAIR=~/.config/solana/id.json \
RPC_URL=https://api.devnet.solana.com \
HARBOR_PROGRAM_ID=BuRyKLqCsTLcyLVFEjxTjmF4DryCT3LmVDjwqhduvB4H \
UPSTREAM_PROGRAM_ALLOWLIST=CHNLxYvVA28MJP9PrFuDXccuoGXAx7jBacfLEkahyGsX \
POLL_MS=30000 MODE=dry-run LOG_PATH=keeper.log.jsonl \
RUN_ONCE=1 \
yarn start
```

## Env

`OPERATOR_KEYPAIR` (required, path), `RPC_URL`, `HARBOR_PROGRAM_ID`,
`UPSTREAM_PROGRAM_ALLOWLIST` (bindings outside it are skipped, never
touched), `POLL_MS` (30000), `MODE` (`dry-run`|`live`), `LOG_PATH`,
`RUN_ONCE=1` (single pass, for demos and cron).

## Scripts

- `node dist/scripts/dispute.js` — open a dispute as a claimant (demo
  fail path). Env: `RPC_URL`, `HARBOR_PROGRAM_ID`,
  `CLAIMANT_KEYPAIR` (required, path — must be the channel payer),
  `BOND`, `BINDING`, `CHANNEL`, `MINT` (all required), `NONCE` (1),
  `REASON` (1), `CLAIM_SPEND` (1000, must be ≤ binding max_spend and
  funded in the claimant's ATA).

Every pass scans program disputes, classifies each
(`resolve-timeout` / `pending`), and either logs
the intent or executes it. There is no delivered path: receipts are
merchant-signed liveness attestations and never acquit a claim (see
`docs/ui-contracts.md` Amendments v0.2.0). Upstream channel
`settle`/`distribute` stays operator-side; the keeper never finalizes
anything with an open dispute because resolution IS the finalization.
