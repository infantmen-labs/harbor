"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadKeeperConfig = loadKeeperConfig;
const web3_js_1 = require("@solana/web3.js");
const node_fs_1 = require("node:fs");
const harbor_sdk_1 = require("harbor-sdk");
function loadKeeperConfig(env = process.env) {
    var _a, _b, _c, _d, _e;
    const kpPath = env["OPERATOR_KEYPAIR"];
    if (kpPath === undefined)
        throw new Error("OPERATOR_KEYPAIR required (path to keypair JSON)");
    const raw = JSON.parse((0, node_fs_1.readFileSync)(kpPath, "utf8"));
    return {
        rpcUrl: (_a = env["RPC_URL"]) !== null && _a !== void 0 ? _a : "https://api.devnet.solana.com",
        programId: new web3_js_1.PublicKey((_b = env["HARBOR_PROGRAM_ID"]) !== null && _b !== void 0 ? _b : harbor_sdk_1.HARBOR_PROGRAM_ID.toBase58()),
        operator: web3_js_1.Keypair.fromSecretKey(Uint8Array.from(raw)),
        pollMs: Number((_c = env["POLL_MS"]) !== null && _c !== void 0 ? _c : 30000),
        live: env["MODE"] === "live",
        logPath: (_d = env["LOG_PATH"]) !== null && _d !== void 0 ? _d : "keeper.log.jsonl",
        runOnce: env["RUN_ONCE"] === "1",
        channelProgramAllowlist: ((_e = env["UPSTREAM_PROGRAM_ALLOWLIST"]) !== null && _e !== void 0 ? _e : "CHNLxYvVA28MJP9PrFuDXccuoGXAx7jBacfLEkahyGsX").split(","),
    };
}
