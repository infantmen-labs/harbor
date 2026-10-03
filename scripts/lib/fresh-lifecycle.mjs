#!/usr/bin/env node
// Fresh-merchant full lifecycle on throwaway keys: register → post →
// withdraw-all (past the timelock) → refund_unused closes bond + vault.
// Proves the merchant-side paths live that buyers never touch.
// Env: RPC_URL, MINT, FRESH_KEYPAIR, MINT_AUTH_KEYPAIR, BOND_AMOUNT.
import { readFileSync } from "node:fs";
import { Connection, Keypair, PublicKey, Transaction } from "@solana/web3.js";
import {
  createAssociatedTokenAccountInstruction,
  createMintToInstruction,
} from "@solana/spl-token";
import {
  TOKEN_PROGRAM_ID,
  ataFor,
  bondPda,
  postBondIx,
  refundUnusedIx,
  registerMerchantIx,
  sendWithRetry,
  vaultAta,
  withdrawBondIx,
} from "../../sdk/dist/src/index.js";

const HARBOR = new PublicKey("BuRyKLqCsTLcyLVFEjxTjmF4DryCT3LmVDjwqhduvB4H");
const conn = new Connection(process.env.RPC_URL, "confirmed");
const load = (p) =>
  Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(p, "utf8"))));
const fresh = load(process.env.FRESH_KEYPAIR);
const mintAuth = load(process.env.MINT_AUTH_KEYPAIR);
const mint = new PublicKey(process.env.MINT);
const amount = BigInt(process.env.BOND_AMOUNT);

async function send(ixs, signers) {
  const build = () => {
    const tx = new Transaction();
    for (const ix of ixs) tx.add(ix);
    return tx;
  };
  return sendWithRetry(conn, build, signers);
}

const [bond] = bondPda(fresh.publicKey, mint);
const merchantAta = ataFor(fresh.publicKey, mint);
const vault = vaultAta(bond, mint);

// Fund + create the fresh ATA, mint the bond stake.
await send(
  [
    createAssociatedTokenAccountInstruction(
      fresh.publicKey,
      merchantAta,
      fresh.publicKey,
      mint
    ),
    createMintToInstruction(mint, merchantAta, mintAuth.publicKey, amount),
  ],
  [fresh, mintAuth]
);
console.log(`fresh merchant funded: ${amount}`);

// register + post.
await send(
  [registerMerchantIx(HARBOR, fresh.publicKey, bond, mint, 50, 150n)],
  [fresh]
);
await send(
  [postBondIx(HARBOR, fresh.publicKey, bond, mint, merchantAta, vault, amount)],
  [fresh]
);
console.log("registered + posted");

// Timelocked steps (150 slots each; every state change re-arms the clock,
// so withdraw AND refund each poll past their own window).
async function pastTimelock(label, ixs) {
  const t0 = Date.now();
  for (;;) {
    try {
      await send(ixs, [fresh]);
      return;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/TimelockNotPassed/i.test(msg) && Date.now() - t0 < 300000) {
        await new Promise((r) => setTimeout(r, 10000));
        continue;
      }
      throw new Error(`${label} failed non-timelock: ${msg}`);
    }
  }
}
await pastTimelock("withdraw", [
  withdrawBondIx(
    HARBOR,
    fresh.publicKey,
    bond,
    mint,
    merchantAta,
    vault,
    amount
  ),
]);
console.log("withdrawn in full");

// refund_unused closes the empty bond + vault.
await pastTimelock("refund_unused", [
  refundUnusedIx(HARBOR, fresh.publicKey, bond, mint, vault, merchantAta),
]);
const closed = await conn.getAccountInfo(bond);
if (closed !== null) throw new Error("bond not closed after refund_unused");
console.log(
  "LIFECYCLE PASS: register → post → withdraw → refund_unused closed the bond"
);
