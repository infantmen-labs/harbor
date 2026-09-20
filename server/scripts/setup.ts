/** One-time merchant setup: register bond + post collateral (binding happens per session). */
import { Connection, Keypair, PublicKey, sendAndConfirmTransaction, Transaction } from "@solana/web3.js";
import { bondPda, postBondIx, registerMerchantIx, ATA_PROGRAM_ID, TOKEN_PROGRAM_ID } from "harbor-sdk";
import { loadConfig, connectionFor } from "../src/config";

async function main(): Promise<void> {
  const cfg = loadConfig();
  const connection: Connection = connectionFor(cfg);
  const slaBps = Number(process.env["SLA_BPS"] ?? 50);
  const challengeSlots = BigInt(process.env["CHALLENGE_SLOTS"] ?? 150);
  const amount = BigInt(process.env["BOND_AMOUNT"] ?? 500_000);
  const [bond] = bondPda(cfg.merchant.publicKey, cfg.mint);

  const existing = await connection.getAccountInfo(bond);
  if (existing === null) {
    const tx = new Transaction().add(
      registerMerchantIx(cfg.programId, cfg.merchant.publicKey, bond, cfg.mint, slaBps, challengeSlots),
    );
    await sendAndConfirmTransaction(connection, tx, [cfg.merchant]);
    console.log(`registered bond ${bond.toBase58()}`);
  } else {
    console.log(`bond exists ${bond.toBase58()}`);
  }

  const merchantAta = await connection.getParsedTokenAccountsByOwner(cfg.merchant.publicKey, {
    mint: cfg.mint,
  });
  if (merchantAta.value.length === 0) throw new Error("merchant has no ATA for mint");
  const vault = PublicKey.findProgramAddressSync(
    [bond.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), cfg.mint.toBuffer()],
    ATA_PROGRAM_ID,
  )[0];
  const tx = new Transaction().add(
    postBondIx(
      cfg.programId,
      cfg.merchant.publicKey,
      bond,
      cfg.mint,
      merchantAta.value[0].pubkey,
      vault,
      amount,
    ),
  );
  await sendAndConfirmTransaction(connection, tx, [cfg.merchant]);
  console.log(`posted ${amount} to ${vault.toBase58()}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
