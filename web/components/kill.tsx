"use client";

import { useEffect, useState } from "react";
import { fetchInfo, setKilled } from "@/lib/server";

export function KillButton({
  onChanged,
}: {
  onChanged?: (killed: boolean) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [killed, setKilledState] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let stop = false;
    void fetchInfo().then((info) => {
      if (!stop && info !== null) setKilledState(info.killed);
    });
    return () => {
      stop = true;
    };
  }, []);

  async function flip(next: boolean) {
    setBusy(true);
    const ok = await setKilled(next);
    setBusy(false);
    if (ok) {
      setKilledState(next);
      setConfirming(false);
      onChanged?.(next);
    }
  }

  return (
    <div className="rounded-[12px] bg-ink-bg p-5 text-ink-inverse md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="font-display text-[20px] font-medium">
            Failure injection
          </h3>
          <p className="mt-1 text-[14px] opacity-70">
            {killed
              ? "Delivery is failing. Open a dispute before the deadline."
              : "Stop the merchant API mid-stream. Demo control only."}
          </p>
        </div>
        {!confirming ? (
          <button
            onClick={() => (killed ? void flip(false) : setConfirming(true))}
            disabled={busy}
            className={`rounded-[8px] px-5 py-2.5 text-[15px] font-medium disabled:opacity-50 ${
              killed ? "bg-ink-inverse text-ink-bg" : "bg-error text-white"
            }`}
          >
            {killed ? "Revive API" : "Kill delivery"}
          </button>
        ) : (
          <div className="flex gap-3">
            <button
              onClick={() => void flip(true)}
              disabled={busy}
              className="rounded-[8px] bg-error px-5 py-2.5 text-[15px] font-medium text-white disabled:opacity-50"
            >
              Confirm kill
            </button>
            <button
              onClick={() => setConfirming(false)}
              className="rounded-[8px] px-5 py-2.5 text-[15px] font-medium text-ink-inverse underline underline-offset-4"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function DangerCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-[12px] bg-ink-bg p-5 text-ink-inverse md:p-6">
      {children}
    </div>
  );
}
