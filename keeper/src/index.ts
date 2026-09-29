/**
 * Harbor keeper: watches open Harbor disputes and resolves matured ones
 * as timeout refunds. There is no delivered path: receipts never acquit.
 * Dry-run by default; MODE=live sends transactions.
 */
import { Connection } from "@solana/web3.js";
import { JsonlLogger } from "harbor-log";
import { loadKeeperConfig } from "./config";
import { pass } from "./watch";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  const cfg = loadKeeperConfig();
  const conn = new Connection(cfg.rpcUrl, "confirmed");
  const log = new JsonlLogger(cfg.logPath);
  console.log(
    `keeper ${cfg.live ? "LIVE" : "dry-run"} on ${cfg.rpcUrl} every ${cfg.pollMs}ms`,
  );
  for (;;) {
    try {
      const r = await pass(cfg, conn, log);
      console.log(`pass: resolved=${r.resolved} pending=${r.pending}`);
    } catch (e) {
      console.error(`pass failed: ${e instanceof Error ? e.message : e}`);
    }
    if (cfg.runOnce) break;
    await sleep(cfg.pollMs);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
