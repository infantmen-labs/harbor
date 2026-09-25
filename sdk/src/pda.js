"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.bondPda = bondPda;
exports.bindingPda = bindingPda;
exports.receiptPda = receiptPda;
exports.disputePda = disputePda;
exports.channelPda = channelPda;
exports.channelAta = channelAta;
const web3_js_1 = require("@solana/web3.js");
const ids_1 = require("./ids");
function bondPda(merchant, mint) {
    return web3_js_1.PublicKey.findProgramAddressSync([Buffer.from("bond"), merchant.toBuffer(), mint.toBuffer()], ids_1.HARBOR_PROGRAM_ID);
}
function bindingPda(channel) {
    return web3_js_1.PublicKey.findProgramAddressSync([Buffer.from("binding"), channel.toBuffer()], ids_1.HARBOR_PROGRAM_ID);
}
function receiptPda(binding, nonce) {
    const nonceBuf = Buffer.alloc(8);
    nonceBuf.writeBigUInt64LE(nonce);
    return web3_js_1.PublicKey.findProgramAddressSync([Buffer.from("receipt"), binding.toBuffer(), nonceBuf], ids_1.HARBOR_PROGRAM_ID);
}
function disputePda(binding, nonce) {
    const nonceBuf = Buffer.alloc(8);
    nonceBuf.writeBigUInt64LE(nonce);
    return web3_js_1.PublicKey.findProgramAddressSync([Buffer.from("dispute"), binding.toBuffer(), nonceBuf], ids_1.HARBOR_PROGRAM_ID);
}
function channelPda(channelProgram, payer, payee, mint, authorizedSigner, salt, openSlot) {
    const saltBuf = Buffer.alloc(8);
    saltBuf.writeBigUInt64LE(salt);
    const slotBuf = Buffer.alloc(8);
    slotBuf.writeBigUInt64LE(openSlot);
    return web3_js_1.PublicKey.findProgramAddressSync([
        Buffer.from("channel"),
        payer.toBuffer(),
        payee.toBuffer(),
        mint.toBuffer(),
        authorizedSigner.toBuffer(),
        saltBuf,
        slotBuf,
    ], channelProgram);
}
function channelAta(channel, tokenProgram, mint, ataProgram) {
    return web3_js_1.PublicKey.findProgramAddressSync([channel.toBuffer(), tokenProgram.toBuffer(), mint.toBuffer()], ataProgram);
}
