# Harbor production deploy (devnet)

Three services. Deploy in order: **server → keeper → web** (the web
build bakes the server URL into its `/api` proxy at build time, so the
server must have its public URL first).

Live deployment record (fill in as you go):

| Service          | URL                                       |
| ---------------- | ----------------------------------------- |
| Server (Railway) | _pending_                                 |
| Keeper (Railway) | runs inside Railway, no public URL needed |
| Web (Vercel)     | _pending_                                 |

Chain artifacts (devnet):

| Artifact         | Address                                                                         |
| ---------------- | ------------------------------------------------------------------------------- |
| Harbor program   | `BuRyKLqCsTLcyLVFEjxTjmF4DryCT3LmVDjwqhduvB4H`                                  |
| Channels program | `CHNLxYvVA28MJP9PrFuDXccuoGXAx7jBacfLEkahyGsX`                                  |
| tUSDC mint       | `HDwpthFfTBi4YyGo1zgd7zxyonE5CZsCizpVqURHGD54` (6 decimals)                     |
| Merchant         | `GQyf8wvGfpaLZvfvbXonpdiEfAGRvRXz2P6PkWxQ4rLJ` (also program upgrade authority) |
| Bond             | `2G19xBTWXTYM8y6rQCs9ucMkQr36RDX1FucMf22jFLuP` (500,000 base units)             |
| Keeper operator  | `5gRRZXP18ZzUHB9Ud6vnnsAApgYXRVQxzXa2Uuf4f8en` (fee payer only, no privileges)  |

## 0. Key material (devnet-only)

These keys hold no real funds. Never commit them; they live in
`~/.config/solana/` locally and as base64 env vars in Railway.

```sh
base64 -w0 ~/.config/solana/id.json              # MERCHANT_KEYPAIR_B64
base64 -w0 ~/.config/solana/harbor-operator.json # OPERATOR_KEYPAIR_B64
```

macOS: `base64 -i <file> | tr -d '\n'`.

## 1. Server (Railway)

1. New project → Deploy from GitHub repo, **root directory = repo root**
   (`railway.json` is picked up automatically).
2. Variables:

| Var                          | Value                                                                                                                                                                                                                                                                                     |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `RPC_URL`                    | `<QUICKNODE_DEVNET_URL>` (your devnet endpoint URL from the QuickNode dashboard — never commit the real value; the local copy lives in `web/.env.local`, gitignored)                                                                                                                      |
| `MINT`                       | `HDwpthFfTBi4YyGo1zgd7zxyonE5CZsCizpVqURHGD54`                                                                                                                                                                                                                                            |
| `PRICE_PER_TOKEN`            | `10`                                                                                                                                                                                                                                                                                      |
| `MERCHANT_KEYPAIR_B64`       | base64 of the merchant keypair (see §0)                                                                                                                                                                                                                                                   |
| `KILL_TOKEN`                 | a random string (e.g. `openssl rand -hex 16`); gates `POST /admin/kill {killed:true}` via `Authorization: Bearer <token>`. Revive stays public. Unset = open (local rehearsal only)                                                                                                       |
| `UPSTREAM_PROGRAM_ALLOWLIST` | comma-separated program IDs the server will bind as the merchant (default: canonical `CHNLxYvVA28MJP9PrFuDXccuoGXAx7jBacfLEkahyGsX`). Unknown programs get 400 before any signature — this is what stops induced binds of attacker-owned programs. Localnet rehearsals set the fixture ID |
| `PORT`                       | provided by Railway automatically                                                                                                                                                                                                                                                         |

3. Generate a public domain. Health check is `GET /info` (returns
   `{ merchant, pricePerToken, killed }`).
4. Verify: `curl https://<server>/info` → `killed: false`.

The keypair is decoded to `/tmp/merchant.json` at boot by the start
command — no code change was needed because the server already reads
`MERCHANT_KEYPAIR` as a path.

## 2. Keeper (Railway, second service, same repo)

1. Same project → New service → same repo, same root directory.
2. Override the start command (Service → Settings → Deploy):

```sh
sh -c 'echo "$OPERATOR_KEYPAIR_B64" | base64 -d > /tmp/operator.json && OPERATOR_KEYPAIR=/tmp/operator.json RPC_URL=<QUICKNODE_DEVNET_URL> POLL_MS=15000 MODE=live yarn workspace harbor-keeper start'
```

3. Variables: `OPERATOR_KEYPAIR_B64` (see §0). No public domain needed.
4. Liveness check: lifecycle lines appear in the service logs; real
   proof is onchain — an unresolved dispute past its deadline gets a
   `resolve-timeout` transaction from the operator address within a few
   poll rounds.

`HARBOR_PROGRAM_ID` and `UPSTREAM_PROGRAM_ALLOWLIST` default to the
correct devnet addresses; set them explicitly only if the programs move.

## 3. Web (Vercel)

1. Import the repo, **Root Directory = `web`**
   (Vercel installs the yarn workspaces from the repo root automatically).
2. Environment (Production **and** Preview), set **before the first build**:

| Var                              | Value                                           |
| -------------------------------- | ----------------------------------------------- |
| `NEXT_PUBLIC_RPC_URL`            | QuickNode devnet URL (same as server `RPC_URL`) |
| `NEXT_PUBLIC_SERVER_URL`         | `https://<server>` from §1 (no trailing slash)  |
| `NEXT_PUBLIC_PROGRAM_ID`         | `BuRyKLqCsTLcyLVFEjxTjmF4DryCT3LmVDjwqhduvB4H`  |
| `NEXT_PUBLIC_CHANNEL_PROGRAM_ID` | `CHNLxYvVA28MJP9PrFuDXccuoGXAx7jBacfLEkahyGsX`  |

3. Deploy. `/api/*` rewrites to the server are baked at build time —
   if the server URL ever changes, update the var and redeploy web.

## 1b. Server + keeper (VPS, alternative to Railway)

Live on Ubuntu 22.04 (user `harbor`, Node 22, code at `/opt/harbor` from
`git archive HEAD` — tracked files only, secrets never in the tree):

- Secrets in `/etc/harbor/` (`harbor:harbor`, `600`): `merchant.json`,
  `operator.json`, `server.env`, `keeper.env`. Key envs: `PORT=3100`
  (3000 is taken by another app on the box), `RPC_URL`, `MINT`,
  `PRICE_PER_TOKEN=10`, `KILL_TOKEN`, `UPSTREAM_PROGRAM_ALLOWLIST`,
  `STORE_PATH=/var/lib/harbor/store.json` (server), `MODE=live`,
  `POLL_MS=30000`, `LOG_PATH=/var/lib/harbor/keeper.jsonl` (keeper).
- systemd units `harbor-server` + `harbor-keeper` (`Restart=always`,
  enabled; both survive reboot — verified).
- Firewall: `ufw` allow 22/80/443 only. Caddy already serves another
  app — do NOT touch `/etc/caddy/Caddyfile`; public API needs a NEW
  domain with DNS pointing here, then append:
  `api.<domain> { reverse_proxy 127.0.0.1:3100 }` (Caddy gets TLS
  automatically). Until then the API is loopback-only; reach it via
  `ssh -L 3100:127.0.0.1:3100 ubuntu@<vps>` for tests/demos.
- Redeploys: `git archive HEAD` → extract to `/opt/harbor` →
  `yarn install --frozen-lockfile && yarn build` →
  `systemctl restart harbor-server harbor-keeper`. VPS needs Node ≥22
  (wallet-standard dep engines gate).
- Keeper startup log redacts the RPC query string (hosted keys live
  there). If a key ever hits journals, rotate it in the Helius
  dashboard + all three consumers (local `web/.env.local`,
  `/etc/harbor/server.env`, `/etc/harbor/keeper.env`).

## 4. Smoke test (post-deploy)

```sh
curl https://<server>/info                                     # killed: false
open https://<web>/live                                       # bond 2G19xBTW…, no-dispute state
open https://<web>/live?mock=1                                # offline fallback only
```

Then the live loop: agent happy run → receipts `signed ✓` →
Kill delivery → agent fails → open dispute with a locked claim
(claimant wallet needs the tokens) → keeper resolves → claimant gets
~95% back, bond drops `2×claim + fee` (penalty to the backstop
treasury). Example: claim 3,670 → refund 3,487, penalty 7,340.

## 5. Ops notes

- **Kill switch is bearer-gated** (`POST /admin/kill` with
  `killed:true` requires `Authorization: Bearer $KILL_TOKEN`; Revive is
  public). It is demo control, not a funds control — bond funds are
  onchain and safe. Set `KILL_TOKEN` on Railway **and** as
  `NEXT_PUBLIC_KILL_TOKEN` on Vercel so the UI's Kill button works.
- **RPC budget**: the UI polls with backoff+jitter and web3.js retries
  are disabled; the QuickNode endpoint absorbs judging traffic. If you
  rotate the RPC URL, update it in Railway (server + keeper) and Vercel
  (web) together.
- **Restarting keeper is safe**: it scans all open disputes every poll
  and only acts past deadline; at-least-once resolution is idempotent
  onchain (a resolved dispute account is closed).
- **Redeploys**: push to the connected branch; Railway rebuilds from
  `railway.json`, Vercel rebuilds the web app. No migration step exists
  — onchain state is never touched by deploys.
