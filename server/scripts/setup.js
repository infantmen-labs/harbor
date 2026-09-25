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
Object.defineProperty(exports, "__esModule", { value: true });
/** One-time merchant setup: register bond + post collateral (binding happens per session). */
const web3_js_1 = require("@solana/web3.js");
const harbor_sdk_1 = require("harbor-sdk");
const config_1 = require("../src/config");
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c;
        const cfg = (0, config_1.loadConfig)();
        const connection = (0, config_1.connectionFor)(cfg);
        const slaBps = Number((_a = process.env["SLA_BPS"]) !== null && _a !== void 0 ? _a : 50);
        const challengeSlots = BigInt((_b = process.env["CHALLENGE_SLOTS"]) !== null && _b !== void 0 ? _b : 150);
        const amount = BigInt((_c = process.env["BOND_AMOUNT"]) !== null && _c !== void 0 ? _c : 500000);
        const [bond] = (0, harbor_sdk_1.bondPda)(cfg.merchant.publicKey, cfg.mint);
        const existing = yield connection.getAccountInfo(bond);
        if (existing === null) {
            const tx = new web3_js_1.Transaction().add((0, harbor_sdk_1.registerMerchantIx)(cfg.programId, cfg.merchant.publicKey, bond, cfg.mint, slaBps, challengeSlots));
            yield (0, web3_js_1.sendAndConfirmTransaction)(connection, tx, [cfg.merchant]);
            console.log(`registered bond ${bond.toBase58()}`);
        }
        else {
            console.log(`bond exists ${bond.toBase58()}`);
        }
        const merchantAta = yield connection.getParsedTokenAccountsByOwner(cfg.merchant.publicKey, {
            mint: cfg.mint,
        });
        if (merchantAta.value.length === 0)
            throw new Error("merchant has no ATA for mint");
        const vault = web3_js_1.PublicKey.findProgramAddressSync([bond.toBuffer(), harbor_sdk_1.TOKEN_PROGRAM_ID.toBuffer(), cfg.mint.toBuffer()], harbor_sdk_1.ATA_PROGRAM_ID)[0];
        const tx = new web3_js_1.Transaction().add((0, harbor_sdk_1.postBondIx)(cfg.programId, cfg.merchant.publicKey, bond, cfg.mint, merchantAta.value[0].pubkey, vault, amount));
        yield (0, web3_js_1.sendAndConfirmTransaction)(connection, tx, [cfg.merchant]);
        console.log(`posted ${amount} to ${vault.toBase58()}`);
    });
}
main().catch((e) => {
    console.error(e);
    process.exit(1);
});
