import { unstable_cache } from "next/cache";
import { Connection, PublicKey } from "@solana/web3.js";
import {
  ataFor,
  bondPda,
  decodeBond,
  treasuryPda,
} from "@infantmen-labs/harbor-sdk";
export interface LiveBond {
  amount: bigint;
  reserved: bigint;
  openDisputes: bigint;
  treasury: bigint;
  slot: number;
  stale: boolean;
}

// Public RPC only — the Helius key must never reach the browser bundle.
// Committed snapshot so the build passes with no network (honest
// staleness: rendered with an "as of" label, never as live).
const SNAPSHOT: LiveBond = {
  amount: 463000n,
  reserved: 0n,
  openDisputes: 0n,
  treasury: 37925n,
  slot: 507673187,
  stale: true,
};

const MERCHANT = new PublicKey("GQyf8wvGfpaLZvfvbXonpdiEfAGRvRXz2P6PkWxQ4rLJ");
const MINT = new PublicKey("HDwpthFfTBi4YyGo1zgd7zxyonE5CZsCizpVqURHGD54");

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("bond fetch timed out")), ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer!));
}

// JSON-safe: unstable_cache serializes cached values, and BigInt does
// not survive JSON.stringify — so the cached layer carries strings and
// getBondState converts at the boundary.
interface CachedBond {
  amount: string;
  reserved: string;
  openDisputes: string;
  treasury: string;
  slot: number;
}

async function fetchLiveBond(): Promise<CachedBond> {
  // Server component: prefer the server-side RPC_URL (may carry an API
  // key that must never ship to the browser) over the public
  // NEXT_PUBLIC_RPC_URL. Hardcoded devnet endpoint is the last resort.
  const rpc =
    process.env["RPC_URL"] ??
    process.env["NEXT_PUBLIC_RPC_URL"] ??
    "https://api.devnet.solana.com";
  const conn = new Connection(rpc, "confirmed");
  const [bond] = bondPda(MERCHANT, MINT);
  const [treasury] = treasuryPda(MINT);
  const [info, slot, tb] = await withTimeout(
    Promise.all([
      conn.getAccountInfo(bond),
      conn.getSlot(),
      conn.getTokenAccountBalance(ataFor(treasury, MINT)),
    ]),
    10000
  );
  if (info === null) throw new Error("bond account missing");
  const b = decodeBond(info.data);
  return {
    amount: b.amount.toString(),
    reserved: b.reserved.toString(),
    openDisputes: b.openDisputes.toString(),
    treasury: tb.value.amount,
    slot,
  };
}

// Cached hourly per roadmap (revalidate 3600). Rejections are NOT cached —
// a failed fetch falls through to SNAPSHOT below on every request.
const getCachedBond = unstable_cache(fetchLiveBond, ["live-bond"], {
  revalidate: 3600,
});

export async function getBondState(): Promise<LiveBond> {
  try {
    const live = await getCachedBond();
    return {
      amount: BigInt(live.amount),
      reserved: BigInt(live.reserved),
      openDisputes: BigInt(live.openDisputes),
      treasury: BigInt(live.treasury),
      slot: live.slot,
      stale: false,
    };
  } catch {
    return SNAPSHOT;
  }
}
