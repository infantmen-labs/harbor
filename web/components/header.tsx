"use client";

import Link from "next/link";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { usePoll } from "@/lib/hooks";
import { getConnection, getSlot } from "@/lib/harbor";
import { PROGRAM_ID } from "@/lib/env";
import { shorten } from "./explorer";

function useSlot(): string | null {
  const { data } = usePoll(async () => getSlot(getConnection()), 2000);
  return data === null ? null : data.toString();
}

export function StatusHeader({ demoData = false }: { demoData?: boolean }) {
  const slot = useSlot();
  return (
    <header className="border-b border-border bg-background-secondary">
      <div className="mx-auto flex w-full max-w-[1280px] items-center justify-between gap-4 px-5 py-4 md:px-8">
        <div className="flex items-center gap-6">
          <Link href="/" className="font-display text-[20px] font-bold tracking-[-0.01em]">
            Harbor
          </Link>
          <nav className="hidden items-center gap-5 text-[14px] text-muted md:flex">
            <Link href="/live" className="hover:text-foreground">
              Live
            </Link>
            <Link href="/merchant" className="hover:text-foreground">
              Merchant
            </Link>
            <a
              href="https://github.com"
              target="_blank"
              rel="noreferrer"
              className="hover:text-foreground"
            >
              Docs
            </a>
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden items-center gap-2 font-mono text-[13px] text-muted sm:flex">
            <span className="inline-block h-2 w-2 rounded-full bg-success" />
            {demoData ? "demo data" : slot === null ? "connecting…" : `slot ${slot}`}
          </span>
          <WalletMultiButton className="!h-9 !rounded-[8px] !bg-foreground !text-[14px] !font-medium !text-background hover:!opacity-90" />
        </div>
      </div>
    </header>
  );
}

export function ProgramLine() {
  return (
    <p className="font-mono text-[13px] text-muted">
      program <span className="text-foreground">{shorten(PROGRAM_ID, 6)}</span>
    </p>
  );
}
