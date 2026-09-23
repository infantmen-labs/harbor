import { loadConfig } from "./config";
import { createApp } from "./index";
import { Store } from "./store";

const cfg = loadConfig();
const server = createApp(cfg, new Store());
server.listen(cfg.port, () => {
  console.log(`harbor-server on :${cfg.port} merchant=${cfg.merchant.publicKey.toBase58()}`);
});
