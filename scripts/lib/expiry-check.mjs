#!/usr/bin/env node
// Asserts a served receipt carries a near-term expiry (server ran with
// RECEIPT_EXPIRY_SLOTS). Env: RPC_URL, SERVER_URL, CHANNEL, NONCE.
// Exits 1 unless 0 < expirySlot - slot <= MAX_SKEW (25).
import { Connection, PublicKey } from "@solana/web3.js";

const server = process.env.SERVER_URL;
const channel = process.env.CHANNEL;
const nonce = process.env.NONCE ?? "1";
const r = await fetch(`${server}/receipt/${channel}/${nonce}`);
if (!r.ok) throw new Error(`no receipt for nonce ${nonce}`);
const receipt = await r.json();
const conn = new Connection(process.env.RPC_URL, "confirmed");
const slot = await conn.getSlot();
const skew = BigInt(receipt.expirySlot) - BigInt(slot);
console.log(
  `receipt nonce ${nonce}: expirySlot=${receipt.expirySlot} slot=${slot} skew=${skew}`
);
if (skew <= 0n || skew > 25n) {
  throw new Error(`short expiry not honored (skew ${skew})`);
}
console.log("EXPIRY-A PASS: receipt carries near-term expiry");
