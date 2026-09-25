"use client";

import type { TxState } from "@/lib/types";
import { ExplorerLink } from "./explorer";

export function TxStatus({ state }: { state: TxState }) {
  if (state.status === "idle") return null;
  if (state.status === "pending") {
    return (
      <p className="text-[13px] text-warning">
        Confirming{state.signature !== undefined ? " " : ""}…
      </p>
    );
  }
  if (state.status === "confirmed") {
    return (
      <p className="text-[13px] text-success">
        Confirmed <ExplorerLink kind="tx" value={state.signature} short />
      </p>
    );
  }
  return (
    <p className="text-[13px] text-error">
      Failed: {state.error}
      {state.signature !== undefined && (
        <>
          {" "}
          <ExplorerLink kind="tx" value={state.signature} short />
        </>
      )}
    </p>
  );
}

export function Countdown({ label, value }: { label: string; value: string }) {
  const matured = value === "matured";
  return (
    <p className="font-mono text-[14px]">
      <span className="text-muted">{label} </span>
      <span className={matured ? "text-success" : "text-warning"}>{value}</span>
    </p>
  );
}

const STATE_STYLES: Record<string, string> = {
  open: "bg-warning-bg text-warning",
  matured: "bg-warning-bg text-warning",
  "resolved-timeout": "bg-error-bg text-error",
  "resolved-delivered": "bg-background text-success",
  bonded: "bg-background text-success",
  halted: "bg-error-bg text-error",
};

export function StateBadge({ state, label }: { state: string; label?: string }) {
  const cls = STATE_STYLES[state] ?? "bg-background text-muted";
  return (
    <span
      className={`inline-block rounded-[9999px] px-2.5 py-0.5 text-[13px] font-medium ${cls}`}
    >
      {label ?? state}
    </span>
  );
}
