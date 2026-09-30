import { loadConfig } from "./config";
import { createApp } from "./index";
import { Store } from "./store";

const cfg = loadConfig();
const storePath = process.env["STORE_PATH"] ?? null;
const store =
  storePath !== null
    ? (Store.load(storePath) ?? new Store(storePath))
    : new Store();
if (storePath !== null) {
  console.log(`store snapshot: ${storePath} (${store.sessions.size} sessions restored)`);
}
const server = createApp(cfg, store);
server.listen(cfg.port, () => {
  console.log(`harbor-server on :${cfg.port} merchant=${cfg.merchant.publicKey.toBase58()}`);
});
