"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const config_1 = require("./config");
const index_1 = require("./index");
const store_1 = require("./store");
const cfg = (0, config_1.loadConfig)();
const server = (0, index_1.createApp)(cfg, new store_1.Store());
server.listen(cfg.port, () => {
    console.log(`harbor-server on :${cfg.port} merchant=${cfg.merchant.publicKey.toBase58()}`);
});
