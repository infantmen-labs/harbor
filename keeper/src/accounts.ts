import { createHash } from "node:crypto";
import { PublicKey } from "@solana/web3.js";
import {
  type Action,
  decide,
  decodeBond,
  decodeDispute,
  type Bond,
  type Dispute,
} from "@infantmen-labs/harbor-sdk";

// Single source of truth lives in the SDK; re-exported here so existing
// keeper imports keep working.
export {
  type Action,
  decide,
  decodeBond,
  decodeDispute,
  type Bond,
  type Dispute,
};

export function accountDiscriminator(name: string): Buffer {
  return createHash("sha256")
    .update(`account:${name}`, "utf8")
    .digest()
    .subarray(0, 8);
}

export const DISPUTE_DISC = accountDiscriminator("Dispute");

/** Binding layout: disc(8) + channel(32) + merchant(32) + bond(32) + channel_program(32) + ... */
export function bindingChannelProgram(data: Buffer): PublicKey {
  return new PublicKey(data.subarray(8 + 32 + 32 + 32, 8 + 32 + 32 + 32 + 32));
}
