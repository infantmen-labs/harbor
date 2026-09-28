import { Keypair, PublicKey } from "@solana/web3.js";
import { readFileSync } from "node:fs";
import { HARBOR_PROGRAM_ID } from "@infantmen-labs/harbor-sdk";

export interface KeeperConfig {
  rpcUrl: string;
  programId: PublicKey;
  operator: Keypair;
  pollMs: number;
  live: boolean;
  logPath: string;
  runOnce: boolean;
  channelProgramAllowlist: string[];
}

export function loadKeeperConfig(env: NodeJS.ProcessEnv = process.env): KeeperConfig {
  const kpPath = env["OPERATOR_KEYPAIR"];
  if (kpPath === undefined) throw new Error("OPERATOR_KEYPAIR required (path to keypair JSON)");
  const raw = JSON.parse(readFileSync(kpPath, "utf8"));
  return {
    rpcUrl: env["RPC_URL"] ?? "https://api.devnet.solana.com",
    programId: new PublicKey(env["HARBOR_PROGRAM_ID"] ?? HARBOR_PROGRAM_ID.toBase58()),
    operator: Keypair.fromSecretKey(Uint8Array.from(raw)),
    pollMs: Number(env["POLL_MS"] ?? 30_000),
    live: env["MODE"] === "live",
    logPath: env["LOG_PATH"] ?? "keeper.log.jsonl",
    runOnce: env["RUN_ONCE"] === "1",
    channelProgramAllowlist: (env["UPSTREAM_PROGRAM_ALLOWLIST"] ??
      "CHNLxYvVA28MJP9PrFuDXccuoGXAx7jBacfLEkahyGsX").split(","),
  };
}
