"use client";

import { useState } from "react";
import { PublicKey, Transaction } from "@solana/web3.js";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { buildOpenDisputeIx } from "@/lib/dispute";
import { parseAmount } from "@/lib/forms";
import { sendWalletTx } from "@/lib/tx";
import { countdownToDeadline } from "@/lib/countdown";
import type { DisputeStatus, TxState } from "@/lib/types";
import { Card, EmptyState } from "./primitives";
import { ExplorerLink, shorten } from "./explorer";
import { Countdown, StateBadge, TxStatus } from "./status";

const REASONS = [
  { value: 1, label: "Timeout — no delivery" },
  { value: 2, label: "Partial delivery" },
];

export function DisputeCard({
  dispute,
  slot,
}: {
  dispute: DisputeStatus | null;
  slot: bigint | null;
}) {
  if (dispute === null) {
    return (
      <EmptyState
        title="No open disputes"
        body="A failed delivery opens here with a countdown to the challenge deadline."
      />
    );
  }
  return (
    <Card>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-display text-[20px] font-medium">
          Dispute #{dispute.nonce.toString()}
        </h3>
        <StateBadge state={dispute.state} />
      </div>
      <dl className="divide-y divide-border-subtle">
        <div className="flex items-baseline justify-between gap-4 py-2">
          <dt className="text-[14px] text-muted">Claimant</dt>
          <dd>
            <ExplorerLink kind="address" value={dispute.claimant} short />
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-4 py-2">
          <dt className="text-[14px] text-muted">Locked claim</dt>
          <dd className="font-mono text-[14px]">
            {dispute.claimSpend.toString()} base units
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-4 py-2">
          <dt className="text-[14px] text-muted">Dispute</dt>
          <dd>
            <ExplorerLink kind="address" value={dispute.address} short />
          </dd>
        </div>
      </dl>
      <div className="mt-2">
        <Countdown
          label={`Deadline · slot ${dispute.deadlineSlot.toString()}`}
          value={
            slot === null
              ? "…"
              : countdownToDeadline(dispute.deadlineSlot, slot)
          }
        />
      </div>
      {dispute.winner !== undefined && (
        <p className="mt-2 font-mono text-[13px] text-muted">
          winner {shorten(dispute.winner, 6)}
          {dispute.signature !== undefined && (
            <>
              {" · "}
              <ExplorerLink kind="tx" value={dispute.signature} short />
            </>
          )}
        </p>
      )}
    </Card>
  );
}

export function OpenDisputeButton({
  bond,
  binding,
  channel,
  mint,
  nextNonce,
}: {
  bond: string;
  binding: string;
  /** Upstream channel: the program verifies its stored payer is the claimant. */
  channel: string;
  mint: string;
  nextNonce: bigint;
}) {
  const { connection } = useConnection();
  const { publicKey, signTransaction } = useWallet();
  const [reason, setReason] = useState(1);
  const [claim, setClaim] = useState("1000");
  const [state, setState] = useState<TxState>({ status: "idle" });

  async function open() {
    if (publicKey === null || signTransaction === undefined) return;
    const spend = parseAmount(claim);
    if (spend === null) {
      setState({ status: "failed", error: "Enter a positive claim size." });
      return;
    }
    const { ix } = buildOpenDisputeIx(
      publicKey,
      new PublicKey(bond),
      new PublicKey(binding),
      new PublicKey(channel),
      new PublicKey(mint),
      nextNonce,
      reason,
      spend
    );
    await sendWalletTx(
      connection,
      publicKey,
      async (tx: Transaction) => signTransaction(tx),
      [ix],
      setState
    );
  }

  if (publicKey === null) {
    return (
      <p className="text-[14px] text-muted">
        Connect a devnet wallet to open a dispute as claimant.{" "}
        <a
          href="https://faucet.solana.com"
          target="_blank"
          rel="noreferrer"
          className="text-accent underline underline-offset-2"
        >
          Get devnet SOL
        </a>
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <select
        value={reason}
        onChange={(e) => setReason(Number(e.target.value))}
        className="h-9 rounded-[8px] border border-border bg-surface px-3 text-[14px]"
      >
        {REASONS.map((r) => (
          <option key={r.value} value={r.value}>
            {r.label}
          </option>
        ))}
      </select>
      <label className="flex h-9 items-center gap-2 rounded-[8px] border border-border bg-surface px-3 text-[14px]">
        <span className="text-muted">Claim</span>
        <input
          value={claim}
          onChange={(e) => setClaim(e.target.value)}
          className="w-24 bg-transparent font-mono text-[14px] outline-none"
          inputMode="numeric"
        />
      </label>
      <button
        onClick={() => void open()}
        className="h-9 rounded-[8px] bg-foreground px-4 text-[14px] font-medium text-background hover:opacity-90"
      >
        Lock + open #{nextNonce.toString()}
      </button>
      <TxStatus state={state} />
      <p className="w-full text-[13px] text-muted">
        The claim locks from your wallet and caps the refund; fabrication can
        never pay more than it locks.
      </p>
    </div>
  );
}
