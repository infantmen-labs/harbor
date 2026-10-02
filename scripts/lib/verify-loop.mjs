#!/usr/bin/env node
// Verifies loop settlement math to the unit. Exits 0 LOOP PASS, 1 LOOP FAIL.
import { Connection, PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddress } from "@solana/spl-token";
import { treasuryPda, decodeBond } from "../../sdk/dist/src/index.js";

const c = new Connection(process.env.RPC_URL, "confirmed");
const info = await c.getAccountInfo(new PublicKey(process.env.BOND));
if (info === null) throw new Error("bond account missing");
const b = decodeBond(info.data);
const claim = BigInt(process.env.CLAIM);
const fee = (claim * 500n) / 10000n;
const penalty = claim * 2n;
const wantBond = BigInt(process.env.BOND_AMOUNT) - penalty;
const okBond =
  b.amount === wantBond && b.reserved === 0n && b.openDisputes === 0n;
const mint = new PublicKey(process.env.MINT);
const [treasury] = treasuryPda(mint);
const tBal = BigInt(
  (
    await c.getTokenAccountBalance(
      await getAssociatedTokenAddress(mint, treasury, true)
    )
  ).value.amount
);
const okTreasury = tBal === fee + penalty;
console.log(
  `bond: ${b.amount} (want ${wantBond}) disputes:${b.openDisputes} reserved:${b.reserved}`
);
console.log(`treasury: ${tBal} (want ${fee + penalty})`);
console.log(okBond && okTreasury ? "LOOP PASS" : "LOOP FAIL");
process.exit(okBond && okTreasury ? 0 : 1);
