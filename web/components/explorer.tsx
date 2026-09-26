"use client";

import { explorerUrl, shorten } from "@/lib/explorer";

export { explorerUrl, shorten };

export function ExplorerLink({
  kind,
  value,
  short,
}: {
  kind: "tx" | "address";
  value: string;
  short?: boolean;
}) {
  const href = explorerUrl(kind, value);
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
