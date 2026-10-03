#!/usr/bin/env node
// Halts a binding (merchant-signed, one-way) and asserts halted == true.
// One-way by design (no unhalt): run only on throwaway bindings after the
// main loop verifies. Env: RPC_URL, BINDING, MERCHANT_KEYPAIR.
import { readFileSync } from "node:fs";
import { Connection, Keypair, PublicKey, Transaction } from "@solana/web3.js";
import {
  decodeBinding,
  haltBindingIx,
  sendWithRetry,
} from "../../sdk/dist/src/index.js";

const HARBOR = new PublicKey("BuRyKLqCsTLcyLVFEjxTjmF4DryCT3LmVDjwqhduvB4H");
const conn = new Connection(process.env.RPC_URL, "confirmed");
const merchant = Keypair.fromSecretKey(
  Uint8Array.from(
    JSON.parse(readFileSync(process.env.MERCHANT_KEYPAIR, "utf8"))
  )
);
const binding = new PublicKey(process.env.BINDING);

const build = () =>
  new Transaction().add(haltBindingIx(HARBOR, merchant.publicKey, binding));
await sendWithRetry(conn, build, [merchant]);
const info = await conn.getAccountInfo(binding);
const halted = decodeBinding(info.data).halted;
if (!halted) throw new Error("binding not halted after halt_binding");
console.log("HALT PASS: binding halted (one-way, exits stay open)");
