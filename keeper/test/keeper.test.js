"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const web3_js_1 = require("@solana/web3.js");
const accounts_1 = require("../src/accounts");
const K = (n) => new web3_js_1.PublicKey(Buffer.alloc(32, n));
function dispute(over = {}) {
    return Object.assign({ binding: K(1), nonce: 1n, reason: 1, claimant: K(2), deadlineSlot: 1000n, stakeLamports: 10000000n }, over);
}
(0, node_test_1.describe)("keeper adjudication", () => {
    (0, node_test_1.it)("delivery proof wins immediately", () => {
        strict_1.default.deepEqual((0, accounts_1.decide)(dispute(), true, 10n), { kind: "resolve-delivered" });
    });
    (0, node_test_1.it)("absence past deadline slashes", () => {
        strict_1.default.deepEqual((0, accounts_1.decide)(dispute(), false, 1001n), { kind: "resolve-timeout" });
    });
    (0, node_test_1.it)("absence inside window pends", () => {
        const a = (0, accounts_1.decide)(dispute(), false, 999n);
        strict_1.default.equal(a.kind, "pending");
    });
});
(0, node_test_1.describe)("account parsers", () => {
    (0, node_test_1.it)("round-trips bond layout", () => {
        const buf = Buffer.alloc(8 + 32 + 32 + 8 + 2 + 8 + 8 + 8 + 1);
        K(3).toBuffer().copy(buf, 8);
        K(4).toBuffer().copy(buf, 40);
        buf.writeBigUInt64LE(500000n, 72);
        buf.writeUInt16LE(50, 80);
        buf.writeBigUInt64LE(150n, 82);
        buf.writeBigUInt64LE(2n, 90);
        buf.writeBigUInt64LE(7n, 98);
        const b = (0, accounts_1.parseBond)(buf);
        strict_1.default.ok(b.merchant.equals(K(3)));
        strict_1.default.ok(b.mint.equals(K(4)));
        strict_1.default.equal(b.amount, 500000n);
        strict_1.default.equal(b.openDisputes, 2n);
    });
    (0, node_test_1.it)("round-trips dispute layout", () => {
        const buf = Buffer.alloc(8 + 32 + 8 + 1 + 32 + 8 + 8 + 1);
        K(1).toBuffer().copy(buf, 8);
        buf.writeBigUInt64LE(9n, 40);
        buf.writeUInt8(2, 48);
        K(2).toBuffer().copy(buf, 49);
        buf.writeBigUInt64LE(1000n, 81);
        buf.writeBigUInt64LE(10000000n, 89);
        const d = (0, accounts_1.parseDispute)(buf);
        strict_1.default.equal(d.nonce, 9n);
        strict_1.default.equal(d.reason, 2);
        strict_1.default.ok(d.claimant.equals(K(2)));
        strict_1.default.equal(d.deadlineSlot, 1000n);
    });
    (0, node_test_1.it)("reads the channel program from a binding", () => {
        const buf = Buffer.alloc(8 + 32 + 32 + 32 + 32 + 8 + 8 + 8 + 1 + 1);
        K(9).toBuffer().copy(buf, 104);
        strict_1.default.ok((0, accounts_1.bindingChannelProgram)(buf).equals(K(9)));
    });
});
