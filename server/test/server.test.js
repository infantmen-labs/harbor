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
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const web3_js_1 = require("@solana/web3.js");
const tweetnacl_1 = __importDefault(require("tweetnacl"));
const harbor_sdk_1 = require("harbor-sdk");
const index_1 = require("../src/index");
const store_1 = require("../src/store");
const CHNL = new web3_js_1.PublicKey("CHNLxYvVA28MJP9PrFuDXccuoGXAx7jBacfLEkahyGsX");
(0, node_test_1.describe)("server sessions", () => {
    let base = "";
    let merchant;
    let agent;
    let channel;
    let store;
    let server;
    (0, node_test_1.before)(() => __awaiter(void 0, void 0, void 0, function* () {
        merchant = web3_js_1.Keypair.generate();
        agent = web3_js_1.Keypair.generate();
        channel = web3_js_1.Keypair.generate().publicKey;
        store = new store_1.Store();
        const cfg = {
            port: 0,
            rpcUrl: "",
            merchant,
            mint: web3_js_1.Keypair.generate().publicKey,
            programId: web3_js_1.Keypair.generate().publicKey,
            pricePerToken: 10n,
            skipChain: true,
        };
        server = (0, index_1.createApp)(cfg, store);
        yield new Promise((resolve) => server.listen(0, resolve));
        base = `http://127.0.0.1:${server.address().port}`;
    }));
    (0, node_test_1.after)(() => __awaiter(void 0, void 0, void 0, function* () {
        yield new Promise((resolve) => server.close(() => resolve()));
    }));
    function post(path, body) {
        return __awaiter(this, void 0, void 0, function* () {
            const r = yield fetch(`${base}${path}`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify(body),
            });
            return { status: r.status, json: (yield r.json()) };
        });
    }
    (0, node_test_1.it)("serves metered completions with signed receipts", () => __awaiter(void 0, void 0, void 0, function* () {
        const s = yield post("/session", {
            channel: channel.toBase58(),
            channelProgram: CHNL.toBase58(),
            deposit: "100000",
            authorizedSigner: agent.publicKey.toBase58(),
        });
        strict_1.default.equal(s.status, 200);
        let cumulative = 0n;
        for (const nonce of [1n, 2n]) {
            cumulative += 5000n;
            const msg = (0, harbor_sdk_1.channelVoucherBytes)(channel, cumulative, 0n);
            const sig = Buffer.from(tweetnacl_1.default.sign.detached(msg, agent.secretKey)).toString("base64");
            const r = yield post("/complete", {
                channel: channel.toBase58(),
                nonce: nonce.toString(),
                input: `hello ${nonce}`,
                voucherCumulative: cumulative.toString(),
                voucherSignature: sig,
            });
            strict_1.default.equal(r.status, 200, JSON.stringify(r.json));
            const receipt = r.json["receipt"];
            strict_1.default.equal(receipt["nonce"], nonce.toString());
            // Receipt verifies against the merchant key.
            const rmsg = (0, harbor_sdk_1.receiptMessageBytes)({
                merchant: merchant.publicKey,
                binding: new web3_js_1.PublicKey(receipt["binding"]),
                cumulativeSpend: BigInt(receipt["cumulativeSpend"]),
                meterHash: Buffer.from(receipt["meterHash"], "hex"),
                outputHash: Buffer.from(receipt["outputHash"], "hex"),
                status: 0,
                nonce,
                expirySlot: BigInt(receipt["expirySlot"]),
                signer: merchant.publicKey,
            });
            strict_1.default.ok((0, harbor_sdk_1.verifyEd25519)(merchant.publicKey, rmsg, Buffer.from(receipt["signature"], "base64")));
        }
        // Receipts are retrievable.
        const g = yield fetch(`${base}/receipt/${channel.toBase58()}/1`);
        strict_1.default.equal(g.status, 200);
    }));
    (0, node_test_1.it)("rejects replays and enforces kill switch", () => __awaiter(void 0, void 0, void 0, function* () {
        const msg = (0, harbor_sdk_1.channelVoucherBytes)(channel, 6000n, 0n);
        const sig = Buffer.from(tweetnacl_1.default.sign.detached(msg, agent.secretKey)).toString("base64");
        // Nonce 2 already used above; replay must fail.
        const replay = yield post("/complete", {
            channel: channel.toBase58(),
            nonce: "2",
            input: "again",
            voucherCumulative: "6000",
            voucherSignature: sig,
        });
        strict_1.default.equal(replay.status, 400);
        yield post("/admin/kill", { killed: true });
        const dead = yield post("/complete", {
            channel: channel.toBase58(),
            nonce: "3",
            input: "x",
            voucherCumulative: "11000",
            voucherSignature: Buffer.from(tweetnacl_1.default.sign.detached((0, harbor_sdk_1.channelVoucherBytes)(channel, 11000n, 0n), agent.secretKey)).toString("base64"),
        });
        strict_1.default.equal(dead.status, 500);
        yield post("/admin/kill", { killed: false });
    }));
});
