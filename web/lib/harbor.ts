import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { AnchorProvider, Program } from "@anchor-lang/core";
import idl from "./idl.json";
import { RPC_URL } from "./env";
import type { BindingStatus, BondStatus, DisputeStatus } from "./types";

const programs = new Map<string, InstanceType<typeof Program>>();
let connection: Connection | null = null;

export function getConnection(url: string = RPC_URL): Connection {
  const opts = {
    commitment: "confirmed" as const,
    // Our usePoll hook owns retry/backoff. The client default retries
    // rate-limited calls internally, which multiplies load into a storm.
    disableRetryOnRateLimit: true,
  };
  if (url === RPC_URL) {
    if (connection === null) connection = new Connection(url, opts);
    return connection;
  }
  return new Connection(url, opts);
}

export function getProgram(conn: Connection): InstanceType<typeof Program> {
  const key = conn.rpcEndpoint;
  const cached = programs.get(key);
  if (cached !== undefined) return cached;
  // Read-only provider: the wallet adapter signs user transactions
  // separately; reads need nothing but a publicKey stub.
  const provider = new AnchorProvider(conn, {
    publicKey: Keypair.generate().publicKey,
  } as never, {
    commitment: "confirmed",
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const program = new Program(idl as any, provider);
  programs.set(key, program);
  return program;
}

function pk(v: unknown): string {
  if (typeof v === "string") return v;
  return (v as { toBase58(): string }).toBase58();
}

/**
 * The anchor account client (`.all()`/`.fetch()`) returns camelCase keys
 * with u64s as BN objects (String(BN) is decimal), small ints as numbers,
 * and pubkeys as PublicKey objects. (Raw `coder.decode` instead yields
 * snake_case keys — see the coder test. Verified live against localnet.)
 */
function big(v: unknown): bigint {
  if (typeof v === "bigint") return v;
  if (typeof v === "number") return BigInt(v);
  return BigInt(String(v));
}

/** JSON APIs carry decimal strings. */
export function bigDec(v: unknown): bigint {
  if (typeof v === "bigint") return v;
  if (typeof v === "number") return BigInt(v);
  return BigInt(String(v));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asRec(v: any): Record<string, any> {
  return v as Record<string, any>;
}

export async function fetchBond(
  conn: Connection,
  address: PublicKey,
): Promise<BondStatus | null> {
  const program = getProgram(conn);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const acc = await (program.account as any).merchantBond
    .fetchNullable(address)
    .catch(() => null);
  if (acc === null || acc === undefined) return null;
  const a = asRec(acc);
  return {
    address: address.toBase58(),
    merchant: pk(a["merchant"]),
    mint: pk(a["mint"]),
    amount: big(a["amount"]),
    slaBps: Number(a["slaBps"]),
    challengeSlots: big(a["challengeSlots"]),
    openDisputes: big(a["openDisputes"]),
    lastChangeSlot: big(a["lastChangeSlot"]),
  };
}

export async function listBonds(conn: Connection): Promise<BondStatus[]> {
  const program = getProgram(conn);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const all = (await (program.account as any).merchantBond.all()) as Array<{
    publicKey: PublicKey;
    account: unknown;
  }>;
  return all.map(({ publicKey, account }) => {
    const a = asRec(account);
    return {
      address: publicKey.toBase58(),
      merchant: pk(a["merchant"]),
      mint: pk(a["mint"]),
      amount: big(a["amount"]),
      slaBps: Number(a["slaBps"]),
      challengeSlots: big(a["challengeSlots"]),
      openDisputes: big(a["openDisputes"]),
      lastChangeSlot: big(a["lastChangeSlot"]),
    };
  });
}

export async function listBindingsForBond(
  conn: Connection,
  bond: PublicKey,
): Promise<BindingStatus[]> {
  const program = getProgram(conn);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const all = (await (program.account as any).channelBinding.all([
    { memcmp: { offset: 8 + 32 + 32, bytes: bond.toBase58() } },
  ])) as Array<{ publicKey: PublicKey; account: unknown }>;
  return all.map(({ publicKey, account }) => {
    const a = asRec(account);
    return {
      address: publicKey.toBase58(),
      channel: pk(a["channel"]),
      merchant: pk(a["merchant"]),
      bond: pk(a["bond"]),
      channelProgram: pk(a["channelProgram"]),
      maxSpend: big(a["maxSpend"]),
      lastNonce: big(a["lastNonce"]),
      halted: Boolean(a["halted"]),
    };
  });
}

export async function listDisputesForBinding(
  conn: Connection,
  binding: PublicKey,
  currentSlot: bigint,
): Promise<DisputeStatus[]> {
  const program = getProgram(conn);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const all = (await (program.account as any).dispute.all([
    { memcmp: { offset: 8, bytes: binding.toBase58() } },
  ])) as Array<{ publicKey: PublicKey; account: unknown }>;
  return all.map(({ publicKey, account }) => {
    const a = asRec(account);
    const deadline = big(a["deadlineSlot"]);
    return {
      address: publicKey.toBase58(),
      binding: pk(a["binding"]),
      nonce: big(a["nonce"]),
      reason: Number(a["reason"]),
      claimant: pk(a["claimant"]),
      deadlineSlot: deadline,
      state: currentSlot >= deadline ? "matured" : "open",
    };
  });
}

export async function getTokenBalance(
  conn: Connection,
  address: PublicKey,
): Promise<bigint | null> {
  try {
    const r = await conn.getTokenAccountBalance(address);
    return BigInt(r.value.amount);
  } catch {
    return null;
  }
}

export async function getSignatures(
  conn: Connection,
  address: PublicKey,
  limit = 10,
): Promise<string[]> {
  try {
    const sigs = await conn.getSignaturesForAddress(address, { limit });
    return sigs.map((s) => s.signature);
  } catch {
    return [];
  }
}

export async function getSlot(conn: Connection): Promise<bigint> {
  return BigInt(await conn.getSlot());
}
