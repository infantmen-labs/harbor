#!/usr/bin/env node
// Proves the onchain Expired gate: submits a merchant-signed receipt with
// expiry_slot = 1 (long past) on a fresh nonce and expects failure naming
// Expired. Exits 1 if the submit SUCCEEDS (gate broken) or fails otherwise.
// Env: RPC_URL, BOND, BINDING, MINT, MERCHANT_KEYPAIR.
import { readFileSync } from "node:fs";
import { Connection, Keypair, PublicKey, Transaction } from "@solana/web3.js";
import {
  buildEd25519Ix,
  receiptMessageBytes,
  receiptPda,
  signEd25519,
  submitReceiptIx,
} from "../../sdk/dist/src/index.js";

const HARBOR = new PublicKey("BuRyKLqCsTLcyLVFEjxTjmF4DryCT3LmVDjwqhduvB4H");
const conn = new Connection(process.env.RPC_URL, "confirmed");
const merchant = Keypair.fromSecretKey(
  Uint8Array.from(
    JSON.parse(readFileSync(process.env.MERCHANT_KEYPAIR, "utf8"))
  )
);
const bond = new PublicKey(process.env.BOND);
const binding = new PublicKey(process.env.BINDING);
const nonce = 999n;

const msg = receiptMessageBytes({
  merchant: merchant.publicKey,
  binding,
  cumulativeSpend: 1n,
  meterHash: new Uint8Array(32),
  outputHash: new Uint8Array(32),
  status: 0,
  nonce,
  expirySlot: 1n,
  signer: merchant.publicKey,
});
const signature = signEd25519(merchant.secretKey, msg);
const [receipt] = receiptPda(binding, nonce);
const tx = new Transaction().add(
  buildEd25519Ix(merchant.publicKey, signature, msg),
  submitReceiptIx(HARBOR, merchant.publicKey, bond, binding, receipt, {
    cumulativeSpend: 1n,
    meterHash: new Uint8Array(32),
    outputHash: new Uint8Array(32),
    status: 0,
    nonce,
    expirySlot: 1n,
    signer: merchant.publicKey,
  })
);
try {
  await conn.sendTransaction(tx, [merchant], { skipPreflight: false });
  throw new Error("SUBMIT SUCCEEDED WITH expiry_slot=1 — Expired gate broken");
} catch (e) {
  const msg = e instanceof Error ? e.message : String(e);
  if (/Expired/i.test(msg)) {
    console.log("EXPIRY-B PASS: expired submit rejected with Expired");
  } else {
    throw new Error(`unexpected submit failure (want Expired): ${msg}`);
  }
}
