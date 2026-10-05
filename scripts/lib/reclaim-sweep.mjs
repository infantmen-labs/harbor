#!/usr/bin/env node
// Sweeps every open upstream channel for one payer to full close:
// requestClose → seal (cranked past each channel's own grace) →
// withdrawPayer (remainder asserted) → distribute (merchant leg asserted)
// → reclaim rent when past open_slot + 1500. Resumable: STATE_PATH records
// each channel's stage; reruns continue. Designed for detached runs
// (nohup) over long grace windows.
// Env: RPC_URL, CHANNEL_PROGRAM, MINT, PAYER_KEYPAIR (path),
//   TREASURY_OWNER (upstream build constant), STATE_PATH,
//   CHANNELS (comma-separated, or "ALL" = scan payer's channels).
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { Connection, Keypair, PublicKey, Transaction } from "@solana/web3.js";
import { createAssociatedTokenAccountInstruction } from "@solana/spl-token";
import {
  ataFor,
  channelAta,
  distributeIx,
  reclaimIx,
  requestCloseIx,
  sealIx,
  sendWithRetry,
  withdrawPayerIx,
  ATA_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from "../../sdk/dist/src/index.js";

const programId = new PublicKey(process.env.CHANNEL_PROGRAM);
const mint = new PublicKey(process.env.MINT);
const payer = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(readFileSync(process.env.PAYER_KEYPAIR, "utf8")))
);
const treasuryOwner = new PublicKey(process.env.TREASURY_OWNER);
const statePath = process.env.STATE_PATH ?? "./reclaim-sweep-state.json";
const conn = new Connection(process.env.RPC_URL, "confirmed");

const u64 = (d, o) => d.readBigUInt64LE(o);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function send(ixs, signers = [payer]) {
  const build = () => {
    const tx = new Transaction();
    for (const ix of ixs) tx.add(ix);
    return tx;
  };
  return sendWithRetry(conn, build, signers);
}

async function tokenBal(ata) {
  const b = await conn.getTokenAccountBalance(ata).catch(() => null);
  return b === null ? null : BigInt(b.value.amount);
}

// Baselines must never silently default: a null read here means RPC trouble,
// not a zero balance — retry, then fail loud. (A poisoned zero once marked a
// fully-correct distribute as failed.)
async function mustBal(ata, label) {
  for (let i = 0; i < 5; i++) {
    const b = await tokenBal(ata);
    if (b !== null) return b;
    await sleep(2000);
  }
  throw new Error(`${label} unreadable after retries`);
}

async function chanState(ch) {
  const info = await conn.getAccountInfo(ch);
  if (info === null) return null;
  const d = Buffer.from(info.data);
  return {
    status: d[3],
    settled: u64(d, 20),
    payee: new PublicKey(d.subarray(120, 152)),
    rentPayer: new PublicKey(d.subarray(216, 248)),
    openSlot: u64(d, 248),
    grace: d.readUInt32LE(52),
    withdrawnAt: d.readBigInt64LE(44),
  };
}

async function channelList() {
  if (process.env.CHANNELS && process.env.CHANNELS !== "ALL") {
    return process.env.CHANNELS.split(",").map((s) => s.trim());
  }
  const accs = await conn.getProgramAccounts(programId, {
    filters: [{ dataSize: 256 }],
    commitment: "confirmed",
  });
  return accs
    .filter(({ account }) =>
      new PublicKey(Buffer.from(account.data).subarray(88, 120)).equals(
        payer.publicKey
      )
    )
    .map(({ pubkey }) => pubkey.toBase58());
}

function loadState() {
  if (existsSync(statePath)) return JSON.parse(readFileSync(statePath, "utf8"));
  return {};
}
function saveState(s) {
  writeFileSync(statePath, JSON.stringify(s, null, 1));
}

const [eventAuthority] = PublicKey.findProgramAddressSync(
  [Buffer.from("event_authority")],
  programId
);
const treasuryAta = ataFor(treasuryOwner, mint);
if ((await conn.getAccountInfo(treasuryAta)) === null) {
  console.log("creating treasury ATA (permissionless)");
  await send([
    createAssociatedTokenAccountInstruction(
      payer.publicKey,
      treasuryAta,
      treasuryOwner,
      mint
    ),
  ]);
}
const payerAta = ataFor(payer.publicKey, mint);
const chAtaFor = (ch) =>
  channelAta(ch, TOKEN_PROGRAM_ID, mint, ATA_PROGRAM_ID)[0];

async function closeOne(addr, st, save) {
  const ch = new PublicKey(addr);
  let s = await chanState(ch);
  if (s === null) {
    console.log(`${addr.slice(0, 8)}: gone (already deallocated) — done`);
    st.done = true;
    save();
    return;
  }
  if (s.status === 0) {
    await send([
      requestCloseIx({ programId, payer: payer.publicKey, channel: ch }),
    ]);
    console.log(`${addr.slice(0, 8)}: requestClose → Closing`);
    s = await chanState(ch);
  }
  if (s.status === 2) {
    const deadline = Date.now() + Number(s.grace) * 1000 + 1800000;
    for (;;) {
      try {
        await send([sealIx({ programId, channel: ch })]);
      } catch {
        /* pre-grace: keep cranking */
      }
      s = await chanState(ch);
      if (s === null || s.status === 1) break;
      if (Date.now() > deadline)
        throw new Error(
          `${addr.slice(0, 8)}: never sealed (grace ${s.grace}s)`
        );
      await sleep(15000);
    }
    console.log(`${addr.slice(0, 8)}: Sealed (settled=${s.settled})`);
    st.sealed = true;
    save();
    s = await chanState(ch);
  }
  if (s !== null && s.status === 1) {
    const chAta = chAtaFor(ch);
    const escrowBefore = await mustBal(chAta, "escrow");
    const payerBefore = await mustBal(payerAta, "payer");
    if (escrowBefore === null || escrowBefore === 0n)
      throw new Error(`${addr.slice(0, 8)}: empty escrow`);
    if (s.withdrawnAt !== 0n) {
      console.log(
        `${addr.slice(0, 8)}: already withdrawn — skip to distribute`
      );
    } else {
      await send([
        withdrawPayerIx({
          programId,
          payer: payer.publicKey,
          channel: ch,
          channelAta: chAta,
          payerAta,
          mint,
        }),
      ]);
      const delta = (await mustBal(payerAta, "payer-after")) - payerBefore;
      if (delta !== escrowBefore - s.settled)
        throw new Error(
          `${addr.slice(0, 8)}: payer delta ${delta} != ${escrowBefore} - ${
            s.settled
          }`
        );
      console.log(`${addr.slice(0, 8)}: withdrawPayer +${delta}`);
    }
    const payeeAta = ataFor(s.payee, mint);
    if ((await conn.getAccountInfo(payeeAta)) === null) {
      // Ancient channels may name payees that never got an ATA for this
      // mint; distribute validates the canonical ATA, so create it
      // (permissionless, payer funds rent).
      console.log(`${addr.slice(0, 8)}: creating payee ATA (permissionless)`);
      await send([
        createAssociatedTokenAccountInstruction(
          payer.publicKey,
          payeeAta,
          s.payee,
          mint
        ),
      ]);
    }
    const mBefore = await mustBal(payeeAta, "payee");
    await send([
      distributeIx({
        programId,
        channel: ch,
        payer: payer.publicKey,
        rentPayer: s.rentPayer,
        channelAta: chAta,
        payerAta,
        payeeAta,
        treasuryAta,
        mint,
        eventAuthority,
      }),
    ]);
    const mDelta = (await mustBal(payeeAta, "payee-after")) - mBefore;
    if (mDelta !== s.settled)
      throw new Error(
        `${addr.slice(0, 8)}: merchant delta ${mDelta} != settled ${s.settled}`
      );
    console.log(`${addr.slice(0, 8)}: distribute merchant +${mDelta}`);
    st.distributed = true;
    save();
    s = await chanState(ch);
  }
  const slot = BigInt(await conn.getSlot());
  const cur = s === null ? null : await chanState(ch);
  if (cur === null) {
    console.log(`${addr.slice(0, 8)}: fully deallocated on distribute — done`);
    st.done = true;
    save();
    return;
  }
  if (cur.status === 3 && slot > cur.openSlot + 1500n) {
    const rb = await conn.getBalance(cur.rentPayer);
    await send([
      reclaimIx({ programId, channel: ch, rentPayer: cur.rentPayer }),
    ]);
    const ra = await conn.getBalance(cur.rentPayer);
    console.log(`${addr.slice(0, 8)}: reclaim rent +${ra - rb}`);
  } else {
    console.log(
      `${addr.slice(
        0,
        8
      )}: Distributed but inside open-slot window — rent dust, rerun later`
    );
  }
  st.done = true;
  save();
}

async function requestCloseOne(addr, st, save) {
  const ch = new PublicKey(addr);
  const s = await chanState(ch);
  if (s === null || s.status !== 0) {
    console.log(
      `${addr.slice(0, 8)}: not Open (gone or status ${s?.status}) — skip close`
    );
    return;
  }
  await send([
    requestCloseIx({ programId, payer: payer.publicKey, channel: ch }),
  ]);
  console.log(`${addr.slice(0, 8)}: requestClose → Closing`);
  st.closed = true;
  save();
}

const addrs = await channelList();
console.log(`sweeping ${addrs.length} channels`);
const state = loadState();
let failed = 0;
async function run(addr, fn) {
  state[addr] ??= {};
  try {
    await fn(addr, state[addr], () => saveState(state));
  } catch (e) {
    failed++;
    console.error(
      `${addr.slice(0, 8)} FAILED: ${
        e instanceof Error ? e.message : String(e)
      }`
    );
    state[addr].error = e instanceof Error ? e.message : String(e);
    saveState(state);
  }
}
// Phase 1: start every grace clock now so all windows elapse together.
console.log("phase 1: requestClose all Open channels");
for (const addr of addrs) {
  if (state[addr]?.closed || state[addr]?.done) {
    console.log(`${addr.slice(0, 8)}: already closed/done (state file) — skip`);
    continue;
  }
  await run(addr, requestCloseOne);
}
// Phase 2: seal → withdraw → distribute → reclaim per channel.
console.log("phase 2: seal/distribute/reclaim per channel");
for (const addr of addrs) {
  if (state[addr]?.done) {
    console.log(`${addr.slice(0, 8)}: already done (state file) — skip`);
    continue;
  }
  await run(addr, closeOne);
}
console.log(failed === 0 ? "SWEEP PASS" : `SWEEP DONE WITH ${failed} FAILURES`);
process.exit(failed === 0 ? 0 : 1);
