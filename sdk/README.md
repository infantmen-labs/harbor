# @infantmen-labs/harbor-sdk

TypeScript SDK for Harbor bonded refunds on Solana: PDA helpers,
instruction builders, receipt codec, ed25519 verify, account decoders.

```sh
npm i @infantmen-labs/harbor-sdk
```

```ts
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

What it covers: `bondPda` / `bindingPda` / `disputePda` / `receiptPda` /
`treasuryPda` / `claimPda`, instruction builders for all 11 program
entrypoints, the receipt-v1 layout (249 bytes; `mint` + `programId`
domain separators appended — all v0 offsets unchanged), voucher bytes,
and zero-dependency account decoders. See `examples/bond-watch` for a
complete third-party monitor built on SDK + web3.js only.

## Buyer patterns (demand-side integration)

Upstream channel builders (`openChannelIx` / `topUpIx` / `settleIx`,
`deriveChannel`, plus the close lifecycle `requestCloseIx` / `sealIx` /
`withdrawPayerIx` / `distributeIx` / `reclaimIx`) live here so buyers
never reimplement consensus-critical bytes by copy-paste. `vaultAta`,
`decodeBinding`, and receipt-expiry readers round out the buyer surface.
The proven demand-side flow:

1. **Gate on collateral.** Derive `bondPda(merchant, mint)` offline,
   `decodeBond` it, refuse when `amount − reserved` is below your
   policy — before opening any channel or locking any escrow.
2. **Cover every voucher.** `assertVoucherCoversQuote` enforces
   voucher-delta ≥ quoted cost. This is billing-ack hygiene, NOT
   delivery acceptance: pay for unit N+1 only after verifying unit N's
   receipt AND accepting unit N's output bytes yourself. A valid
   signature never proves correctness — nothing in this SDK will stop
   you from treating it as one, so separate the two checks explicitly.
3. **Size disputes from chain, not memory.** `suggestClaimSpend`
   returns `min(binding.maxSpend, funded ATA, floor(bondFree / 3))`.
   A `0n` suggestion means no safe claim exists — do not open.
4. **Resolve via any live keeper.** Any keeper watching the program
   resolves matured disputes; verify onchain (dispute account closed,
   claimant +95%). Operate your own for production (see keeper README).

## Live devnet endpoints

All on Solana devnet, live today — the docs site exposes the demo
merchant at its own /api (see harbor-orch.vercel.app/docs):

| What | Address |
|---|---|
| Harbor program | BuRyKLqCsTLcyLVFEjxTjmF4DryCT3LmVDjwqhduvB4H |
| Channels program | CHNLxYvVA28MJP9PrFuDXccuoGXAx7jBacfLEkahyGsX |
| tUSDC mint | HDwpthFfTBi4YyGo1zgd7zxyonE5CZsCizpVqURHGD54 |
| Demo merchant | GQyf8wvGfpaLZvfvbXonpdiEfAGRvRXz2P6PkWxQ4rLJ |
| Demo bond | 2G19xBTWXTYM8y6rQCs9ucMkQr36RDX1FucMf22jFLuP |

Devnet tUSDC for testing: POST https://harbor-orch.vercel.app/api/faucet
with {"address":"<wallet>"} — 50 per drip, 100 lifetime per address,
5/day per IP (the mint is closed, so this spends a funded pot).

## Receipt v1 migration (from 0.4.x)

receiptMessageBytes now requires two extra fields — mint and programId —
appended after signer (249 bytes total; every v0 offset unchanged).
Verification of a v0 receipt fails against the deployed v1 program by
construction, so migrate when you upgrade. Full layout:
docs/receipt-schema-v1.md in the repo.

## Docs

- Repo: https://github.com/infantmen-labs/harbor
- Buyer quickstart + live endpoints: docs/buyer-quickstart.md (repo)
- On-site integration guide: https://harbor-orch.vercel.app/docs
- Proof bundle (every claim explorer-clickable): docs/proof-bundle.md (repo)
