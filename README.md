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
const { amount, reserved, openDisputes } = decodeBond(info.data);

// Verify every delivery before paying for the next unit.
const ok = verifyEd25519(signer, receiptMessageBytes(receipt), signature);
```

See `examples/bond-watch` for a complete read-only monitor (bond health

- open disputes, SDK + web3.js only, no wallet, no funds).

## One-command verification

```sh
anchor test          # onchain suite (bond, receipts, disputes, composition)
yarn install         # TS workspaces (sdk, server, agent, keeper)
yarn --cwd sdk test && yarn --cwd server test && yarn --cwd agent test && yarn --cwd keeper test
```

## Local end-to-end

```sh
solana-test-validator --reset            # terminal 1
MERCHANT_KEYPAIR=~/.config/solana/id.json MINT=<mint> yarn --cwd server start   # terminal 2
# terminal 3: run agent, then kill mid-stream, dispute, resolve (see docs/proof-bundle.md)
```

## Layout

- `programs/harbor` — Anchor program (bond, receipts, disputes, halt)
- `sdk` — PDAs, receipt/voucher bytes, instruction builders, JSONL log
- `server` — metered API with voucher verification + receipt signing
- `agent` — channel lifecycle CLI with receipt verification
- `keeper` — dispute watcher/resolver (dry-run + live)
- `docs` — schema, coordination, proofs, review, business, disclosure
