/** Creates a devnet test mint (or uses MINT) and funds merchant + agent ATAs. */
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";
import { readFileSync } from "node:fs";

function loadKeypair(path: string): Keypair {
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(path, "utf8"))));
}

async function main(): Promise<void> {
  const connection = new Connection(
    process.env["RPC_URL"] ?? "https://api.devnet.solana.com",
    "confirmed",
  );
  const payer = loadKeypair(
    process.env["PAYER_KEYPAIR"] ?? `${process.env["HOME"]}/.config/solana/id.json`,
  );
  const merchant = new PublicKey(process.env["MERCHANT_PUBKEY"] ?? payer.publicKey.toBase58());
  const agent = new PublicKey(process.env["AGENT_PUBKEY"] ?? "");
  const decimals = Number(process.env["MINT_DECIMALS"] ?? 6);
  const amount = BigInt(process.env["MINT_AMOUNT"] ?? 1_000_000_000);

  let mint: PublicKey;
  if (process.env["MINT"] !== undefined && process.env["MINT"] !== "") {
    mint = new PublicKey(process.env["MINT"] as string);
    console.log(`using mint ${mint.toBase58()}`);
  } else {
    mint = await createMint(connection, payer, payer.publicKey, null, decimals);
    console.log(`MINT=${mint.toBase58()}`);
  }

  for (const owner of [merchant, agent]) {
    const ata = await getOrCreateAssociatedTokenAccount(connection, payer, mint, owner);
    const sig = await mintTo(connection, payer, mint, ata.address, payer, amount);
    console.log(`funded ${owner.toBase58()} ata=${ata.address.toBase58()} sig=${sig}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
