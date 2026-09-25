"use client";

import { RPC_URL } from "@/lib/env";

function clusterParam(): string {
  if (RPC_URL.includes("devnet")) return "?cluster=devnet";
  if (RPC_URL.includes("testnet")) return "?cluster=testnet";
  if (RPC_URL.includes("localhost") || RPC_URL.includes("127.0.0.1")) {
    return `?cluster=custom&customUrl=${encodeURIComponent(RPC_URL)}`;
  }
  return "";
}

export function ExplorerLink({
  kind,
  value,
  short,
}: {
  kind: "tx" | "address";
  value: string;
  short?: boolean;
}) {
  const href = `https://explorer.solana.com/${kind}/${value}${clusterParam()}`;
  const label =
    short === true && value.length > 12
      ? `${value.slice(0, 4)}…${value.slice(-4)}`
      : value;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="font-mono text-[13px] text-accent hover:text-accent-hover underline-offset-2 hover:underline"
    >
      {label}
    </a>
  );
}

export function shorten(value: string, chars = 4): string {
  if (value.length <= chars * 2 + 1) return value;
  return `${value.slice(0, chars)}…${value.slice(-chars)}`;
}
