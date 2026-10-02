// Loads .env from CWD when present; real environment always wins.
import "dotenv/config";
import { loadConfig } from "./config";
import { createApp } from "./index";
import { Store } from "./store";

const cfg = loadConfig();
const storePath = process.env["STORE_PATH"] ?? null;
const store =
  storePath !== null
    ? Store.load(storePath) ?? new Store(storePath)
    : new Store();
if (storePath !== null) {
  console.log(
    `store snapshot: ${storePath} (${store.sessions.size} sessions restored)`
  );
} else {
  console.warn(
    "WARN: no STORE_PATH — sessions live in memory only (local rehearsal)"
  );
}
if (cfg.killToken === null) {
  console.warn("WARN: no KILL_TOKEN — kill switch is OPEN (local rehearsal)");
}
const server = createApp(cfg, store);
server.listen(cfg.port, () => {
  console.log(
    `harbor-server on :${
      cfg.port
    } merchant=${cfg.merchant.publicKey.toBase58()}`
  );
});
