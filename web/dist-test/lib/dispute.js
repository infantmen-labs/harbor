"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ata = ata;
exports.buildCreateAtaIx = buildCreateAtaIx;
exports.buildRegisterIx = buildRegisterIx;
exports.buildPostBondIx = buildPostBondIx;
exports.buildTopUpIx = buildTopUpIx;
exports.buildBindIx = buildBindIx;
exports.buildHaltIx = buildHaltIx;
exports.buildWithdrawIx = buildWithdrawIx;
exports.buildOpenDisputeIx = buildOpenDisputeIx;
const web3_js_1 = require("@solana/web3.js");
const spl_token_1 = require("@solana/spl-token");
const harbor_sdk_1 = require("harbor-sdk");
const env_1 = require("./env");
const PROGRAM = new web3_js_1.PublicKey(env_1.PROGRAM_ID);
async function ata(owner, mint) {
    return (0, spl_token_1.getAssociatedTokenAddress)(mint, owner);
}
/** Idempotent ATA creation for a user that may not hold the mint yet. */
function buildCreateAtaIx(payer, owner, mint, ata) {
    return (0, spl_token_1.createAssociatedTokenAccountInstruction)(payer, ata, owner, mint);
}
async function buildRegisterIx(merchant, mint, slaBps, challengeSlots) {
    const [bond] = (0, harbor_sdk_1.bondPda)(merchant, mint);
    return {
        ix: (0, harbor_sdk_1.registerMerchantIx)(PROGRAM, merchant, bond, mint, slaBps, challengeSlots),
        bond,
    };
}
async function buildPostBondIx(merchant, bond, mint, amount) {
    const merchantAta = await ata(merchant, mint);
    const [vault] = web3_js_1.PublicKey.findProgramAddressSync([bond.toBuffer(), harbor_sdk_1.TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()], harbor_sdk_1.ATA_PROGRAM_ID);
    const ixs = [];
    ixs.push((0, harbor_sdk_1.postBondIx)(PROGRAM, merchant, bond, mint, merchantAta, vault, amount));
    return { ixs, vault };
}
async function buildTopUpIx(merchant, bond, mint, merchantAta, vault, amount) {
    return (0, harbor_sdk_1.topUpBondIx)(PROGRAM, merchant, bond, mint, merchantAta, vault, amount);
}
async function buildBindIx(merchant, bond, channel, channelProgram, maxSpend) {
    const [binding] = (0, harbor_sdk_1.bindingPda)(channel);
    return {
        ix: (0, harbor_sdk_1.bindChannelIx)(PROGRAM, merchant, bond, binding, channel, channelProgram, maxSpend),
        binding,
    };
}
async function buildHaltIx(merchant, binding) {
    return (0, harbor_sdk_1.haltBindingIx)(PROGRAM, merchant, binding);
}
async function buildWithdrawIx(merchant, bond, mint, merchantAta, vault, amount) {
    return (0, harbor_sdk_1.withdrawBondIx)(PROGRAM, merchant, bond, mint, merchantAta, vault, amount);
}
async function buildOpenDisputeIx(claimant, bond, binding, nonce, reason) {
    const [dispute] = (0, harbor_sdk_1.disputePda)(binding, nonce);
    return {
        ix: (0, harbor_sdk_1.openDisputeIx)(PROGRAM, claimant, bond, binding, dispute, nonce, reason),
        dispute,
    };
}
