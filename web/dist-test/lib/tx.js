"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendWalletTx = sendWalletTx;
const web3_js_1 = require("@solana/web3.js");
async function sendWalletTx(connection, payer, signTransaction, instructions, onState) {
    onState({ status: "pending" });
    try {
        const tx = new web3_js_1.Transaction().add(...instructions);
        tx.feePayer = payer;
        tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
        const signed = await signTransaction(tx);
        const raw = signed.serialize();
        const signature = await connection.sendRawTransaction(raw);
        onState({ status: "pending", signature });
        await connection.confirmTransaction(signature, "confirmed");
        onState({ status: "confirmed", signature });
        return signature;
    }
    catch (e) {
        const error = e instanceof Error ? e.message : "transaction failed";
        onState({ status: "failed", error });
        throw e;
    }
}
