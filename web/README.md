# Harbor web app

Next.js App Router + Tailwind v4 + wallet adapter. Single route: `/`
(landing). The `/live` mission-control and `/merchant` onboarding pages
were retired; the dashboard UI is being rebuilt from this landing page.

## Quickstart (local dev)

```sh
# 1. From the repo root, install + build once:
yarn install && yarn build

# 2. Copy env and point at your stack:
cp web/.env.example web/.env.local   # then edit RPC + server URLs

# 3. Run the API server first (it owns :3000 — see ../server/README.md),
#    then the web app on :3101 to avoid the port collision:
yarn --cwd server start              # :3000, needs MERCHANT_KEYPAIR + MINT
yarn --cwd web dev --port 3101       # open http://127.0.0.1:3101
```

The browser never talks to Solana or the API server directly: `/api/*`
is proxied to `NEXT_PUBLIC_SERVER_URL`, so the app works with no CORS
setup as long as the server is up before you load the page.

## Backend freeze

Built against backend tag `backend-freeze-v7` (program v0.4.3).
Contracts: `../docs/ui-contracts.md` (see Amendments sections). IDL
vendored at `lib/idl.json` (11 instructions). No backend changes from
this directory — a missing need goes in the UI layer or triggers a
versioned backend bump.

## Env (all `NEXT_PUBLIC_*`, read at build/boot time)

- `NEXT_PUBLIC_RPC_URL` — Solana RPC (devnet default).
- `NEXT_PUBLIC_SERVER_URL` — `harbor-server` base URL (default
  `http://127.0.0.1:3000`, must match the running server).
- `NEXT_PUBLIC_PROGRAM_ID` — Harbor program (default: devnet deployment).
- `NEXT_PUBLIC_CHANNEL_PROGRAM_ID` — upstream payment-channels program
  (default: canonical ID).
- `NEXT_PUBLIC_KILL_TOKEN` — reserved for the rebuilt dashboard's Kill
  control (must match the server's `KILL_TOKEN` when it lands).

## Scripts

- `yarn dev --port 3101` / `yarn build` / `yarn start` (run from root
  with `yarn --cwd web ...`, or from this directory directly).
