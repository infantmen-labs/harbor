"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DISPUTE_DISC = void 0;
exports.accountDiscriminator = accountDiscriminator;
exports.parseBond = parseBond;
exports.parseDispute = parseDispute;
exports.bindingChannelProgram = bindingChannelProgram;
exports.decide = decide;
const node_crypto_1 = require("node:crypto");
const web3_js_1 = require("@solana/web3.js");
function accountDiscriminator(name) {
    return (0, node_crypto_1.createHash)("sha256").update(`account:${name}`, "utf8").digest().subarray(0, 8);
}
exports.DISPUTE_DISC = accountDiscriminator("Dispute");
function parseBond(data) {
    return {
        merchant: new web3_js_1.PublicKey(data.subarray(8, 40)),
        mint: new web3_js_1.PublicKey(data.subarray(40, 72)),
        amount: data.readBigUInt64LE(72),
        slaBps: data.readUInt16LE(80),
        challengeSlots: data.readBigUInt64LE(82),
        openDisputes: data.readBigUInt64LE(90),
        lastChangeSlot: data.readBigUInt64LE(98),
    };
}
function parseDispute(data) {
    return {
        binding: new web3_js_1.PublicKey(data.subarray(8, 40)),
        nonce: data.readBigUInt64LE(40),
        reason: data.readUInt8(48),
        claimant: new web3_js_1.PublicKey(data.subarray(49, 81)),
        deadlineSlot: data.readBigUInt64LE(81),
        stakeLamports: data.readBigUInt64LE(89),
    };
}
/** Binding layout: disc(8) + channel(32) + merchant(32) + bond(32) + channel_program(32) + ... */
function bindingChannelProgram(data) {
    return new web3_js_1.PublicKey(data.subarray(8 + 32 + 32 + 32, 8 + 32 + 32 + 32 + 32));
}
/** Pure adjudication: delivery proof always wins; past-deadline absence slashes. */
function decide(d, receiptExists, slot) {
    if (receiptExists)
        return { kind: "resolve-delivered" };
    if (slot > d.deadlineSlot)
        return { kind: "resolve-timeout" };
    return { kind: "pending", why: "within challenge window" };
}
