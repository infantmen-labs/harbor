# Harbor production deploy (devnet)

Backend runbook: merchant server + keeper. The web app (landing +
docs) deploys separately — see `web/README.md`, the only web deploy
doc. Deploy the backend first: the web build bakes the server URL
into its `/api` proxy at build time.

Live deployment record (fill in as you go):

| Service          | URL                                                                               |
| ---------------- | --------------------------------------------------------------------------------- |
| Server (Railway) | _pending_ (VPS is the live backend, §3)                                           |
| Keeper (Railway) | runs inside Railway, no public URL needed                                         |
| Server (VPS, §3) | loopback-only; public via tunnel origin, fronted by the site's `/api/*` (see §3)  |
| Keeper (VPS, §3) | runs on VPS, no public URL needed                                                 |

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
| `RPC_URL`                    | `<QUICKNODE_DEVNET_URL>` (your devnet endpoint URL from the QuickNode dashboard — never commit the real value)                                                                                                                                                                            |
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

## 3. Server + keeper (self-hosted VPS, alternative to Railway)

Any recent Ubuntu/Debian host with Node ≥22 (wallet-standard dep
engines gate). Paths below are examples — substitute your own layout;
ship code with `git archive HEAD` (tracked files only, secrets never
in the tree):

- Secrets in a root-only env dir (e.g. `/etc/harbor/`, mode `600`):
  `merchant.json`, `operator.json`, `server.env`, `keeper.env`. Key
  envs: `PORT` (default 3000 — pick any free port), `RPC_URL`,
  `MINT`, `PRICE_PER_TOKEN=10`, `KILL_TOKEN`,
  `UPSTREAM_PROGRAM_ALLOWLIST`, `STORE_PATH` (server, persistent
  path), `MODE=live`, `POLL_MS`, `LOG_PATH` (keeper, persistent path).
  Run services as a dedicated non-root user.
- systemd units `harbor-server` + `harbor-keeper` (`Restart=always`,
  enabled; verify with a reboot test).
- Firewall: allow 22/80/443 only. Put a TLS reverse proxy in front
  for the public API (e.g. Caddy with a domain whose DNS points at
  the box: `api.<domain> { reverse_proxy 127.0.0.1:<port> }`). Until
  then the API is loopback-only; reach it via an SSH tunnel
  (`ssh -L <port>:127.0.0.1:<port> <user>@<host>`) for tests/demos.
- Public origin (current mechanism): a Cloudflare quick tunnel,
  outbound-only so no firewall ports open. Install `cloudflared`, run
  `cloudflared tunnel --url http://127.0.0.1:<port> --no-autoupdate`
  as the dedicated user under systemd (`cloudflared-harbor`,
  `Restart=always`, enabled). The site build takes this origin as
  `NEXT_PUBLIC_SERVER_URL` and fronts it at its own `/api/*` — visitors
  never see the tunnel hostname. Caveat: quick-tunnel hostnames change
  when the tunnel restarts — re-fetch with
  `journalctl -u cloudflared-harbor | grep -oE 'https://[A-Za-z0-9.-]+\.trycloudflare\.com'`,
  update the web env var, and redeploy web (the rewrite target bakes at
  build time). Stable upgrades, both drop-in: a named tunnel (one-time
  Cloudflare login) or `api.<domain>` via Caddy.
- Redeploys: `git archive HEAD` → extract → `yarn install
--frozen-lockfile && yarn build` → restart both units.
- Keeper startup log redacts the RPC query string (hosted keys live
  there). If a key ever hits journals, rotate it in the Helius
  dashboard + both consumers (`/etc/harbor/server.env`,
  `/etc/harbor/keeper.env`).

## 4. Smoke test (post-deploy)

```sh
curl https://<server>/info                                     # killed: false
curl "https://<server>/receipt/<channel>/1"                   # signed receipt json (after a happy run)
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
  onchain and safe. Never mirror the token into a `NEXT_PUBLIC_*`
  var (readable by every visitor); a Kill control must call a
  server-side route that holds the token.
- **RPC budget**: server polls onchain escrow per over-ceiling request
  and the keeper scans disputes every round — size the endpoint for
  both. If you rotate the RPC URL, update server + keeper together.
- **Restarting keeper is safe**: it scans all open disputes every poll
  and only acts past deadline; at-least-once resolution is idempotent
  onchain (a resolved dispute account is closed).
- **Redeploys**: push to the connected branch; Railway rebuilds from
  `railway.json`. No migration step exists — onchain state is never
  touched by deploys.
