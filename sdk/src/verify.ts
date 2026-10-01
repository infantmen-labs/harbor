import nacl from "tweetnacl";
import { PublicKey } from "@solana/web3.js";

export function verifyEd25519(
  pubkey: PublicKey,
  message: Uint8Array,
  signature: Uint8Array
): boolean {
  if (signature.length !== 64) return false;
  return nacl.sign.detached.verify(message, signature, pubkey.toBytes());
}

export function signEd25519(
  secretKey: Uint8Array,
  message: Uint8Array
): Uint8Array {
  return nacl.sign.detached(message, secretKey);
}
