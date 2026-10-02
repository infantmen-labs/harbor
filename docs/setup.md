# Harbor local setup — from zero to a passing loop

Fast path first (scripted, §4). Manual path after it (§5) for debugging.

## 1. Prerequisites

| Tool               | Version (tested)          | Install                                                               |
| ------------------ | ------------------------- | --------------------------------------------------------------------- |
| Node.js | ≥22 (`.nvmrc` pins 22, the floor; 26.7 verified locally) | https://nodejs.org — a wallet dep enforces `engines: node >= 22`. No install script here (nvm/nodesource vary); `scripts/bootstrap.sh` checks the rest |
| yarn               | 1.22.x                    | `npm i -g yarn`                                                       |
| Rust (stable)      | 1.89                      | https://rustup.rs                                                     |
| solana-cli (Agave) | 3.1.14                    | https://solana.com/docs/intro/installation                            |
| anchor-cli         | 1.0.0                     | `avm install 1.0.0` via https://www.anchor-lang.com/docs/installation |
| git, curl          | any                       | system package manager                                                |

CI runs the same matrix (`.github/workflows/ci.yml`). Fresh machine?
`./scripts/bootstrap.sh` installs rustup + Solana CLI 3.1.14 + anchor
1.0.0 (idempotent; checks node/yarn, full container in
`Dockerfile.dev`).

## 2. Keys (3 keypairs)

```sh
solana-keygen new -o ~/.config/solana/id.json --no-bip39-passphrase          # merchant + program upgrade authority
solana-keygen new -o ~/.config/solana/loop-agent.json --no-bip39-passphrase  # channel payer, also the dispute claimant
solana-keygen new -o ~/.config/solana/harbor-operator.json --no-bip39-passphrase  # keeper operator (devnet loops)
```

Fund them: localnet via `solana airdrop 2 <addr> --url localhost`
(needs a validator running, §4/§5); devnet via https://faucet.solana.com
(rate-limited — drip before you need it).

## 3. Install + build (order matters)

```sh
git clone <repo> && cd harbor   # no submodules
anchor build         # target/deploy/harbor.so — program suites + localnet need it
yarn install --frozen-lockfile
yarn lint            # prettier check (defaults, no config file; ignores: .prettierignore)
yarn build           # dist/ entrypoints for sdk, server, agent, keeper
yarn test            # TS suites: sdk, server, agent, keeper
cargo test -p harbor # program suites via LiteSVM (hermetic, no validator)
```

Do NOT use `anchor test` here: even with `--skip-local-validator` the
harness dials a validator on :8899 and fails (verified). `cargo test`
above is the complete suite.

Web (optional for backend loops): `cp web/.env.example web/.env.local`
then `yarn dev` (web on :3101 — the server owns :3000). Backend env
templates: `server/.env.example`, `agent/.env.example`,
`keeper/.env.example` — copy to `.env` in the package dir (auto-loaded;
exported vars always win); never commit real secrets.

## 4. Fast path: one-command localnet loop

```sh
./scripts/setup-check.sh   # pre-flight: versions, keys, ports, artifacts
yarn loop                  # ./scripts/local-loop.sh (--fast halves the dispute window)
```

No fixture env needed: the loop defaults to the committed local
upstream pair (`scripts/fixtures/` — source-built from the pinned
commit, localnet-only). Override with `UPSTREAM_SO` / `UPSTREAM_KEYPAIR`
for your own build (procedure: `docs/proof-bundle.md` → "Upstream
fixture build"; rebuild only when the pin changes).

Spins an isolated stack (fresh validator + RPC `:8900`, server `:3001`
in `./.loop-run`), runs happy → kill → fail → dispute → keeper resolve,
and verifies settlement math to the unit. Leaves the stack running;
re-running resets it. Never launches into a stranger's port (aborts if
`:8900`/`:3001` are taken).

Success looks like: `LOOP PASS` + `bond: … disputes:0 reserved:0`.

## 5. Manual path (same steps the script runs)

```sh
# Validator + programs (fresh ledger each time; committed fixture pair
# needs no env — override UPSTREAM_SO/UPSTREAM_KEYPAIR for your own build)
solana-test-validator --reset --quiet --ledger ./.loop-run/ledger --rpc-port 8900 &
solana program deploy target/deploy/harbor.so --program-id scripts/fixtures/harbor-keypair.json --url http://127.0.0.1:8900
solana program deploy scripts/fixtures/payment_channels.local.so --program-id scripts/fixtures/local-chnl.json --url http://127.0.0.1:8900
solana airdrop 2 --url http://127.0.0.1:8900 --keypair ~/.config/solana/id.json

# Mint + bond (merchant funds agent + claimant inside mint.js)
MINT_OUT=$(RPC_URL=http://127.0.0.1:8900 PAYER_KEYPAIR=~/.config/solana/id.json node server/dist/scripts/mint.js)
MINT=$(echo "$MINT_OUT" | grep '^MINT=' | cut -d= -f2)
RPC_URL=http://127.0.0.1:8900 MERCHANT_KEYPAIR=~/.config/solana/id.json MINT="$MINT" BOND_AMOUNT=500000 node server/dist/scripts/setup.js

# Server (foreground here; background dies in some sandboxes)
PORT=3001 RPC_URL=http://127.0.0.1:8900 MERCHANT_KEYPAIR=~/.config/solana/id.json MINT="$MINT" PRICE_PER_TOKEN=10 node server/dist/src/serve.js

# Agent happy path (own terminal)
CHANNEL_PROGRAM_ID=<upstream-id> RPC_URL=http://127.0.0.1:8900 SERVER_URL=http://127.0.0.1:3001 \
AGENT_KEYPAIR=~/.config/solana/loop-agent.json MERCHANT_PUBKEY=<merchant> MINT="$MINT" \
DEPOSIT=200000 REQUESTS=3 BUDGET_PER_REQUEST=5000 SALT=100 node agent/dist/src/index.js
# Expect: request 1/2/3 ok + `settled at …`

# Kill the merchant, run the fail path (nothing settles), revive
curl -X POST http://127.0.0.1:3001/admin/kill -H 'content-type: application/json' -d '{"killed":true}'
CHANNEL_PROGRAM_ID=<upstream-id> RPC_URL=http://127.0.0.1:8900 SERVER_URL=http://127.0.0.1:3001 \
AGENT_KEYPAIR=~/.config/solana/loop-agent.json MERCHANT_PUBKEY=<merchant> MINT="$MINT" \
DEPOSIT=200000 REQUESTS=2 BUDGET_PER_REQUEST=5000 SALT=101 node agent/dist/src/index.js
# Expect: `request 1 failed` + `no successful requests; skipping settle` (note the channel address)
curl -X POST http://127.0.0.1:3001/admin/kill -H 'content-type: application/json' -d '{"killed":false}'

# Dispute nonce 1 as the claimant (= channel payer), then resolve
RPC_URL=http://127.0.0.1:8900 CLAIMANT_KEYPAIR=~/.config/solana/loop-agent.json \
BOND=<bond> BINDING=<binding> CHANNEL=<fail-channel> MINT="$MINT" \
NONCE=1 REASON=1 CLAIM_SPEND=2000 node keeper/dist/scripts/dispute.js
# BINDING = binding PDA for the fail channel (scripts/lib/binding-pda.mjs with FAIL_CHANNEL set)
OPERATOR_KEYPAIR=~/.config/solana/id.json RPC_URL=http://127.0.0.1:8900 \
POLL_MS=5000 MODE=live RUN_ONCE=1 node keeper/dist/src/index.js
# Expect after maturity: `pass: resolved=1 pending=0`
# (the loop script waits for maturity automatically; manually, poll until
# current slot passes the dispute's deadlineSlot, then run keeper)
```

`<upstream-id>` on localnet is `solana-keygen pubkey $UPSTREAM_KEYPAIR`;
on devnet it is the canonical `CHNLxYvVA28MJP9PrFuDXccuoGXAx7jBacfLEkahyGsX`.

## 6. Troubleshooting

- `EADDRINUSE` — a stranger owns the port. The loop script aborts
  rather than kill it; free the port or override `RPC_URL`/`SERVER_URL`.
- `block height exceeded` — stale blockhash under a throttled RPC;
  SDK `sendWithRetry` covers app paths; re-run validator-adjacent scripts.
- `anchor build` fails — check `anchor --version` (1.0.0) and that the
  `anchor` shim, not an old global install, is on PATH.
- Wrong chain (high slot after `--reset`) — you are talking to someone
  else's validator; check `--url` / `RPC_URL`.
