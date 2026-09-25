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
 * Resumable buffer uploader: compares onchain buffer data against the local
 * .so and rewrites only differing ranges, retrying each chunk until it
 * confirms. Built for flaky RPC where stock tooling gives up.
 *
 * Env: RPC_URL, BUFFER_KEYPAIR (path), SO_PATH, CU_PRICE (micro-lamports),
 * CHUNK (bytes, default 800).
 */
const node_fs_1 = require("node:fs");
const web3_js_1 = require("@solana/web3.js");
const BPF_LOADER = new web3_js_1.PublicKey("BPFLoaderUpgradeab1e11111111111111111111111");
const HEADER_LEN = 37; // Buffer state tag (4) + authority (32) + alignment
function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}
let connection;
let buffer;
let authority;
let cuPrice = 10000;
function sendIx(keys, data, signers) {
    return __awaiter(this, void 0, void 0, function* () {
        const tx = new web3_js_1.Transaction()
            .add(web3_js_1.ComputeBudgetProgram.setComputeUnitPrice({ microLamports: cuPrice }))
            .add(new web3_js_1.TransactionInstruction({ programId: BPF_LOADER, keys, data }));
        for (;;) {
            try {
                return yield (0, web3_js_1.sendAndConfirmTransaction)(connection, tx, signers, {
                    commitment: "confirmed",
                    maxRetries: 0,
                });
            }
            catch (e) {
                console.log(`finalize retry: ${String(e).slice(0, 120)}`);
                yield sleep(3000);
            }
        }
    });
}
function finalize(so) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        const program = web3_js_1.Keypair.fromSecretKey(Uint8Array.from(JSON.parse((0, node_fs_1.readFileSync)((_a = process.env["PROGRAM_KEYPAIR"]) !== null && _a !== void 0 ? _a : "", "utf8"))));
        const [programdata] = web3_js_1.PublicKey.findProgramAddressSync([program.publicKey.toBuffer()], BPF_LOADER);
        // The program account (36 bytes, loader-owned) must exist before deploy.
        {
            const existing = yield connection.getAccountInfo(program.publicKey, "processed");
            if (existing === null) {
                const rent = yield connection.getMinimumBalanceForRentExemption(36);
                const tx = new web3_js_1.Transaction().add(web3_js_1.SystemProgram.createAccount({
                    fromPubkey: authority.publicKey,
                    newAccountPubkey: program.publicKey,
                    lamports: rent,
                    space: 36,
                    programId: BPF_LOADER,
                }));
                yield (0, web3_js_1.sendAndConfirmTransaction)(connection, tx, [authority, program], {
                    commitment: "confirmed",
                });
                console.log("created program account");
            }
        }
        // Deploy (fresh) or upgrade (existing) based on program account state.
        const progInfo = yield connection.getAccountInfo(program.publicKey, "processed");
        const isDeployed = progInfo !== null && progInfo.data.length > 36;
        const RENT = new web3_js_1.PublicKey("SysvarRent111111111111111111111111111111111");
        const CLOCK = new web3_js_1.PublicKey("SysvarC1ock11111111111111111111111111111111");
        let data;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let keys;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let signers;
        if (!isDeployed) {
            data = Buffer.alloc(12);
            data.writeUInt32LE(2, 0); // DeployWithMaxDataLen
            data.writeBigUInt64LE(BigInt(so.length), 4);
            keys = [
                { pubkey: authority.publicKey, isWritable: true, isSigner: true },
                { pubkey: programdata, isWritable: true, isSigner: false },
                { pubkey: program.publicKey, isWritable: true, isSigner: true },
                { pubkey: buffer.publicKey, isWritable: true, isSigner: false },
                { pubkey: RENT, isWritable: false, isSigner: false },
                { pubkey: CLOCK, isWritable: false, isSigner: false },
                { pubkey: web3_js_1.SystemProgram.programId, isWritable: false, isSigner: false },
                { pubkey: authority.publicKey, isWritable: false, isSigner: true },
            ];
            signers = [authority, program];
        }
        else {
            // Upgrade layout (7 accounts, no separate payer): programdata, program,
            // buffer, spill, rent, clock, authority.
            data = Buffer.alloc(4);
            data.writeUInt32LE(3, 0); // Upgrade
            keys = [
                { pubkey: programdata, isWritable: true, isSigner: false },
                { pubkey: program.publicKey, isWritable: true, isSigner: false },
                { pubkey: buffer.publicKey, isWritable: true, isSigner: false },
                { pubkey: authority.publicKey, isWritable: true, isSigner: false },
                { pubkey: RENT, isWritable: false, isSigner: false },
                { pubkey: CLOCK, isWritable: false, isSigner: false },
                { pubkey: authority.publicKey, isWritable: false, isSigner: true },
            ];
            signers = [authority];
        }
        const sig = yield sendIx(keys, data, signers);
        console.log(`DEPLOYED program=${program.publicKey.toBase58()} sig=${sig}`);
    });
}
function closeBuffer() {
    return __awaiter(this, void 0, void 0, function* () {
        const data = Buffer.alloc(4);
        data.writeUInt32LE(5, 0); // Close
        const sig = yield sendIx([
            { pubkey: buffer.publicKey, isWritable: true, isSigner: false },
            { pubkey: authority.publicKey, isWritable: true, isSigner: false },
            { pubkey: authority.publicKey, isWritable: false, isSigner: true },
        ], data, [authority]);
        console.log(`BUFFER_CLOSED sig=${sig}`);
    });
}
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d, _e, _f, _g;
        connection = new web3_js_1.Connection((_a = process.env["RPC_URL"]) !== null && _a !== void 0 ? _a : "", "processed");
        buffer = web3_js_1.Keypair.fromSecretKey(Uint8Array.from(JSON.parse((0, node_fs_1.readFileSync)((_b = process.env["BUFFER_KEYPAIR"]) !== null && _b !== void 0 ? _b : "", "utf8"))));
        authority = web3_js_1.Keypair.fromSecretKey(Uint8Array.from(JSON.parse((0, node_fs_1.readFileSync)((_c = process.env["AUTHORITY_KEYPAIR"]) !== null && _c !== void 0 ? _c : "", "utf8"))));
        cuPrice = Number((_d = process.env["CU_PRICE"]) !== null && _d !== void 0 ? _d : 10000);
        const so = (0, node_fs_1.readFileSync)((_e = process.env["SO_PATH"]) !== null && _e !== void 0 ? _e : "");
        const CHUNK = Number((_f = process.env["CHUNK"]) !== null && _f !== void 0 ? _f : 800);
        const rpcUrl = (_g = process.env["RPC_URL"]) !== null && _g !== void 0 ? _g : "";
        /** Sliced account read via raw RPC (keeps responses small). */
        function readSlice(offset, length) {
            return __awaiter(this, void 0, void 0, function* () {
                var _a, _b;
                const res = yield fetch(rpcUrl, {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({
                        jsonrpc: "2.0",
                        id: 1,
                        method: "getAccountInfo",
                        params: [
                            buffer.publicKey.toBase58(),
                            { commitment: "processed", encoding: "base64", dataSlice: { offset, length } },
                        ],
                    }),
                });
                const json = (yield res.json());
                const data = (_b = (_a = json.result) === null || _a === void 0 ? void 0 : _a.value) === null || _b === void 0 ? void 0 : _b.data;
                if (data === undefined || data === null)
                    throw new Error("buffer account missing");
                return Buffer.from(data[0], "base64");
            });
        }
        const total = HEADER_LEN + so.length;
        // Create the buffer account on first run (system-owned until Assigned).
        {
            const existing = yield connection.getAccountInfo(buffer.publicKey, "processed");
            if (existing === null) {
                const rent = yield connection.getMinimumBalanceForRentExemption(total);
                const tx = new web3_js_1.Transaction().add(web3_js_1.SystemProgram.createAccount({
                    fromPubkey: authority.publicKey,
                    newAccountPubkey: buffer.publicKey,
                    lamports: rent,
                    space: total,
                    programId: BPF_LOADER,
                }));
                yield (0, web3_js_1.sendAndConfirmTransaction)(connection, tx, [authority, buffer], {
                    commitment: "confirmed",
                });
                console.log(`created buffer ${buffer.publicKey.toBase58()} rent=${rent}`);
            }
        }
        // Initialize fresh (zeroed) buffers: InitializeBuffer sets the authority.
        {
            const head = yield readSlice(0, HEADER_LEN);
            if (head.equals(Buffer.alloc(HEADER_LEN))) {
                const data = Buffer.alloc(4);
                data.writeUInt32LE(0, 0);
                const tx = new web3_js_1.Transaction()
                    .add(web3_js_1.ComputeBudgetProgram.setComputeUnitPrice({ microLamports: cuPrice }))
                    .add(new web3_js_1.TransactionInstruction({
                    programId: BPF_LOADER,
                    keys: [
                        { pubkey: buffer.publicKey, isWritable: true, isSigner: false },
                        { pubkey: authority.publicKey, isWritable: false, isSigner: true },
                    ],
                    data,
                }));
                yield (0, web3_js_1.sendAndConfirmTransaction)(connection, tx, [authority], {
                    commitment: "confirmed",
                });
                console.log("initialized buffer");
            }
        }
        for (let attempt = 0;; attempt++) {
            let dirty = 0;
            const dirtyRanges = [];
            for (let off = 0; off < so.length; off += CHUNK) {
                const end = Math.min(off + CHUNK, so.length);
                // Small sliced reads: full-account fetches trip response size limits.
                const have = yield readSlice(HEADER_LEN + off, end - off);
                if (!so.subarray(off, end).equals(have)) {
                    dirty++;
                    dirtyRanges.push([off, end]);
                }
            }
            console.log(`pass ${attempt}: ${dirty} dirty ranges`);
            if (dirty === 0) {
                console.log("BUFFER_COMPLETE");
                if (process.env["FINALIZE"] === "1") {
                    yield finalize(so);
                    yield closeBuffer();
                }
                return;
            }
            // Rewrite dirty ranges, smallest retry loop per chunk.
            for (const [off, end] of dirtyRanges) {
                // BPFLoaderUpgradeable uses bincode: variant u32, offset u32, len u64.
                const data = Buffer.alloc(16 + (end - off));
                data.writeUInt32LE(1, 0); // Write tag
                data.writeUInt32LE(off, 4);
                data.writeBigUInt64LE(BigInt(end - off), 8);
                so.subarray(off, end).copy(data, 16);
                const tx = new web3_js_1.Transaction()
                    .add(web3_js_1.ComputeBudgetProgram.setComputeUnitPrice({ microLamports: cuPrice }))
                    .add(new web3_js_1.TransactionInstruction({
                    programId: BPF_LOADER,
                    keys: [
                        { pubkey: buffer.publicKey, isWritable: true, isSigner: false },
                        { pubkey: authority.publicKey, isWritable: false, isSigner: true },
                    ],
                    data,
                }));
                for (let r = 0;; r++) {
                    try {
                        yield (0, web3_js_1.sendAndConfirmTransaction)(connection, tx, [authority], {
                            commitment: "processed",
                            maxRetries: 0,
                        });
                        break;
                    }
                    catch (e) {
                        if (r === 0) {
                            const logs = typeof e.getLogs === "function"
                                ? yield e.getLogs().catch(() => [])
                                : [];
                            console.log(`chunk ${off} first failure: ${String(e).slice(0, 300)}`);
                            for (const l of logs.slice(0, 12))
                                console.log(`  | ${l.slice(0, 160)}`);
                        }
                        if (r % 10 === 0)
                            console.log(`chunk ${off} retry ${r}: ${String(e).slice(0, 100)}`);
                        yield sleep(Math.min(1000 * Math.pow(2, Math.min(r, 6)), 15000));
                    }
                }
            }
        }
    });
}
main().catch((e) => {
    console.error(e);
    process.exit(1);
});
