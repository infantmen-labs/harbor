# Buyer quickstart: metered API purchases with bonded refunds

You need Node 22+, nothing else — no repo clone, no validator, no anchor.
Steps 1–2 below read the live devnet program directly. Steps 3–5 buy
against a merchant server: run your own (`server/README.md`) or point
at a deployed one — the demo site exposes the live merchant at its
`/api/*` routes (same API, site domain; see [Deploy to production](./deploy)).

Live devnet endpoints (also in [Deploy to production](./deploy)):

| What             | Address                                                     |
| ---------------- | ----------------------------------------------------------- |
| Harbor program   | `BuRyKLqCsTLcyLVFEjxTjmF4DryCT3LmVDjwqhduvB4H`              |
| Channels program | `CHNLxYvVA28MJP9PrFuDXccuoGXAx7jBacfLEkahyGsX`              |
| tUSDC mint       | `HDwpthFfTBi4YyGo1zgd7zxyonE5CZsCizpVqURHGD54` (6 decimals) |
| Demo merchant    | `GQyf8wvGfpaLZvfvbXonpdiEfAGRvRXz2P6PkWxQ4rLJ`              |
| Demo bond        | `2G19xBTWXTYM8y6rQCs9ucMkQr36RDX1FucMf22jFLuP`              |

Amounts are mint base units throughout (6 decimals: `1_000_000` = 1 tUSDC).

```sh
npm i @infantmen-labs/harbor-sdk @solana/web3.js
```

Prefer a complete runnable script over snippets? `examples/bond-watch`
(in the repo) reads the demo bond end-to-end on SDK + web3.js only (no
wallet, no funds) — run it first to confirm your toolchain sees the
chain before opening channels or locking funds.

## 1. Gate on collateral (offline + one read)

```ts
import { Connection, PublicKey } from "@solana/web3.js";
import { bondPda, decodeBond } from "@infantmen-labs/harbor-sdk";

const connection = new Connection("https://api.devnet.solana.com");
// Demo merchant + tUSDC mint on devnet (table above for the rest):
const merchant = new PublicKey("GQyf8wvGfpaLZvfvbXonpdiEfAGRvRXz2P6PkWxQ4rLJ");
const mint = new PublicKey("HDwpthFfTBi4YyGo1zgd7zxyonE5CZsCizpVqURHGD54");

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

const channelProgram = new PublicKey(
  "CHNLxYvVA28MJP9PrFuDXccuoGXAx7jBacfLEkahyGsX" // devnet channels program
);
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

Each unit is a voucher POSTed to the merchant server. Before that you
need a session: `POST /session {channel, channelProgram, deposit,
authorizedSigner}` returns `{binding}` — the Harbor binding PDA for
your channel. The merchant's unit price comes from `GET /info`
(`pricePerToken`). Your payer ATA must hold enough of the bond mint to
cover the channel deposit plus any later claim stake.

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

`lastCumulative` starts at `0n` and tracks the previous voucher;
`voucherCumulative` is `lastCumulative + quotedCost` per unit.
`meterHash` / `outputHash` are `sha256(input)` / `sha256(output)`;
`binding` is the `{binding}` your `/session` call returned. The
merchant returns `cumulativeSpend`, `nonce` (strictly +1 per unit —
the server rejects anything else), `expirySlot`, `signer`, and
`signature` with each receipt — verify them, don't construct them.

## 4. Dispute genuine non-delivery

A 500 with no receipt, after escrow lock, is disputable:

```ts
import {
  ataFor,
  bondPda,
  claimPda,
  disputePda,
  openDisputeIx,
  suggestClaimSpend,
  vaultAta,
} from "@infantmen-labs/harbor-sdk";

const { claimSpend, nonce } = await suggestClaimSpend(connection, {
  binding,
  claimant: payer,
  mint,
});
if (claimSpend === 0n) throw new Error("no safe claim: walk away");
const [bond] = bondPda(merchant, mint);
const [dispute] = disputePda(binding, nonce);
const [claim] = claimPda(binding, nonce);
const claimantAta = ataFor(payer, mint);
const vault = vaultAta(bond, mint);
// reason 1 = TIMEOUT (full table: [Receipt schema](./receipt-schema));
const ix = openDisputeIx(
  programId,
  payer,
  bond,
  binding,
  channel,
  dispute,
  claim,
  mint,
  claimantAta,
  vault,
  nonce,
  1,
  claimSpend
);
// Sign with the payer keypair — the claimant MUST be the channel payer
// (strangers are rejected onchain) — and send. Your claimant ATA must
// already hold ≥ claimSpend of the bond mint: the claim is staked, not
// minted.
// Any live keeper resolves past the deadline; verify the dispute
// account closed and your +95% landed. Operate your own keeper
// (see "Run the keeper") for production.
```

## 5. Reclaim the remainder

Closing is a fixed upstream sequence: `requestClose` (payer) → wait
past the grace period → `seal` (permissionless crank) → `withdrawPayer`
(remainder home) → `distribute` (merchant paid, escrow closed) →
`reclaim` rent past open_slot + 1500. The reference agent runs this for
you on exit (`agent/README.md`); the SDK exports every builder
(`requestCloseIx` / `sealIx` / `withdrawPayerIx` / `distributeIx` /
`reclaimIx`) for custom clients. `distribute` needs the upstream
treasury owner for your cluster (devnet record lives in Harbor's
upstream pin; localnet fixtures use the sentinel default).

Next: [SDK reference](./sdk) for every builder, [Run the
keeper](./keeper) for resolution, [Trust model](./authority) for what
receipts do and don't prove.
