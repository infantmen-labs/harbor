#!/usr/bin/env node
// Prints the Harbor binding PDA for FAIL_CHANNEL. Exits 1 on empty.
import { PublicKey } from "@solana/web3.js";

const prog = new PublicKey("BuRyKLqCsTLcyLVFEjxTjmF4DryCT3LmVDjwqhduvB4H");
const ch = new PublicKey(process.env.FAIL_CHANNEL);
const binding = PublicKey.findProgramAddressSync(
  [Buffer.from("binding"), ch.toBuffer()],
  prog
)[0].toBase58();
if (!binding) throw new Error("binding PDA derivation printed nothing");
console.log(binding);
