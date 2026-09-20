import { createHash } from "node:crypto";
import { PublicKey } from "@solana/web3.js";

export interface StoredReceipt {
  merchant: string;
  binding: string;
  cumulativeSpend: string;
  meterHash: string;
  outputHash: string;
  status: number;
  nonce: string;
  expirySlot: string;
  signer: string;
  signature: string;
}

export interface Session {
  channel: PublicKey;
  binding: PublicKey;
  channelProgram: PublicKey;
  deposit: bigint;
  authorizedSigner: PublicKey;
  accepted: bigint;
  spent: bigint;
  lastNonce: bigint;
  receipts: Map<string, StoredReceipt>;
}

export class Store {
  readonly sessions = new Map<string, Session>();
  killed = false;

  get(channel: string): Session | undefined {
    return this.sessions.get(channel);
  }

  set(s: Session): void {
    this.sessions.set(s.channel.toBase58(), s);
  }
}

/** Deterministic fake-LLM workload: token count derives from the input hash. */
export function meterTokens(input: string): { output: string; tokens: bigint } {
  const h = createHash("sha256").update(input, "utf8").digest();
  const tokens = BigInt(50 + (h[0] % 200));
  const output = `completion:${h.subarray(0, 8).toString("hex")}:${input.length}`;
  return { output, tokens };
}

export function sha256Hex(data: string | Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}
