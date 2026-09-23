/** Watchtower opens a dispute on behalf of a claimant after a failed delivery. */
import { Connection, Keypair, PublicKey, sendAndConfirmTransaction, Transaction } from "@solana/web3.js";
import { disputePda, openDisputeIx } from "harbor-sdk";
import { readFileSync } from "node:fs";

function loadKeypair(path: string): Keypair {
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(path, "utf8"))));
}

async function main(): Promise<void> {
  const connection = new Connection(process.env["RPC_URL"] ?? "", "confirmed");
  const programId = new PublicKey(process.env["HARBOR_PROGRAM_ID"] ?? "");
  const claimant = loadKeypair(process.env["CLAIMANT_KEYPAIR"] ?? "");
  const bond = new PublicKey(process.env["BOND"] ?? "");
  const binding = new PublicKey(process.env["BINDING"] ?? "");
  const nonce = BigInt(process.env["NONCE"] ?? "1");
  const reason = Number(process.env["REASON"] ?? 1);
  const [dispute] = disputePda(binding, nonce);
  const tx = new Transaction().add(
    openDisputeIx(programId, claimant.publicKey, bond, binding, dispute, nonce, reason),
  );
  const sig = await sendAndConfirmTransaction(connection, tx, [claimant]);
  console.log(`dispute=${dispute.toBase58()} sig=${sig}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
