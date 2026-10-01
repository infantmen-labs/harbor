# Harbor

Bonded optimistic refunds for metered APIs. Merchants post a bond;
agents pay through Solana payment channels; any claim past the challenge
window refunds automatically from the bond, plus a penalty to the
backstop — no chargebacks, no accounts, no judges. Receipts attest
delivery offchain but never acquit onchain, by design (see
`docs/ui-contracts.md` Amendments v0.2.0 for the exact trust model).

- Program: `BuRyKLqCsTLcyLVFEjxTjmF4DryCT3LmVDjwqhduvB4H` (devnet + localnet)
- Upstream: `solana-foundation/payment-channels` @ `3ffa4d67`
- Docs: `docs/` (schema, coordination, proof bundle, review, business)

## Use the SDK (third parties start here)

```sh
npm i @infantmen-labs/harbor-sdk
```

```ts
import { Connection, PublicKey } from "@solana/web3.js";
import {
  bondPda,
  decodeBond,
  receiptMessageBytes,
  verifyEd25519,
} from "@infantmen-labs/harbor-sdk";

// Locate any merchant's bond — derived offline, no RPC call.
const [bond] = bondPda(merchant, mint);

// Read its health: bonded, reserved, and free collateral.
const info = await connection.getAccountInfo(bond);
if (info === null) throw new Error("bond not found");
const { amount, reserved, openDisputes } = decodeBond(info.data);

// Verify every delivery before paying for the next unit.
const ok = verifyEd25519(signer, receiptMessageBytes(receipt), signature);
```

See `examples/bond-watch` for a complete read-only monitor (bond health

- open disputes, SDK + web3.js only, no wallet, no funds).

## One-command verification

```sh
anchor build         # harbor.so (program suites + localnet need it)
yarn install         # TS workspaces (sdk, log, server, agent, keeper, web)
yarn lint            # prettier check
yarn build           # dist/ entrypoints for server, agent, keeper
yarn test            # TS suites (sdk, server, agent, keeper)
cargo test -p harbor # program suites via LiteSVM (no validator needed)
anchor test          # full localnet suite (bond, receipts, disputes, composition)
```

## Local end-to-end

```sh
./scripts/local-loop.sh    # isolated stack (:8900/:3001), happy -> kill ->
                           # dispute -> keeper resolve, math verified to the unit
```

Needs `anchor build` + `yarn build` first, a locally-built upstream
`.so` via `UPSTREAM_SO` (required — build per `docs/proof-bundle.md`
v0.4.0 notes), and keypairs via `MERCHANT_KEYPAIR` / `AGENT_KEYPAIR`
env. All run state (ledger, logs, pidfiles) stays in `./.loop-run`
(gitignored, override with `LOOP_DIR`).

## Layout

- `programs/harbor` — Anchor program (bond, receipts, disputes, halt)
- `sdk` — PDAs, receipt/voucher bytes, instruction builders, account
  decoders (`sdk/README.md`)
- `server` — metered API with voucher verification + receipt signing
  (`server/README.md`)
- `agent` — channel lifecycle CLI with receipt verification
  (`agent/README.md`)
- `keeper` — dispute watcher/resolver, dry-run + live
  (`keeper/README.md`)
- `web` — landing + mission control + merchant onboarding
  (`web/README.md`); dev on `:3101`, the server owns `:3000`
- `examples/bond-watch` — third-party read-only bond monitor
- `scripts/local-loop.sh` — one-command localnet full loop
- `docs` — schema, coordination, proofs, review, business, disclosure
