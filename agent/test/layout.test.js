"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const web3_js_1 = require("@solana/web3.js");
const channel_1 = require("../src/channel");
const K = () => web3_js_1.Keypair.generate().publicKey;
(0, node_test_1.describe)("upstream instruction layouts", () => {
    const PROGRAM = K();
    (0, node_test_1.it)("open carries discriminator 1 with 14 accounts", () => {
        const ix = (0, channel_1.openChannelIx)({
            programId: PROGRAM,
            payer: K(),
            payee: K(),
            mint: K(),
            authorizedSigner: K(),
            channel: K(),
            payerAta: K(),
            channelAta: K(),
            eventAuthority: K(),
            salt: 42n,
            deposit: 5000000n,
            gracePeriod: 7200,
            openSlot: 0n,
        });
        const d = Buffer.from(ix.data);
        strict_1.default.equal(d.readUInt8(0), 1);
        strict_1.default.equal(d.readBigUInt64LE(1), 42n);
        strict_1.default.equal(d.readBigUInt64LE(9), 5000000n);
        strict_1.default.equal(ix.keys.length, 14);
    });
    (0, node_test_1.it)("settle carries discriminator 2 with channel + sysvar", () => {
        const ix = (0, channel_1.settleIx)(PROGRAM, K());
        strict_1.default.deepEqual(Array.from(ix.data), [2]);
        strict_1.default.equal(ix.keys.length, 2);
    });
    (0, node_test_1.it)("top_up carries discriminator 3 and amount", () => {
        const ix = (0, channel_1.topUpIx)({
            programId: PROGRAM,
            payer: K(),
            channel: K(),
            payerAta: K(),
            channelAta: K(),
            mint: K(),
            amount: 9n,
        });
        const d = Buffer.from(ix.data);
        strict_1.default.equal(d.readUInt8(0), 3);
        strict_1.default.equal(d.readBigUInt64LE(1), 9n);
        strict_1.default.equal(ix.keys.length, 6);
    });
});
