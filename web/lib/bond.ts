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

async function fetchLiveBond(): Promise<Omit<LiveBond, "stale">> {
  const conn = new Connection("https://api.devnet.solana.com", "confirmed");
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
    amount: b.amount,
    reserved: b.reserved,
    openDisputes: b.openDisputes,
    treasury: BigInt(tb.value.amount),
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
    return { ...live, stale: false };
  } catch {
    return SNAPSHOT;
  }
}
