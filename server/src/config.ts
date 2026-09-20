import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { readFileSync } from "node:fs";
import { HARBOR_PROGRAM_ID } from "harbor-sdk";

export interface Config {
  port: number;
  rpcUrl: string;
  merchant: Keypair;
  mint: PublicKey;
  programId: PublicKey;
  pricePerToken: bigint;
  skipChain: boolean;
}

function loadKeypair(path: string): Keypair {
  const raw = JSON.parse(readFileSync(path, "utf8"));
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const kpPath = env["MERCHANT_KEYPAIR"];
  if (!kpPath && env["SKIP_CHAIN"] !== "1") {
    throw new Error("MERCHANT_KEYPAIR env required (path to keypair JSON)");
  }
  const mint = env["MINT"];
  if (!mint && env["SKIP_CHAIN"] !== "1") {
    throw new Error("MINT env required");
  }
  return {
    port: Number(env["PORT"] ?? 3000),
    rpcUrl: env["RPC_URL"] ?? "https://api.devnet.solana.com",
    merchant: kpPath
      ? loadKeypair(kpPath)
      : Keypair.generate(),
    mint: mint ? new PublicKey(mint) : Keypair.generate().publicKey,
    programId: new PublicKey(env["HARBOR_PROGRAM_ID"] ?? HARBOR_PROGRAM_ID.toBase58()),
    pricePerToken: BigInt(env["PRICE_PER_TOKEN"] ?? 10),
    skipChain: env["SKIP_CHAIN"] === "1",
  };
}

export function connectionFor(cfg: Config): Connection {
  return new Connection(cfg.rpcUrl, "confirmed");
}
