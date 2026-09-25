"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Store = void 0;
exports.meterTokens = meterTokens;
exports.sha256Hex = sha256Hex;
const node_crypto_1 = require("node:crypto");
class Store {
    constructor() {
        this.sessions = new Map();
        this.killed = false;
    }
    get(channel) {
        return this.sessions.get(channel);
    }
    set(s) {
        this.sessions.set(s.channel.toBase58(), s);
    }
}
exports.Store = Store;
/** Deterministic fake-LLM workload: token count derives from the input hash. */
function meterTokens(input) {
    const h = (0, node_crypto_1.createHash)("sha256").update(input, "utf8").digest();
    const tokens = BigInt(50 + (h[0] % 200));
    const output = `completion:${h.subarray(0, 8).toString("hex")}:${input.length}`;
    return { output, tokens };
}
function sha256Hex(data) {
    return (0, node_crypto_1.createHash)("sha256").update(data).digest("hex");
}
