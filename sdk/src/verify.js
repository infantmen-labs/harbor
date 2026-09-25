"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyEd25519 = verifyEd25519;
exports.signEd25519 = signEd25519;
const tweetnacl_1 = __importDefault(require("tweetnacl"));
function verifyEd25519(pubkey, message, signature) {
    if (signature.length !== 64)
        return false;
    return tweetnacl_1.default.sign.detached.verify(message, signature, pubkey.toBytes());
}
function signEd25519(secretKey, message) {
    return tweetnacl_1.default.sign.detached(message, secretKey);
}
