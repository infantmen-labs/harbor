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
/** Creates a devnet test mint (or uses MINT) and funds merchant + agent ATAs. */
const web3_js_1 = require("@solana/web3.js");
const spl_token_1 = require("@solana/spl-token");
const node_fs_1 = require("node:fs");
function loadKeypair(path) {
    return web3_js_1.Keypair.fromSecretKey(Uint8Array.from(JSON.parse((0, node_fs_1.readFileSync)(path, "utf8"))));
}
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d, _e, _f;
        const connection = new web3_js_1.Connection((_a = process.env["RPC_URL"]) !== null && _a !== void 0 ? _a : "https://api.devnet.solana.com", "confirmed");
        const payer = loadKeypair((_b = process.env["PAYER_KEYPAIR"]) !== null && _b !== void 0 ? _b : `${process.env["HOME"]}/.config/solana/id.json`);
        const merchant = new web3_js_1.PublicKey((_c = process.env["MERCHANT_PUBKEY"]) !== null && _c !== void 0 ? _c : payer.publicKey.toBase58());
        const agent = new web3_js_1.PublicKey((_d = process.env["AGENT_PUBKEY"]) !== null && _d !== void 0 ? _d : "");
        const decimals = Number((_e = process.env["MINT_DECIMALS"]) !== null && _e !== void 0 ? _e : 6);
        const amount = BigInt((_f = process.env["MINT_AMOUNT"]) !== null && _f !== void 0 ? _f : 1000000000);
        let mint;
        if (process.env["MINT"] !== undefined && process.env["MINT"] !== "") {
            mint = new web3_js_1.PublicKey(process.env["MINT"]);
            console.log(`using mint ${mint.toBase58()}`);
        }
        else {
            mint = yield (0, spl_token_1.createMint)(connection, payer, payer.publicKey, null, decimals);
            console.log(`MINT=${mint.toBase58()}`);
        }
        for (const owner of [merchant, agent]) {
            const ata = yield (0, spl_token_1.getOrCreateAssociatedTokenAccount)(connection, payer, mint, owner);
            const sig = yield (0, spl_token_1.mintTo)(connection, payer, mint, ata.address, payer, amount);
            console.log(`funded ${owner.toBase58()} ata=${ata.address.toBase58()} sig=${sig}`);
        }
    });
}
main().catch((e) => {
    console.error(e);
    process.exit(1);
});
