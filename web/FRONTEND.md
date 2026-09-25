# Harbor web frontend

Next.js App Router + Tailwind v4 + wallet adapter. Three routes: `/`
(landing), `/live` (mission control), `/merchant` (production surface).

## Backend freeze

Built against backend tag `backend-freeze-v0`
(`fe1ea361b810bf5b0a224a5a47a02a309e9a95bf`).
Contracts: `../docs/ui-contracts.md`. IDL vendored at `lib/idl.json`
(11 instructions). No backend changes from this directory — a missing
need goes in the UI layer or triggers a versioned backend bump.

## Env

- `NEXT_PUBLIC_RPC_URL` — Solana RPC (devnet).
- `NEXT_PUBLIC_SERVER_URL` — `harbor-server` base URL (via `/api`
  rewrites in production).
- `NEXT_PUBLIC_PROGRAM_ID` — Harbor program (default: devnet deployment).

## Scripts

- `yarn dev` / `yarn build` / `yarn start` (see root for workspace).
- `?mock=1` renders the full fail-path story from fixtures, no network.
