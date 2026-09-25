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
/** Watchtower opens a dispute on behalf of a claimant after a failed delivery. */
const web3_js_1 = require("@solana/web3.js");
const harbor_sdk_1 = require("harbor-sdk");
const node_fs_1 = require("node:fs");
function loadKeypair(path) {
    return web3_js_1.Keypair.fromSecretKey(Uint8Array.from(JSON.parse((0, node_fs_1.readFileSync)(path, "utf8"))));
}
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d, _e, _f, _g;
        const connection = new web3_js_1.Connection((_a = process.env["RPC_URL"]) !== null && _a !== void 0 ? _a : "", "confirmed");
        const programId = new web3_js_1.PublicKey((_b = process.env["HARBOR_PROGRAM_ID"]) !== null && _b !== void 0 ? _b : "");
        const claimant = loadKeypair((_c = process.env["CLAIMANT_KEYPAIR"]) !== null && _c !== void 0 ? _c : "");
        const bond = new web3_js_1.PublicKey((_d = process.env["BOND"]) !== null && _d !== void 0 ? _d : "");
        const binding = new web3_js_1.PublicKey((_e = process.env["BINDING"]) !== null && _e !== void 0 ? _e : "");
        const nonce = BigInt((_f = process.env["NONCE"]) !== null && _f !== void 0 ? _f : "1");
        const reason = Number((_g = process.env["REASON"]) !== null && _g !== void 0 ? _g : 1);
        const [dispute] = (0, harbor_sdk_1.disputePda)(binding, nonce);
        const tx = new web3_js_1.Transaction().add((0, harbor_sdk_1.openDisputeIx)(programId, claimant.publicKey, bond, binding, dispute, nonce, reason));
        const sig = yield (0, web3_js_1.sendAndConfirmTransaction)(connection, tx, [claimant]);
        console.log(`dispute=${dispute.toBase58()} sig=${sig}`);
    });
}
main().catch((e) => {
    console.error(e);
    process.exit(1);
});
