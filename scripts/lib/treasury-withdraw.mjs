#!/usr/bin/env node
// Merchant withdraws AMOUNT base units from the per-mint backstop treasury
// (upgrade-authority-signed) and asserts the destination delta.
// Env: RPC_URL, MINT, AUTHORITY_KEYPAIR, AMOUNT.
import { readFileSync } from "node:fs";
import { Connection, Keypair, PublicKey, Transaction } from "@solana/web3.js";
import {
  ataFor,
  sendWithRetry,
  treasuryPda,
  withdrawTreasuryIx,
} from "../../sdk/dist/src/index.js";

const BPF_LOADER_UPGRADEABLE = new PublicKey(
  "BPFLoaderUpgradeab1e11111111111111111111111"
);
const HARBOR = new PublicKey("BuRyKLqCsTLcyLVFEjxTjmF4DryCT3LmVDjwqhduvB4H");
const conn = new Connection(process.env.RPC_URL, "confirmed");
const authority = Keypair.fromSecretKey(
  Uint8Array.from(
    JSON.parse(readFileSync(process.env.AUTHORITY_KEYPAIR, "utf8"))
  )
);
const mint = new PublicKey(process.env.MINT);
const amount = BigInt(process.env.AMOUNT);

const [treasury] = treasuryPda(mint);
const treasuryAta = ataFor(treasury, mint);
const destinationAta = ataFor(authority.publicKey, mint);
const [programdata] = PublicKey.findProgramAddressSync(
  [HARBOR.toBuffer()],
  BPF_LOADER_UPGRADEABLE
);

async function bal(ata) {
  const b = await conn.getTokenAccountBalance(ata).catch(() => null);
  return b === null ? 0n : BigInt(b.value.amount);
}
const before = await bal(destinationAta);
const build = () =>
  new Transaction().add(
    withdrawTreasuryIx(
      HARBOR,
      authority.publicKey,
      programdata,
      treasury,
      treasuryAta,
      destinationAta,
      mint,
      amount
    )
  );
await sendWithRetry(conn, build, [authority]);
const delta = (await bal(destinationAta)) - before;
if (delta !== amount) {
  throw new Error(`treasury withdraw delta ${delta} != ${amount}`);
}
console.log(`TREASURY PASS: authority +${delta}`);
