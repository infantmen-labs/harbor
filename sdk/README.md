# harbor-sdk

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
entrypoints, the frozen 185-byte receipt layout, voucher bytes, and
zero-dependency account decoders. See `examples/bond-watch` for a
complete third-party monitor built on SDK + web3.js only.
