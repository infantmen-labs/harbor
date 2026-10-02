/**
 * Harbor keeper: watches open Harbor disputes and resolves matured ones
 * as timeout refunds. There is no delivered path: receipts never acquit.
 * Dry-run by default; MODE=live sends transactions.
 */
// Loads .env from CWD when present; real environment always wins.
import "dotenv/config";
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
  // Never log the RPC URL: hosted keys live in its query string and
  // journals are lower-trust than the secrets file.
  const rpcOrigin = (() => {
    try {
      const u = new URL(cfg.rpcUrl);
      u.search = "";
      return u.origin + u.pathname;
    } catch {
      return "unparseable-rpc-url";
    }
  })();
  console.log(
    `keeper ${cfg.live ? "LIVE" : "dry-run"} on ${rpcOrigin} every ${
      cfg.pollMs
    }ms`
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
