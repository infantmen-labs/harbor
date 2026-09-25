"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const node_crypto_1 = require("node:crypto");
const web3_js_1 = require("@solana/web3.js");
const core_1 = require("@anchor-lang/core");
const idl_json_1 = __importDefault(require("../lib/idl.json"));
function disc(name) {
    return (0, node_crypto_1.createHash)("sha256").update(`account:${name}`, "utf8").digest().subarray(0, 8);
}
function bondBuffer() {
    const parts = [disc("MerchantBond")];
    parts.push(Buffer.alloc(32, 3)); // merchant
    parts.push(Buffer.alloc(32, 4)); // mint
    const u64 = (v) => {
        const b = Buffer.alloc(8);
        b.writeBigUInt64LE(v);
        return b;
    };
    parts.push(u64(500000n));
    const sla = Buffer.alloc(2);
    sla.writeUInt16LE(50);
    parts.push(sla);
    parts.push(u64(150n));
    parts.push(u64(2n));
    parts.push(u64(7n));
    parts.push(Buffer.from([9])); // bump
    return Buffer.concat(parts);
}
(0, node_test_1.describe)("anchor coder field mapping", () => {
    (0, node_test_1.it)("decodes MerchantBond with exact field values", () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const coder = new core_1.BorshCoder(idl_json_1.default);
        const acc = coder.accounts.decode("MerchantBond", bondBuffer());
        // Coder returns BN objects; String(BN) is decimal.
        strict_1.default.equal(BigInt(String(acc["amount"])), 500000n);
        strict_1.default.equal(Number(acc["sla_bps"]), 50);
        strict_1.default.equal(BigInt(String(acc["challenge_slots"])), 150n);
        strict_1.default.equal(BigInt(String(acc["open_disputes"])), 2n);
        strict_1.default.equal(BigInt(String(acc["last_change_slot"])), 7n);
        strict_1.default.equal(String(acc["merchant"]), new web3_js_1.PublicKey(Buffer.alloc(32, 3)).toBase58());
    });
});
