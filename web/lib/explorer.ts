import { RPC_URL } from "@/lib/env";

function clusterParam(): string {
  if (RPC_URL.includes("devnet")) return "?cluster=devnet";
  if (RPC_URL.includes("testnet")) return "?cluster=testnet";
  if (RPC_URL.includes("localhost") || RPC_URL.includes("127.0.0.1")) {
    return `?cluster=custom&customUrl=${encodeURIComponent(RPC_URL)}`;
  }
  return "";
}

export function explorerUrl(kind: "tx" | "address", value: string): string {
  return `https://explorer.solana.com/${kind}/${value}${clusterParam()}`;
}

export function shorten(value: string, chars = 4): string {
  if (value.length <= chars * 2 + 1) return value;
  return `${value.slice(0, chars)}…${value.slice(-chars)}`;
}
