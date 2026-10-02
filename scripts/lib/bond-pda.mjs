#!/usr/bin/env node
// Prints the Harbor bond PDA for (MERCHANT_PUBKEY, MINT). Exits 1 on empty.
import { PublicKey } from "@solana/web3.js";
import { bondPda } from "../../sdk/dist/src/index.js";

const bond = bondPda(
  new PublicKey(process.env.MERCHANT_PUBKEY),
  new PublicKey(process.env.MINT)
)[0].toBase58();
if (!bond) throw new Error("bond PDA derivation printed nothing");
console.log(bond);
