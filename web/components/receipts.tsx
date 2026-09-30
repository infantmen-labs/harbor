"use client";

import { useEffect, useRef, useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { receiptMessageBytes, verifyEd25519 } from "@infantmen-labs/harbor-sdk";
import { fetchReceipt } from "@/lib/server";
import type { Receipt } from "@/lib/types";
import { Card, EmptyState } from "./primitives";
import { shorten } from "./explorer";

export function useReceipts(
  channel: string | null,
  active: boolean
): Receipt[] {
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const seen = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!active || channel === null) return;
    let stop = false;
    let next = 1;
    const id = setInterval(async () => {
      if (stop) return;
      // Probe the next two nonces so a fresh receipt is never missed.
      for (const n of [next, next + 1]) {
        try {
          // eslint-disable-next-line no-await-in-loop
          const r = await fetchReceipt(channel, String(n));
          if (r !== null && !seen.current.has(r.nonce)) {
            seen.current.add(r.nonce);
            setReceipts((prev) =>
              [...prev, r].sort((a, b) =>
                Number(BigInt(a.nonce) - BigInt(b.nonce))
              )
            );
          }
        } catch {
          // Offline or unknown session: keep polling quietly.
        }
      }
      // Advance past the contiguous prefix we hold.
      let top = next;
      const have = new Set(seen.current);
      while (have.has(String(top))) top += 1;
      next = top;
    }, 3000);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, [active, channel]);

  return receipts;
}

export function ReceiptFeed({
  receipts,
  channel,
}: {
  receipts: Receipt[];
  channel?: string | null;
}) {
  if (receipts.length === 0) {
    return (
      <EmptyState
        title="No receipts yet"
        body="Metered deliveries appear here in real time, each signed by the merchant."
      />
    );
  }
  return (
    <Card>
      <h3 className="mb-2 font-display text-[20px] font-medium">
        Live receipts
      </h3>
      <ul>
        {receipts.map((r) => (
          <ReceiptRow
            key={`${r.binding}:${r.nonce}`}
            receipt={r}
            channel={channel ?? null}
          />
        ))}
      </ul>
    </Card>
  );
}

function b64(s: string): Uint8Array {
  return Uint8Array.from(Buffer.from(s, "base64"));
}

function hex(s: string): Uint8Array {
  return Uint8Array.from(Buffer.from(s, "hex"));
}

function ReceiptRow({
  receipt: r,
  channel,
}: {
  receipt: Receipt;
  channel: string | null;
}) {
  let verified = false;
  try {
    const msg = receiptMessageBytes({
      merchant: new PublicKey(r.merchant),
      binding: new PublicKey(r.binding),
      cumulativeSpend: BigInt(r.cumulativeSpend),
      meterHash: hex(r.meterHash),
      outputHash: hex(r.outputHash),
      status: r.status,
      nonce: BigInt(r.nonce),
      expirySlot: BigInt(r.expirySlot),
      signer: new PublicKey(r.signer),
    });
    verified = verifyEd25519(new PublicKey(r.signer), msg, b64(r.signature));
  } catch {
    verified = false;
  }
  return (
    <li
      className="flex items-baseline justify-between gap-4 border-t border-border-subtle py-2 first:border-t-0"
      style={{ animation: "harbor-fade-in 150ms ease-out" }}
    >
      <span className="font-mono text-[14px]">#{r.nonce}</span>
      <span className="font-mono text-[14px] text-muted">
        Σ {r.cumulativeSpend}
      </span>
      <span className="hidden font-mono text-[13px] text-muted sm:inline">
        {shorten(r.meterHash, 6)}
      </span>
      {verified ? (
        <span className="font-mono text-[13px] text-success">signed ✓</span>
      ) : (
        <span className="font-mono text-[13px] text-error">bad signature</span>
      )}
      {channel !== null && (
        <a
          href={`/api/receipt/${channel}/${r.nonce}`}
          target="_blank"
          rel="noreferrer"
          className="font-mono text-[13px] text-accent underline underline-offset-2"
        >
          json
        </a>
      )}
    </li>
  );
}
