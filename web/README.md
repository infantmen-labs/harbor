# Harbor web app

Next.js App Router + Tailwind v4 + wallet adapter. Three routes: `/`
(landing), `/live` (mission control), `/merchant` (production surface).

## Backend freeze

Built against backend tag `backend-freeze-v7` (program v0.4.3).
Contracts: `../docs/ui-contracts.md` (see Amendments sections). IDL
vendored at `lib/idl.json` (11 instructions). No backend changes from
this directory — a missing need goes in the UI layer or triggers a
versioned backend bump.

## Env

- `NEXT_PUBLIC_RPC_URL` — Solana RPC (devnet).
- `NEXT_PUBLIC_SERVER_URL` — `harbor-server` base URL (via `/api`
  rewrites in production).
- `NEXT_PUBLIC_PROGRAM_ID` — Harbor program (default: devnet deployment).
- `NEXT_PUBLIC_CHANNEL_PROGRAM_ID` — upstream payment-channels program
  (default: canonical ID).
- `NEXT_PUBLIC_KILL_TOKEN` — bearer token for the Kill button (must
  match the server's `KILL_TOKEN`; unset = open).

## Scripts

- `yarn dev` / `yarn build` / `yarn start` (see root for workspace).
- `?mock=1` renders the full fail-path story from fixtures, no network.
