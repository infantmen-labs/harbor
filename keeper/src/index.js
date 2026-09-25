"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Harbor keeper: watches open disputes and resolves the adjudicated ones.
 * Delivery proof always wins; past-deadline absence slashes.
 * Dry-run by default; MODE=live sends transactions.
 */
const web3_js_1 = require("@solana/web3.js");
const harbor_sdk_1 = require("harbor-sdk");
const config_1 = require("./config");
const watch_1 = require("./watch");
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        const cfg = (0, config_1.loadKeeperConfig)();
        const conn = new web3_js_1.Connection(cfg.rpcUrl, "confirmed");
        const log = new harbor_sdk_1.JsonlLogger(cfg.logPath);
        console.log(`keeper ${cfg.live ? "LIVE" : "dry-run"} on ${cfg.rpcUrl} every ${cfg.pollMs}ms`);
        for (;;) {
            try {
                const r = yield (0, watch_1.pass)(cfg, conn, log);
                console.log(`pass: resolved=${r.resolved} pending=${r.pending}`);
            }
            catch (e) {
                console.error(`pass failed: ${e instanceof Error ? e.message : e}`);
            }
            if (cfg.runOnce)
                break;
            yield sleep(cfg.pollMs);
        }
    });
}
main().catch((e) => {
    console.error(e);
    process.exit(1);
});
