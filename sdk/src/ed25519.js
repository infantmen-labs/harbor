"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VOUCHER_LEN = void 0;
exports.buildEd25519Ix = buildEd25519Ix;
exports.channelVoucherBytes = channelVoucherBytes;
const web3_js_1 = require("@solana/web3.js");
const ids_1 = require("./ids");
/**
 * Canonical single-signature Ed25519 precompile ix. Offsets point into this
 * ix's own data (indices u16::MAX). Layout: header(16) | pubkey(32) |
 * signature(64) | message(n).
 */
function buildEd25519Ix(pubkey, signature, message) {
    if (signature.length !== 64)
        throw new Error("signature must be 64 bytes");
    const header = Buffer.alloc(16);
    header.writeUInt8(1, 0);
    header.writeUInt8(0, 1);
    header.writeUInt16LE(48, 2);
    header.writeUInt16LE(0xffff, 4);
    header.writeUInt16LE(16, 6);
    header.writeUInt16LE(0xffff, 8);
    header.writeUInt16LE(112, 10);
    header.writeUInt16LE(message.length, 12);
    header.writeUInt16LE(0xffff, 14);
    return new web3_js_1.TransactionInstruction({
        programId: ids_1.ED25519_PROGRAM_ID,
        keys: [],
        data: Buffer.concat([
            header,
            pubkey.toBuffer(),
            Buffer.from(signature),
            Buffer.from(message),
        ]),
    });
}
/** Upstream channel voucher payload: magic || channel || cumulative || expires. */
function channelVoucherBytes(channel, cumulative, expiresAt) {
    const out = Buffer.alloc(50);
    out.writeUInt8(0x56, 0);
    out.writeUInt8(0x01, 1);
    channel.toBuffer().copy(out, 2);
    out.writeBigUInt64LE(cumulative, 34);
    out.writeBigInt64LE(expiresAt, 42);
    return out;
}
exports.VOUCHER_LEN = 50;
