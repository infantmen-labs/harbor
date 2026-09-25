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
/**
 * Harbor agent: opens a payment channel, streams metered requests with
 * cumulative vouchers, verifies merchant receipts, logs JSONL evidence,
 * and cooperatively closes via a final settle.
 *
 * Env: RPC_URL, SERVER_URL, AGENT_KEYPAIR (path), MERCHANT_PUBKEY,
 * MINT, DEPOSIT, REQUESTS, BUDGET_PER_REQUEST, SALT, LOG_PATH.
 */
const node_fs_1 = require("node:fs");
const web3_js_1 = require("@solana/web3.js");
const harbor_sdk_1 = require("harbor-sdk");
const channel_1 = require("./channel");
function env(name, fallback) {
    var _a;
    const v = (_a = process.env[name]) !== null && _a !== void 0 ? _a : fallback;
    if (v === undefined)
        throw new Error(`${name} required`);
    return v;
}
function postJson(url, body) {
    return __awaiter(this, void 0, void 0, function* () {
        const r = yield fetch(url, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
        });
        return { status: r.status, json: (yield r.json()) };
    });
}
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        const connection = new web3_js_1.Connection(env("RPC_URL", "https://api.devnet.solana.com"), "confirmed");
        const serverUrl = env("SERVER_URL", "http://127.0.0.1:3000");
        const agent = web3_js_1.Keypair.fromSecretKey(Uint8Array.from(JSON.parse((0, node_fs_1.readFileSync)(env("AGENT_KEYPAIR"), "utf8"))));
        const merchant = new web3_js_1.PublicKey(env("MERCHANT_PUBKEY"));
        const channelProgram = new web3_js_1.PublicKey(env("CHANNEL_PROGRAM_ID", harbor_sdk_1.CHANNEL_PROGRAM_ID.toBase58()));
        const mint = new web3_js_1.PublicKey(env("MINT"));
        const deposit = BigInt(env("DEPOSIT", "100000"));
        const requests = Number(env("REQUESTS", "5"));
        const budget = BigInt(env("BUDGET_PER_REQUEST", "5000"));
        const salt = BigInt(env("SALT", `${Date.now() % 1000000}`));
        const log = new harbor_sdk_1.JsonlLogger(env("LOG_PATH", "agent-run.jsonl"));
        const requestDelayMs = Number(env("REQUEST_DELAY_MS", "0"));
        const payee = web3_js_1.Keypair.generate().publicKey;
        const clockSlot = yield connection.getSlot();
        const { channel } = (0, channel_1.deriveChannel)(channelProgram, agent.publicKey, payee, mint, agent.publicKey, salt, BigInt(clockSlot));
        const [channelAta] = (() => {
            const [a] = web3_js_1.PublicKey.findProgramAddressSync([channel.toBuffer(), harbor_sdk_1.TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()], harbor_sdk_1.ATA_PROGRAM_ID);
            return [a];
        })();
        const [eventAuthority] = web3_js_1.PublicKey.findProgramAddressSync([Buffer.from("event_authority")], channelProgram);
        const payerAta = (_a = (yield connection.getParsedTokenAccountsByOwner(agent.publicKey, { mint })).value[0]) === null || _a === void 0 ? void 0 : _a.pubkey;
        if (payerAta === undefined)
            throw new Error("agent has no ATA for mint");
        const openTx = new web3_js_1.Transaction().add((0, channel_1.openChannelIx)({
            programId: channelProgram,
            payer: agent.publicKey,
            payee,
            mint,
            authorizedSigner: agent.publicKey,
            channel,
            payerAta,
            channelAta,
            eventAuthority,
            salt,
            deposit,
            gracePeriod: 7200,
            openSlot: BigInt(clockSlot),
        }));
        yield (0, web3_js_1.sendAndConfirmTransaction)(connection, openTx, [agent]);
        console.log(`channel ${channel.toBase58()}`);
        const s = yield postJson(`${serverUrl}/session`, {
            channel: channel.toBase58(),
            channelProgram: channelProgram.toBase58(),
            deposit: deposit.toString(),
            authorizedSigner: agent.publicKey.toBase58(),
        });
        if (s.status !== 200)
            throw new Error(`session failed: ${JSON.stringify(s.json)}`);
        const binding = new web3_js_1.PublicKey(s.json["binding"]);
        function attemptRequest(n, cumulative) {
            return __awaiter(this, void 0, void 0, function* () {
                const msg = (0, harbor_sdk_1.channelVoucherBytes)(channel, cumulative, 0n);
                const sig = Buffer.from((0, harbor_sdk_1.signEd25519)(agent.secretKey, msg)).toString("base64");
                const r = yield postJson(`${serverUrl}/complete`, {
                    channel: channel.toBase58(),
                    nonce: n.toString(),
                    input: `agent request ${n} at ${Date.now()}`,
                    voucherCumulative: cumulative.toString(),
                    voucherSignature: sig,
                });
                return { status: r.status, json: r.json, cumulative };
            });
        }
        let lastSpent = 0n;
        let lastCumulative = 0n;
        let nonce = 1n;
        let successes = 0;
        let ceiling = deposit;
        while (successes < requests) {
            if (requestDelayMs > 0) {
                yield new Promise((r) => setTimeout(r, requestDelayMs));
            }
            const base = lastSpent > lastCumulative ? lastSpent : lastCumulative;
            // Authorization can never exceed the channel deposit: top up first.
            if (base + budget > ceiling) {
                const amount = deposit / 2n;
                const topTx = new web3_js_1.Transaction().add((0, channel_1.topUpIx)({
                    programId: channelProgram,
                    payer: agent.publicKey,
                    channel,
                    payerAta,
                    channelAta,
                    mint,
                    amount,
                }));
                yield (0, web3_js_1.sendAndConfirmTransaction)(connection, topTx, [agent]);
                ceiling += amount;
                console.log(`topped up channel, ceiling=${ceiling}`);
            }
            let attempt = yield attemptRequest(nonce, base + budget);
            if (attempt.status === 402 && typeof attempt.json["cost"] === "string") {
                // Re-authorize higher against the quoted cost and retry the same nonce.
                attempt = yield attemptRequest(nonce, lastCumulative + BigInt(attempt.json["cost"]) * 2n);
            }
            if (attempt.status !== 200) {
                log.log({ nonce: nonce.toString(), ok: false, error: attempt.json["error"], status: attempt.status });
                console.log(`request ${nonce} failed: ${JSON.stringify(attempt.json)}`);
                break;
            }
            const r = attempt;
            const receipt = r.json["receipt"];
            const rmsg = (0, harbor_sdk_1.receiptMessageBytes)({
                merchant,
                binding,
                cumulativeSpend: BigInt(receipt["cumulativeSpend"]),
                meterHash: Buffer.from(receipt["meterHash"], "hex"),
                outputHash: Buffer.from(receipt["outputHash"], "hex"),
                status: 0,
                nonce,
                expirySlot: BigInt(receipt["expirySlot"]),
                signer: merchant,
            });
            const ok = (0, harbor_sdk_1.verifyEd25519)(merchant, rmsg, Buffer.from(receipt["signature"], "base64"));
            lastCumulative = r.cumulative;
            lastSpent = BigInt(receipt["cumulativeSpend"]);
            log.log({
                nonce: nonce.toString(),
                ok,
                tokens: r.json["tokens"],
                cost: r.json["cost"],
                voucherCumulative: r.cumulative.toString(),
                receiptSignature: receipt["signature"],
            });
            console.log(`request ${nonce}: ok=${ok} cost=${r.json["cost"]}`);
            nonce += 1n;
            successes += 1;
        }
        // Cooperative close: settle the final voucher (skip if nothing succeeded).
        if (successes === 0) {
            console.log("no successful requests; skipping settle");
            return;
        }
        const closeMsg = (0, harbor_sdk_1.channelVoucherBytes)(channel, lastCumulative, 0n);
        const closeSig = (0, harbor_sdk_1.signEd25519)(agent.secretKey, closeMsg);
        const closeTx = new web3_js_1.Transaction().add((0, harbor_sdk_1.buildEd25519Ix)(agent.publicKey, closeSig, closeMsg), (0, channel_1.settleIx)(channelProgram, channel));
        yield (0, web3_js_1.sendAndConfirmTransaction)(connection, closeTx, [agent]);
        console.log(`settled at ${lastCumulative}`);
    });
}
main().catch((e) => {
    console.error(e);
    process.exit(1);
});
