"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadConfig = loadConfig;
exports.connectionFor = connectionFor;
const web3_js_1 = require("@solana/web3.js");
const node_fs_1 = require("node:fs");
const harbor_sdk_1 = require("harbor-sdk");
function loadKeypair(path) {
    const raw = JSON.parse((0, node_fs_1.readFileSync)(path, "utf8"));
    return web3_js_1.Keypair.fromSecretKey(Uint8Array.from(raw));
}
function loadConfig(env = process.env) {
    var _a, _b, _c, _d;
    const kpPath = env["MERCHANT_KEYPAIR"];
    if (!kpPath && env["SKIP_CHAIN"] !== "1") {
        throw new Error("MERCHANT_KEYPAIR env required (path to keypair JSON)");
    }
    const mint = env["MINT"];
    if (!mint && env["SKIP_CHAIN"] !== "1") {
        throw new Error("MINT env required");
    }
    return {
        port: Number((_a = env["PORT"]) !== null && _a !== void 0 ? _a : 3000),
        rpcUrl: (_b = env["RPC_URL"]) !== null && _b !== void 0 ? _b : "https://api.devnet.solana.com",
        merchant: kpPath
            ? loadKeypair(kpPath)
            : web3_js_1.Keypair.generate(),
        mint: mint ? new web3_js_1.PublicKey(mint) : web3_js_1.Keypair.generate().publicKey,
        programId: new web3_js_1.PublicKey((_c = env["HARBOR_PROGRAM_ID"]) !== null && _c !== void 0 ? _c : harbor_sdk_1.HARBOR_PROGRAM_ID.toBase58()),
        pricePerToken: BigInt((_d = env["PRICE_PER_TOKEN"]) !== null && _d !== void 0 ? _d : 10),
        skipChain: env["SKIP_CHAIN"] === "1",
    };
}
function connectionFor(cfg) {
    return new web3_js_1.Connection(cfg.rpcUrl, "confirmed");
}
