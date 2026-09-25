"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.pass = pass;
exports.consider = consider;
const bs58_1 = __importDefault(require("bs58"));
const web3_js_1 = require("@solana/web3.js");
const harbor_sdk_1 = require("harbor-sdk");
const accounts_1 = require("./accounts");
function vaultAta(bond, mint) {
    return web3_js_1.PublicKey.findProgramAddressSync([bond.toBuffer(), harbor_sdk_1.TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()], harbor_sdk_1.ATA_PROGRAM_ID)[0];
}
function ataFor(owner, mint) {
    return web3_js_1.PublicKey.findProgramAddressSync([owner.toBuffer(), harbor_sdk_1.TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()], harbor_sdk_1.ATA_PROGRAM_ID)[0];
}
/** Binding layout: disc(8) + channel(32) + merchant(32) + bond(32) + ... */
function bindingBond(bindingData) {
    return new web3_js_1.PublicKey(bindingData.subarray(8 + 32 + 32, 8 + 32 + 32 + 32));
}
function pass(cfg, conn, log) {
    return __awaiter(this, void 0, void 0, function* () {
        let resolved = 0;
        let pending = 0;
        const slot = BigInt(yield conn.getSlot());
        const disputes = yield conn.getProgramAccounts(cfg.programId, {
            filters: [{ memcmp: { offset: 0, bytes: bs58_1.default.encode(accounts_1.DISPUTE_DISC) } }],
        });
        for (const { pubkey } of disputes) {
            const outcome = yield consider(cfg, conn, pubkey, slot, log);
            if (outcome === "resolved")
                resolved++;
            else
                pending++;
        }
        return { resolved, pending };
    });
}
function consider(cfg, conn, disputeKey, slot, log) {
    return __awaiter(this, void 0, void 0, function* () {
        const info = yield conn.getAccountInfo(disputeKey);
        if (info === null) {
            log.log({ dispute: disputeKey.toBase58(), action: "gone" });
            return "pending";
        }
        const d = (0, accounts_1.parseDispute)(Buffer.from(info.data));
        const [receipt] = (0, harbor_sdk_1.receiptPda)(d.binding, d.nonce);
        const receiptInfo = yield conn.getAccountInfo(receipt);
        const exists = receiptInfo !== null && receiptInfo.data.length > 0;
        const action = (0, accounts_1.decide)(d, exists, slot);
        const entry = {
            dispute: disputeKey.toBase58(),
            binding: d.binding.toBase58(),
            nonce: d.nonce.toString(),
            action: action.kind,
            slot: slot.toString(),
            mode: cfg.live ? "live" : "dry-run",
        };
        if (action.kind === "pending") {
            log.log(Object.assign(Object.assign({}, entry), { why: action.why }));
            return "pending";
        }
        if (!cfg.live) {
            log.log(entry);
            return "resolved";
        }
        const bindingInfo = yield conn.getAccountInfo(d.binding);
        if (bindingInfo === null)
            throw new Error("binding not found");
        const bindingData = Buffer.from(bindingInfo.data);
        // Upstream pin: never touch bindings pointed at unknown channel programs.
        const channelProgram = (0, accounts_1.bindingChannelProgram)(bindingData).toBase58();
        if (!cfg.channelProgramAllowlist.includes(channelProgram)) {
            log.log({
                dispute: disputeKey.toBase58(),
                action: "skipped-untrusted-channel-program",
                channelProgram,
            });
            return "pending";
        }
        const bondKey = bindingBond(bindingData);
        const bondInfo = yield conn.getAccountInfo(bondKey);
        if (bondInfo === null)
            throw new Error("bond not found");
        const bond = (0, accounts_1.parseBond)(Buffer.from(bondInfo.data));
        const tx = new web3_js_1.Transaction();
        if (action.kind === "resolve-timeout") {
            tx.add((0, harbor_sdk_1.resolveTimeoutIx)(cfg.programId, cfg.operator.publicKey, bondKey, bond.mint, d.binding, disputeKey, d.claimant, receipt, vaultAta(bondKey, bond.mint), ataFor(d.claimant, bond.mint), d.nonce));
        }
        else {
            tx.add((0, harbor_sdk_1.resolveDeliveredIx)(cfg.programId, cfg.operator.publicKey, bondKey, bond.merchant, d.binding, disputeKey, receipt, d.nonce));
        }
        const sig = yield (0, web3_js_1.sendAndConfirmTransaction)(conn, tx, [cfg.operator]);
        log.log(Object.assign(Object.assign({}, entry), { signature: sig }));
        return "resolved";
    });
}
