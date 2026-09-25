"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SERVER_URL = exports.RPC_URL = exports.PROGRAM_ID = void 0;
exports.PROGRAM_ID = process.env["NEXT_PUBLIC_PROGRAM_ID"] ?? "BuRyKLqCsTLcyLVFEjxTjmF4DryCT3LmVDjwqhduvB4H";
exports.RPC_URL = process.env["NEXT_PUBLIC_RPC_URL"] ?? "https://api.devnet.solana.com";
exports.SERVER_URL = process.env["NEXT_PUBLIC_SERVER_URL"] ?? "http://127.0.0.1:3000";
