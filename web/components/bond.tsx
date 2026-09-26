"use client";

import type { BondStatus } from "@/lib/types";
import { Card, EmptyState, ErrorBanner, LoadingSkeleton } from "./primitives";
import { ExplorerLink, shorten } from "./explorer";
import { StateBadge } from "./status";

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <dt className="text-[14px] text-muted">{k}</dt>
      <dd className="text-right font-mono text-[14px]">{v}</dd>
    </div>
  );
}

export function BondCard({
  bond,
  error,
  loaded,
  onRetry,
}: {
  bond: BondStatus | null;
  error: string | null;
  loaded: boolean;
  onRetry: () => void;
}) {
  if (error !== null) return <ErrorBanner error={error} onRetry={onRetry} />;
  if (bond === null) {
    if (!loaded) return <LoadingSkeleton />;
    return <BondEmpty />;
  }
  return (
    <Card>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-display text-[20px] font-medium">Bond</h3>
        <StateBadge
          state={bond.openDisputes > 0n ? "pending" : "bonded"}
          label={
            bond.openDisputes > 0n
              ? `${bond.openDisputes} dispute(s) open`
              : "healthy"
          }
        />
      </div>
      <dl className="divide-y divide-border-subtle">
        <Row k="Bonded" v={`${bond.amount.toString()} base units`} />
        <Row
          k="SLA"
          v={`${(bond.slaBps / 100).toFixed(2)}% per proven failure`}
        />
        <Row
          k="Challenge window"
          v={`${bond.challengeSlots.toString()} slots`}
        />
        <Row
          k="Merchant"
          v={<ExplorerLink kind="address" value={bond.merchant} short />}
        />
        <Row
          k="Mint"
          v={<ExplorerLink kind="address" value={bond.mint} short />}
        />
        <Row
          k="Bond account"
          v={<ExplorerLink kind="address" value={bond.address} short />}
        />
      </dl>
      <p className="mt-3 font-mono text-[12px] text-muted">
        {shorten(bond.address, 8)}
      </p>
    </Card>
  );
}

export function Metric({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div>
      <p className="text-[13px] font-medium uppercase tracking-[0.04em] text-muted">
        {label}
      </p>
      <p className="mt-1 font-display text-[40px] md:text-[48px] font-medium leading-[100%] tracking-[-0.02em]">
        {value}
      </p>
      {sub !== undefined && (
        <p className="mt-1 font-mono text-[13px] text-muted">{sub}</p>
      )}
    </div>
  );
}

export function BondEmpty() {
  return (
    <EmptyState
      title="No bond found"
      body="This program has no bonded merchant yet. Become the first one on the Merchant page."
    />
  );
}
