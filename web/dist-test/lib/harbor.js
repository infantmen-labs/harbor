"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getConnection = getConnection;
exports.getProgram = getProgram;
exports.bigDec = bigDec;
exports.fetchBond = fetchBond;
exports.listBindingsForBond = listBindingsForBond;
exports.listDisputesForBinding = listDisputesForBinding;
exports.getTokenBalance = getTokenBalance;
exports.getSignatures = getSignatures;
exports.getSlot = getSlot;
const web3_js_1 = require("@solana/web3.js");
const core_1 = require("@anchor-lang/core");
const idl_json_1 = __importDefault(require("./idl.json"));
const env_1 = require("./env");
let program = null;
let connection = null;
function getConnection(url = env_1.RPC_URL) {
    if (url === env_1.RPC_URL) {
        if (connection === null)
            connection = new web3_js_1.Connection(url, "confirmed");
        return connection;
    }
    return new web3_js_1.Connection(url, "confirmed");
}
function getProgram(conn) {
    if (program === null) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        program = new core_1.Program(idl_json_1.default, { connection });
    }
    return program;
}
function pk(v) {
    if (typeof v === "string")
        return v;
    return v.toBase58();
}
/** Anchor coder returns BN objects; String(BN) is decimal. */
function big(v) {
    if (typeof v === "bigint")
        return v;
    if (typeof v === "number")
        return BigInt(v);
    return BigInt(String(v));
}
/** JSON APIs carry decimal strings. */
function bigDec(v) {
    return big(v);
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asRec(v) {
    return v;
}
async function fetchBond(conn, address) {
    const program = getProgram(conn);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const acc = await program.account.merchantBond
        .fetchNullable(address)
        .catch(() => null);
    if (acc === null || acc === undefined)
        return null;
    const a = asRec(acc);
    return {
        address: address.toBase58(),
        merchant: pk(a["merchant"]),
        mint: pk(a["mint"]),
        amount: big(a["amount"]),
        slaBps: Number(a["sla_bps"]),
        challengeSlots: big(a["challenge_slots"]),
        openDisputes: big(a["open_disputes"]),
        lastChangeSlot: big(a["last_change_slot"]),
    };
}
async function listBindingsForBond(conn, bond) {
    const program = getProgram(conn);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const all = (await program.account.channelBinding.all([
        { memcmp: { offset: 8 + 32 + 32, bytes: bond.toBase58() } },
    ]).catch(() => []));
    return all.map(({ publicKey, account }) => {
        const a = asRec(account);
        return {
            address: publicKey.toBase58(),
            channel: pk(a["channel"]),
            merchant: pk(a["merchant"]),
            bond: pk(a["bond"]),
            channelProgram: pk(a["channel_program"]),
            maxSpend: big(a["max_spend"]),
            lastNonce: big(a["last_nonce"]),
            halted: Boolean(a["halted"]),
        };
    });
}
async function listDisputesForBinding(conn, binding, currentSlot) {
    const program = getProgram(conn);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const all = (await program.account.dispute.all([
        { memcmp: { offset: 8, bytes: binding.toBase58() } },
    ]).catch(() => []));
    return all.map(({ publicKey, account }) => {
        const a = asRec(account);
        const deadline = big(a["deadline_slot"]);
        return {
            address: publicKey.toBase58(),
            binding: pk(a["binding"]),
            nonce: big(a["nonce"]),
            reason: Number(a["reason"]),
            claimant: pk(a["claimant"]),
            deadlineSlot: deadline,
            state: currentSlot >= deadline ? "matured" : "open",
        };
    });
}
async function getTokenBalance(conn, address) {
    try {
        const r = await conn.getTokenAccountBalance(address);
        return BigInt(r.value.amount);
    }
    catch {
        return null;
    }
}
async function getSignatures(conn, address, limit = 10) {
    try {
        const sigs = await conn.getSignaturesForAddress(address, { limit });
        return sigs.map((s) => s.signature);
    }
    catch {
        return [];
    }
}
async function getSlot(conn) {
    return BigInt(await conn.getSlot());
}
