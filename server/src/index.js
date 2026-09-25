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
exports.createApp = createApp;
const node_http_1 = require("node:http");
const web3_js_1 = require("@solana/web3.js");
const harbor_sdk_1 = require("harbor-sdk");
const config_1 = require("./config");
const store_1 = require("./store");
const EXPIRY_SLOT = (1n << 63n) - 1n;
function json(res, code, body) {
    res.writeHead(code, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
}
function readBody(req) {
    return new Promise((resolve, reject) => {
        let raw = "";
        req.on("data", (c) => (raw += c));
        req.on("end", () => {
            try {
                resolve(raw.length > 0 ? JSON.parse(raw) : {});
            }
            catch (e) {
                reject(e);
            }
        });
    });
}
function createApp(cfg, store, conn) {
    function ensureBinding(session) {
        return __awaiter(this, void 0, void 0, function* () {
            if (cfg.skipChain)
                return;
            const connection = conn !== null && conn !== void 0 ? conn : (0, config_1.connectionFor)(cfg);
            const [binding] = (0, harbor_sdk_1.bindingPda)(session.channel);
            const existing = yield connection.getAccountInfo(binding);
            if (existing !== null)
                return;
            const [bond] = (0, harbor_sdk_1.bondPda)(cfg.merchant.publicKey, cfg.mint);
            const tx = new web3_js_1.Transaction().add((0, harbor_sdk_1.bindChannelIx)(cfg.programId, cfg.merchant.publicKey, bond, binding, session.channel, session.channelProgram, session.deposit));
            yield (0, web3_js_1.sendAndConfirmTransaction)(connection, tx, [cfg.merchant]);
        });
    }
    function handleSession(body) {
        return __awaiter(this, void 0, void 0, function* () {
            const channel = new web3_js_1.PublicKey(body["channel"]);
            const channelProgram = new web3_js_1.PublicKey(body["channelProgram"]);
            const deposit = BigInt(body["deposit"]);
            const authorizedSigner = new web3_js_1.PublicKey(body["authorizedSigner"]);
            if (deposit <= 0n)
                throw new Error("deposit must be positive");
            const key = channel.toBase58();
            let session = store.get(key);
            if (session === undefined) {
                const [binding] = (0, harbor_sdk_1.bindingPda)(channel);
                session = {
                    channel,
                    binding,
                    channelProgram,
                    deposit,
                    authorizedSigner,
                    accepted: 0n,
                    spent: 0n,
                    lastNonce: 0n,
                    receipts: new Map(),
                };
                store.set(session);
            }
            yield ensureBinding(session);
            return { ok: true, binding: session.binding.toBase58() };
        });
    }
    function handleComplete(body) {
        return __awaiter(this, void 0, void 0, function* () {
            if (store.killed) {
                return { status: 500, body: { error: "delivery failed: upstream fault injected" } };
            }
            const channel = new web3_js_1.PublicKey(body["channel"]);
            const session = store.get(channel.toBase58());
            if (session === undefined) {
                return { status: 404, body: { error: "unknown session" } };
            }
            const nonce = BigInt(body["nonce"]);
            const input = body["input"];
            const cumulative = BigInt(body["voucherCumulative"]);
            const sig = Buffer.from(body["voucherSignature"], "base64");
            if (nonce !== session.lastNonce + 1n) {
                return { status: 400, body: { error: "nonce must advance by exactly one" } };
            }
            if (cumulative <= session.accepted) {
                return {
                    status: 402,
                    body: { error: "voucher must exceed accepted total", accepted: session.accepted.toString() },
                };
            }
            const voucherMsg = (0, harbor_sdk_1.channelVoucherBytes)(channel, cumulative, 0n);
            if (!(0, harbor_sdk_1.verifyEd25519)(session.authorizedSigner, voucherMsg, sig)) {
                return { status: 402, body: { error: "bad voucher signature" } };
            }
            const { output, tokens } = (0, store_1.meterTokens)(input);
            const cost = tokens * cfg.pricePerToken;
            if (cumulative - session.accepted < cost) {
                return {
                    status: 402,
                    body: { error: "authorized delta too small", cost: cost.toString() },
                };
            }
            const meterHash = Buffer.from((0, store_1.sha256Hex)(input), "hex");
            const outputHash = Buffer.from((0, store_1.sha256Hex)(output), "hex");
            const msg = (0, harbor_sdk_1.receiptMessageBytes)({
                merchant: cfg.merchant.publicKey,
                binding: session.binding,
                cumulativeSpend: session.spent + cost,
                meterHash,
                outputHash,
                status: 0,
                nonce,
                expirySlot: EXPIRY_SLOT,
                signer: cfg.merchant.publicKey,
            });
            const signature = Buffer.from((0, harbor_sdk_1.signEd25519)(cfg.merchant.secretKey, msg)).toString("base64");
            session.accepted = cumulative;
            session.spent += cost;
            session.lastNonce = nonce;
            const receipt = {
                merchant: cfg.merchant.publicKey.toBase58(),
                binding: session.binding.toBase58(),
                cumulativeSpend: (session.spent).toString(),
                meterHash: meterHash.toString("hex"),
                outputHash: outputHash.toString("hex"),
                status: 0,
                nonce: nonce.toString(),
                expirySlot: EXPIRY_SLOT.toString(),
                signer: cfg.merchant.publicKey.toBase58(),
                signature,
            };
            session.receipts.set(nonce.toString(), receipt);
            return {
                status: 200,
                body: { output, tokens: tokens.toString(), cost: cost.toString(), receipt },
            };
        });
    }
    const server = (0, node_http_1.createServer)((req, res) => __awaiter(this, void 0, void 0, function* () {
        var _a;
        try {
            const url = new URL((_a = req.url) !== null && _a !== void 0 ? _a : "/", "http://x");
            if (req.method === "POST" && url.pathname === "/session") {
                json(res, 200, yield handleSession(yield readBody(req)));
            }
            else if (req.method === "POST" && url.pathname === "/complete") {
                const r = yield handleComplete(yield readBody(req));
                json(res, r.status, r.body);
            }
            else if (req.method === "GET" && url.pathname === "/info") {
                json(res, 200, {
                    merchant: cfg.merchant.publicKey.toBase58(),
                    pricePerToken: cfg.pricePerToken.toString(),
                    killed: store.killed,
                });
            }
            else if (req.method === "GET" &&
                url.pathname.startsWith("/receipt/")) {
                const [, , channel, nonce] = url.pathname.split("/");
                const s = channel !== undefined ? store.get(channel) : undefined;
                const r = s === null || s === void 0 ? void 0 : s.receipts.get(nonce !== null && nonce !== void 0 ? nonce : "");
                if (r === undefined)
                    json(res, 404, { error: "no receipt" });
                else
                    json(res, 200, r);
            }
            else if (req.method === "POST" && url.pathname === "/admin/kill") {
                const body = yield readBody(req);
                store.killed = body["killed"] !== false;
                json(res, 200, { killed: store.killed });
            }
            else {
                json(res, 404, { error: "not found" });
            }
        }
        catch (e) {
            json(res, 400, { error: e instanceof Error ? e.message : "bad request" });
        }
    }));
    return server;
}
