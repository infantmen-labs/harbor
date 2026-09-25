import { PublicKey } from "@solana/web3.js";

/** Strict positive base-unit amount, or null (never throws). */
export function parseAmount(raw: string): bigint | null {
  const s = raw.trim();
  if (s === "" || !/^\d+$/.test(s)) return null;
  try {
    const v = BigInt(s);
    return v > 0n ? v : null;
  } catch {
    return null;
  }
}

/** Base58 address, or null (never throws). */
export function parseKey(raw: string): PublicKey | null {
  try {
    return new PublicKey(raw.trim());
  } catch {
    return null;
  }
}

export const inputCls =
  "h-10 w-full rounded-[8px] border border-border bg-surface px-3 font-mono text-[14px] placeholder:text-muted";
