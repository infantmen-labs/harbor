"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.openChannelIx = openChannelIx;
exports.settleIx = settleIx;
exports.topUpIx = topUpIx;
exports.deriveChannel = deriveChannel;
const web3_js_1 = require("@solana/web3.js");
const harbor_sdk_1 = require("harbor-sdk");
/** Upstream `open`. Layout: disc(1) | salt(8) | deposit(8) | grace(4) | slot(8) | recipients u32. */
function openChannelIx(args) {
    const data = Buffer.concat([
        Buffer.from([1]),
        u64(args.salt),
        u64(args.deposit),
        u32(args.gracePeriod),
        u64(args.openSlot),
        u32(0),
    ]);
    return new web3_js_1.TransactionInstruction({
        programId: args.programId,
        keys: [
            m(args.payer, true, true),
            m(args.payer, true, true),
            m(args.payee, false, false),
            m(args.mint, false, false),
            m(args.authorizedSigner, false, false),
            m(args.channel, true, false),
            m(args.payerAta, true, false),
            m(args.channelAta, true, false),
            m(harbor_sdk_1.TOKEN_PROGRAM_ID, false, false),
            m(harbor_sdk_1.SYSTEM_PROGRAM_ID, false, false),
            m(harbor_sdk_1.RENT_SYSVAR_ID, false, false),
            m(harbor_sdk_1.ATA_PROGRAM_ID, false, false),
            m(args.eventAuthority, false, false),
            m(args.programId, false, false),
        ],
        data,
    });
}
function settleIx(programId, channel) {
    return new web3_js_1.TransactionInstruction({
        programId,
        keys: [
            m(channel, true, false),
            m(harbor_sdk_1.IX_SYSVAR_ID, false, false),
        ],
        data: Buffer.from([2]),
    });
}
/** Upstream `top_up`. Layout: disc(3) | amount(8). */
function topUpIx(args) {
    return new web3_js_1.TransactionInstruction({
        programId: args.programId,
        keys: [
            m(args.payer, true, true),
            m(args.channel, true, false),
            m(args.payerAta, true, false),
            m(args.channelAta, true, false),
            m(args.mint, false, false),
            m(harbor_sdk_1.TOKEN_PROGRAM_ID, false, false),
        ],
        data: Buffer.concat([Buffer.from([3]), u64(args.amount)]),
    });
}
function deriveChannel(programId, payer, payee, mint, authorizedSigner, salt, openSlot) {
    const [channel] = (0, harbor_sdk_1.channelPda)(programId, payer, payee, mint, authorizedSigner, salt, openSlot);
    return { channel };
}
function m(pubkey, writable, signer) {
    return { pubkey, isWritable: writable, isSigner: signer };
}
function u64(v) {
    const b = Buffer.alloc(8);
    b.writeBigUInt64LE(v);
    return b;
}
function u32(v) {
    const b = Buffer.alloc(4);
    b.writeUInt32LE(v);
    return b;
}
