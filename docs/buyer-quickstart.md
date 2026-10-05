# Buyer quickstart: metered API purchases with bonded refunds

You need Node 22+, nothing else — no repo clone, no validator, no anchor.
All state below reads the live devnet program unless noted.

```sh
npm i @infantmen-labs/harbor-sdk @solana/web3.js
```

## 1. Gate on collateral (offline + one read)

```ts
import { Connection, PublicKey } from "@solana/web3.js";
import { bondPda, decodeBond } from "@infantmen-labs/harbor-sdk";

const connection = new Connection("https://api.devnet.solana.com");
const merchant = new PublicKey("<merchant>");
const mint = new PublicKey("<tUSDC-mint>");

// Derived offline — no RPC call to start.
const [bond] = bondPda(merchant, mint);
const info = await connection.getAccountInfo(bond);
if (info === null) throw new Error("merchant has no bond: do not buy");
const { amount, reserved } = decodeBond(info.data);
const free = amount - reserved;
const MIN_BOND_FREE = 50_000n; // your policy, not Harbor's
if (free < MIN_BOND_FREE) throw new Error(`bond too thin: ${free} free`);
```

## 2. Open a channel

```ts
import {
  ataFor,
  channelAta,
  deriveChannel,
  openChannelIx,
  ATA_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from "@infantmen-labs/harbor-sdk";

const channelProgram = new PublicKey("<channels-program>");
const salt = BigInt(Date.now() % 1_000_000);
const openSlot = BigInt(await connection.getSlot()); // must be recent
const { channel } = deriveChannel(
  channelProgram,
  payer,
  merchant,
  mint,
  payer,
  salt,
  openSlot
);
const payerAta = ataFor(payer, mint);
const [channelAta_] = channelAta(
  channel,
  TOKEN_PROGRAM_ID,
  mint,
  ATA_PROGRAM_ID
);
const [eventAuthority] = PublicKey.findProgramAddressSync(
  [Buffer.from("event_authority")],
  channelProgram
);
const ix = openChannelIx({
  programId: channelProgram,
  payer,
  payee: merchant,
  mint,
  authorizedSigner: payer,
  channel,
  payerAta,
  channelAta: channelAta_,
  eventAuthority,
  salt,
  deposit: 100_000n,
  gracePeriod: 7200,
  openSlot,
});
// Sign with the payer keypair and send. Fund payerAta first.
```

## 3. Buy units, verify before paying for the next

```ts
import {
  assertVoucherCoversQuote,
  channelVoucherBytes,
  receiptMessageBytes,
  signEd25519,
  verifyEd25519,
} from "@infantmen-labs/harbor-sdk";

// Authorize unit N+1 only after unit N checks out:
assertVoucherCoversQuote({ lastCumulative, voucherCumulative, quotedCost });
const voucherSig = signEd25519(
  payerSecret,
  channelVoucherBytes(channel, voucherCumulative, 0n) // 0 = no expiry
);
// POST voucher to the merchant; on HTTP 200 with output bytes:
const msg = receiptMessageBytes({
  merchant,
  binding,
  cumulativeSpend,
  meterHash,
  outputHash,
  status,
  nonce,
  expirySlot,
  signer,
});
const ok = verifyEd25519(signer, msg, signature);
if (!ok) throw new Error("bad receipt: stop buying");
// A valid signature is billing-ack only — accept output bytes yourself.
```

`meterHash` / `outputHash` are `sha256(input)` / `sha256(output)`;
`binding` is the merchant's session binding for your channel.

## 4. Dispute genuine non-delivery

A 500 with no receipt, after escrow lock, is disputable:

```ts
import {
  claimPda,
  disputePda,
  openDisputeIx,
  suggestClaimSpend,
} from "@infantmen-labs/harbor-sdk";

const { claimSpend, nonce } = await suggestClaimSpend(connection, {
  binding,
  claimant: payer,
  mint,
});
if (claimSpend === 0n) throw new Error("no safe claim: walk away");
const [dispute] = disputePda(binding, nonce);
const [claim] = claimPda(binding, nonce);
// ... openDisputeIx(programId, payer, bond, binding, channel, dispute,
//   claim, mint, claimantAta, vault, nonce, 1, claimSpend) ...
// Any live keeper resolves past the deadline; verify the dispute
// account closed and your +95% landed. Operate your own keeper
// (see "Run the keeper") for production.
```

## 5. Reclaim the remainder

```ts
import {
  distributeIx,
  reclaimIx,
  requestCloseIx,
  sealIx,
  withdrawPayerIx,
} from "@infantmen-labs/harbor-sdk";

// requestClose (payer) → wait past grace → seal (permissionless crank)
// → withdrawPayer (remainder home) → distribute (merchant paid, escrow
// closed) → reclaim rent past open_slot + 1500. distribute needs the
// upstream treasury owner for your cluster (devnet record lives in
// Harbor's upstream pin; localnet fixtures use the sentinel default).
```

Next: [SDK reference](./sdk) for every builder, [Run the
keeper](./keeper) for resolution, [Trust model](./authority) for what
receipts do and don't prove.
