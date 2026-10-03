#!/usr/bin/env node
// Waits until dispute (BINDING, NONCE) matures past its deadline slot.
// NONCE defaults to 1 (the loop's fail path always disputes nonce 1;
// pass another for settled channels with later failed nonces).
// Exits 0 on matured, 1 on 300s timeout — never prints a false 'matured'.
import { Connection, PublicKey } from "@solana/web3.js";
import { disputePda, decodeDispute } from "../../sdk/dist/src/index.js";

const c = new Connection(process.env.RPC_URL, "confirmed");
const [d] = disputePda(
  new PublicKey(process.env.BINDING),
  BigInt(process.env.NONCE ?? "1")
);
const t0 = Date.now();
let matured = false;
while (Date.now() - t0 < 300000) {
  const info = await c.getAccountInfo(d).catch(() => null);
  const slot = await c.getSlot().catch(() => 0);
  if (info && slot > Number(decodeDispute(info.data).deadlineSlot)) {
    matured = true;
    break;
  }
  await new Promise((r) => setTimeout(r, 5000));
}
if (!matured) throw new Error("dispute did not mature within 300s");
console.log("matured");
