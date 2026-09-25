"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const web3_js_1 = require("@solana/web3.js");
const tweetnacl_1 = __importDefault(require("tweetnacl"));
const index_1 = require("../src/index");
const P = (n) => new web3_js_1.PublicKey(Buffer.alloc(32, n));
(0, node_test_1.describe)("receipt layout", () => {
    (0, node_test_1.it)("encodes fields in consensus order with exact length", () => {
        const f = {
            merchant: P(1),
            binding: P(2),
            cumulativeSpend: 10000n,
            meterHash: new Uint8Array(32).fill(3),
            outputHash: new Uint8Array(32).fill(4),
            status: 0,
            nonce: 7n,
            expirySlot: 999n,
            signer: P(1),
        };
        const got = (0, index_1.receiptMessageBytes)(f);
        strict_1.default.equal(got.length, index_1.RECEIPT_MESSAGE_LEN);
        // Independently rebuild the expectation part by part.
        const exp = Buffer.concat([
            Buffer.alloc(32, 1),
            Buffer.alloc(32, 2),
            (() => { const b = Buffer.alloc(8); b.writeBigUInt64LE(10000n); return b; })(),
            Buffer.alloc(32, 3),
            Buffer.alloc(32, 4),
            Buffer.from([0]),
            (() => { const b = Buffer.alloc(8); b.writeBigUInt64LE(7n); return b; })(),
            (() => { const b = Buffer.alloc(8); b.writeBigUInt64LE(999n); return b; })(),
            Buffer.alloc(32, 1),
        ]);
        strict_1.default.ok(got.equals(exp));
    });
    (0, node_test_1.it)("round-trips through tweetnacl sign/verify", () => {
        const kp = tweetnacl_1.default.sign.keyPair();
        const msg = (0, index_1.receiptMessageBytes)({
            merchant: new web3_js_1.PublicKey(kp.publicKey),
            binding: P(2),
            cumulativeSpend: 1n,
            meterHash: new Uint8Array(32),
            outputHash: new Uint8Array(32),
            status: 0,
            nonce: 1n,
            expirySlot: 100n,
            signer: new web3_js_1.PublicKey(kp.publicKey),
        });
        const sig = (0, index_1.signEd25519)(kp.secretKey, msg);
        strict_1.default.ok((0, index_1.verifyEd25519)(new web3_js_1.PublicKey(kp.publicKey), msg, sig));
        const tampered = Buffer.from(msg);
        tampered[0] ^= 0xff;
        strict_1.default.ok(!(0, index_1.verifyEd25519)(new web3_js_1.PublicKey(kp.publicKey), tampered, sig));
    });
});
(0, node_test_1.describe)("ed25519 ix layout", () => {
    (0, node_test_1.it)("places pubkey/sig/message at 16/48/112 with pinned indices", () => {
        const ix = (0, index_1.buildEd25519Ix)(P(9), new Uint8Array(64).fill(7), new Uint8Array([1, 2, 3]));
        const d = Buffer.from(ix.data);
        strict_1.default.equal(d.length, 16 + 32 + 64 + 3);
        strict_1.default.equal(d.readUInt8(0), 1);
        strict_1.default.equal(d.readUInt16LE(2), 48);
        strict_1.default.equal(d.readUInt16LE(6), 16);
        strict_1.default.equal(d.readUInt16LE(10), 112);
        strict_1.default.equal(d.readUInt16LE(12), 3);
        strict_1.default.ok(d.subarray(16, 48).equals(Buffer.alloc(32, 9)));
    });
});
(0, node_test_1.describe)("channel voucher layout", () => {
    (0, node_test_1.it)("is magic || channel || cumulative || expires, 50 bytes", () => {
        const v = (0, index_1.channelVoucherBytes)(P(5), 2000000n, 0n);
        strict_1.default.equal(v.length, index_1.VOUCHER_LEN);
        strict_1.default.equal(v.readUInt8(0), 0x56);
        strict_1.default.equal(v.readUInt8(1), 0x01);
        strict_1.default.ok(v.subarray(2, 34).equals(Buffer.alloc(32, 5)));
        strict_1.default.equal(v.readBigUInt64LE(34), 2000000n);
        strict_1.default.equal(v.readBigInt64LE(42), 0n);
    });
});
