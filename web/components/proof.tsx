"use client";

import type { ProofEntry } from "@/lib/types";
import { Card, EmptyState } from "./primitives";
import { ExplorerLink } from "./explorer";

export function ProofPanel({ entries }: { entries: ProofEntry[] }) {
  if (entries.length === 0) {
    return (
      <EmptyState
        title="Nothing to prove yet"
        body="Settled amounts, slash math, and signatures land here with explorer links."
      />
    );
  }
  return (
    <Card>
      <h3 className="mb-2 font-display text-[20px] font-medium">Proof</h3>
      <dl className="divide-y divide-border-subtle">
        {entries.map((e) => (
          <div key={e.label} className="flex items-baseline justify-between gap-4 py-2">
            <dt className="text-[14px] text-muted">{e.label}</dt>
            <dd className="text-right font-mono text-[14px]">
              {e.kind === "tx" || e.kind === "address" ? (
                <ExplorerLink kind={e.kind} value={e.value} short />
              ) : (
                e.value
              )}
            </dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}
