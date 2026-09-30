import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
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

  constructor(private readonly path: string | null = null) {}

  get(channel: string): Session | undefined {
    return this.sessions.get(channel);
  }

  set(s: Session): void {
    this.sessions.set(s.channel.toBase58(), s);
    this.save();
  }

  /** Persist after every mutation; restart-safe demo state. */
  save(): void {
    if (this.path === null) return;
    const sessions = [...this.sessions.values()].map((s) => ({
      channel: s.channel.toBase58(),
      binding: s.binding.toBase58(),
      channelProgram: s.channelProgram.toBase58(),
      deposit: s.deposit.toString(),
      authorizedSigner: s.authorizedSigner.toBase58(),
      accepted: s.accepted.toString(),
      spent: s.spent.toString(),
      lastNonce: s.lastNonce.toString(),
      receipts: [...s.receipts.values()],
    }));
    writeFileSync(this.path, JSON.stringify({ killed: this.killed, sessions }));
  }

  static load(path: string): Store | null {
    try {
      const raw = JSON.parse(readFileSync(path, "utf8")) as {
        killed: boolean;
        sessions: Array<{
          channel: string;
          binding: string;
          channelProgram: string;
          deposit: string;
          authorizedSigner: string;
          accepted: string;
          spent: string;
          lastNonce: string;
          receipts: StoredReceipt[];
        }>;
      };
      const store = new Store(path);
      store.killed = raw.killed === true;
      for (const s of raw.sessions) {
        store.sessions.set(s.channel, {
          channel: new PublicKey(s.channel),
          binding: new PublicKey(s.binding),
          channelProgram: new PublicKey(s.channelProgram),
          deposit: BigInt(s.deposit),
          authorizedSigner: new PublicKey(s.authorizedSigner),
          accepted: BigInt(s.accepted),
          spent: BigInt(s.spent),
          lastNonce: BigInt(s.lastNonce),
          receipts: new Map(s.receipts.map((r) => [r.nonce, r])),
        });
      }
      return store;
    } catch {
      return null;
    }
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
