#!/usr/bin/env node
// Full upstream reclaim lifecycle on one channel: requestClose (payer) →
// poll to Sealed → withdrawPayer (remainder to payer, asserted) →
// distribute (empty plan: merchant paid, escrow closed, Distributed) →
// reclaim rent iff past open_slot + OPEN_SLOT_WINDOW (else skipped openly).
// Env: RPC_URL, CHANNEL_PROGRAM, CHANNEL, PAYER_KEYPAIR (path), MINT.
// Exits 1 on any assert mismatch. Treasury ATA is created if missing.
import { readFileSync } from "node:fs";
import { Connection, Keypair, PublicKey, Transaction } from "@solana/web3.js";
import {
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddress,
} from "@solana/spl-token";
import {
  ATA_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  ataFor,
  channelAta,
  distributeIx,
  reclaimIx,
  requestCloseIx,
  sealIx,
  sendWithRetry,
  withdrawPayerIx,
} from "../../sdk/dist/src/index.js";

const rpcUrl = process.env.RPC_URL;
const programId = new PublicKey(process.env.CHANNEL_PROGRAM);
const channel = new PublicKey(process.env.CHANNEL);
const mint = new PublicKey(process.env.MINT);
const payer = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(readFileSync(process.env.PAYER_KEYPAIR, "utf8")))
);

const conn = new Connection(rpcUrl, "confirmed");
const u64 = (d, o) => d.readBigUInt64LE(o);
const pk = (d, o) => new PublicKey(d.subarray(o, o + 32));

async function channelState() {
  const info = await conn.getAccountInfo(channel);
  if (info === null) throw new Error("channel account missing");
  const d = info.data;
  return {
    status: d[3],
    settled: u64(d, 20),
    payee: pk(d, 120),
    rentPayer: pk(d, 216),
    openSlot: u64(d, 248),
  };
}

async function tokenBal(ata) {
  const b = await conn.getTokenAccountBalance(ata).catch(() => null);
  return b === null ? null : BigInt(b.value.amount);
}

async function send(ixs) {
  const build = () => {
    const tx = new Transaction();
    for (const ix of ixs) tx.add(ix);
    return tx;
  };
  return sendWithRetry(conn, build, [payer]);
}

const [channelTokenAccount] = channelAta(
  channel,
  TOKEN_PROGRAM_ID,
  mint,
  ATA_PROGRAM_ID
);
const payerAta = ataFor(payer.publicKey, mint);
const [eventAuthority] = PublicKey.findProgramAddressSync(
  [Buffer.from("event_authority")],
  programId
);
// Treasury owner is a build-time upstream constant. Localnet fixtures use
// the 0xBEEF sentinel (source default). The canonical devnet deployment
// embeds `4zTeC5mV…DUspap` (== its upgrade authority; mapped by
// offset-matching the world-readable programdata against the sentinel
// build — see docs/upstream-pin.md). Set TREASURY_OWNER to override.
const treasuryOwner = process.env.TREASURY_OWNER
  ? new PublicKey(process.env.TREASURY_OWNER)
  : new PublicKey(
      Buffer.from(
        Array.from({ length: 32 }, (_, i) => (i % 2 === 0 ? 0xbe : 0xef))
      )
    );
const treasuryAta = ataFor(treasuryOwner, mint);

// 1. requestClose (payer-signed) → Closing(2).
await send([requestCloseIx({ programId, payer: payer.publicKey, channel })]);
let st = await channelState();
if (st.status !== 2) throw new Error(`expected Closing(2), got ${st.status}`);
console.log("close requested: status=Closing");

// 2. Crank seal until Sealed(1) — seal is permissionless; pre-grace attempts
// fail with SealGracePeriodNotElapsed (expected, ignored). SEAL_TIMEOUT_SECS
// bounds the crank (default 300; long-grace channels need ~grace seconds).
const sealTimeoutMs = BigInt(process.env.SEAL_TIMEOUT_SECS ?? "300") * 1000n;
const t0 = Date.now();
let firstSealErr = null;
for (;;) {
  try {
    await send([sealIx({ programId, channel })]);
  } catch (e) {
    // Pre-grace SealGracePeriodNotElapsed is expected — keep cranking.
    // Anything persistent fails loud at the timeout below; log the first
    // error so a real bug is diagnosable without waiting blind.
    if (firstSealErr === null) {
      firstSealErr = e instanceof Error ? e.message : String(e);
      console.log(`seal attempt (pre-grace ok): ${firstSealErr.slice(0, 120)}`);
    }
  }
  st = await channelState();
  if (st.status === 1) break;
  if (BigInt(Date.now() - t0) > sealTimeoutMs)
    throw new Error(`channel never sealed within ${sealTimeoutMs / 1000n}s`);
  await new Promise((r) => setTimeout(r, 5000));
}
console.log(`sealed: settled=${st.settled}`);

// 3. withdrawPayer: remainder (escrow − settled) back to the payer.
const escrowBefore = await tokenBal(channelTokenAccount);
const payerBefore = await tokenBal(payerAta);
if (escrowBefore === null || escrowBefore === 0n)
  throw new Error("empty escrow, nothing to reclaim");
await send([
  withdrawPayerIx({
    programId,
    payer: payer.publicKey,
    channel,
    channelAta: channelTokenAccount,
    payerAta,
    mint,
  }),
]);
const payerDelta = (await tokenBal(payerAta)) - payerBefore;
const wantRemainder = escrowBefore - st.settled;
if (payerDelta !== wantRemainder) {
  throw new Error(
    `payer delta ${payerDelta} != escrow ${escrowBefore} - settled ${st.settled}`
  );
}
console.log(
  `withdrawn: payer +${payerDelta} (remainder of ${escrowBefore} escrow)`
);

// 4. distribute (empty plan): merchant paid, escrow closed, Distributed(3).
const payeeAta = ataFor(st.payee, mint);
if ((await tokenBal(treasuryAta)) === null) {
  console.log("creating upstream treasury ATA (permissionless)");
  await send([
    createAssociatedTokenAccountInstruction(
      payer.publicKey,
      treasuryAta,
      treasuryOwner,
      mint
    ),
  ]);
}
const merchantBefore = (await tokenBal(payeeAta)) ?? 0n;
await send([
  distributeIx({
    programId,
    channel,
    payer: payer.publicKey,
    rentPayer: st.rentPayer,
    channelAta: channelTokenAccount,
    payerAta,
    payeeAta,
    treasuryAta,
    mint,
    eventAuthority,
  }),
]);
const chInfo = await conn.getAccountInfo(channel);
const merchantDelta = ((await tokenBal(payeeAta)) ?? 0n) - merchantBefore;
if (chInfo === null) {
  console.log(
    `distributed: channel fully deallocated; merchant +${merchantDelta} (settled ${st.settled})`
  );
} else {
  if (chInfo.data[3] !== 3)
    throw new Error(`expected Distributed(3), got ${chInfo.data[3]}`);
  console.log(
    `distributed: status=Distributed; merchant +${merchantDelta} (settled ${st.settled})`
  );
}
if (merchantDelta !== st.settled) {
  throw new Error(`merchant delta ${merchantDelta} != settled ${st.settled}`);
}

// 5. reclaim rent iff past the open-slot window; else skip openly (dust).
const slot = BigInt(await conn.getSlot());
if (chInfo !== null && slot > st.openSlot + 1500n) {
  const rentBefore = await conn.getBalance(st.rentPayer);
  await send([reclaimIx({ programId, channel, rentPayer: st.rentPayer })]);
  const rentAfter = await conn.getBalance(st.rentPayer);
  console.log(`reclaimed: rent +${rentAfter - rentBefore} lamports`);
} else if (chInfo === null) {
  console.log("reclaim: nothing left (already deallocated on distribute)");
} else {
  console.log(
    `reclaim: gated by OPEN_SLOT_WINDOW (slot ${slot} <= open ${st.openSlot} + 1500) — rent dust, permissionless later`
  );
}
console.log("RECLAIM PASS");
