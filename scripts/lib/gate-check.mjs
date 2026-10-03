#!/usr/bin/env node
// Disputed-bond buying pressure test: reads BOND right after a dispute
// opens and asserts the exact lock (reserved == 3 * CLAIM, openDisputes
// == 1). Prints free collateral — any buyer policy with MIN_BOND_FREE
// above it refuses here, opening no channel and spending nothing.
// Exits 1 on any mismatch.
import { Connection, PublicKey } from "@solana/web3.js";
import { decodeBond } from "../../sdk/dist/src/index.js";

const c = new Connection(process.env.RPC_URL, "confirmed");
const info = await c.getAccountInfo(new PublicKey(process.env.BOND));
if (info === null) throw new Error("bond account missing");
const b = decodeBond(info.data);
const claim = BigInt(process.env.CLAIM);
const free = b.amount - b.reserved;
console.log(
  `disputed bond: amount=${b.amount} reserved=${b.reserved} free=${free} openDisputes=${b.openDisputes}`
);
if (b.reserved !== 3n * claim) {
  throw new Error(`reserved ${b.reserved} != 3 * claim ${claim}`);
}
if (b.openDisputes !== 1n) {
  throw new Error(`openDisputes ${b.openDisputes} != 1`);
}
console.log(
  `gate holds: a buyer demanding MIN_BOND_FREE > ${free} refuses here`
);
