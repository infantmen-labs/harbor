"use client";

import { useEffect, useState } from "react";
import { CodeBlock } from "./code-block";
/**
 * Live demo-merchant base URL, derived from the deployment serving this
 * page — correct on every domain (production, preview, localhost) with
 * zero env plumbing. This is the merchant's public face; the tunnel
 * origin behind the proxy is intentionally never shown.
 */
export function LiveEndpoint() {
  const [origin, setOrigin] = useState("<this-site>");
  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);
  const base = `${origin}/api`;
  return (
    <>
      <p>
        The demo merchant is live on devnet behind this site. Point any
        buyer at it — no repo clone, no local server:
      </p>
      <CodeBlock lang="sh" code={`SERVER_URL="${base}"`} />
      <p className="mt-4">Health check, straight at the merchant:</p>
      <CodeBlock lang="sh" code={`curl "${base}/info"`} />
    </>
  );
}

/** Devnet tUSDC drip: paste any wallet address, get test funds. Caps are
    enforced server-side (50/drip, 100 lifetime, 5/day per IP); the mint
    itself is closed, so this spends a pre-funded pot, never mints. */
export function FaucetCard() {
  const [addr, setAddr] = useState("");
  const [state, setState] = useState<
    { kind: "idle" } | { kind: "busy" } | { kind: "ok"; msg: string; sig: string } | { kind: "err"; msg: string }
  >({ kind: "idle" });
  async function req() {
    const address = addr.trim();
    if (address === "") return;
    setState({ kind: "busy" });
    try {
      const r = await fetch(`${window.location.origin}/api/faucet`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ address }),
      });
      const j = (await r.json()) as Record<string, unknown>;
      if (!r.ok) {
        setState({ kind: "err", msg: typeof j.error === "string" ? j.error : `HTTP ${r.status}` });
      } else {
        setState({
          kind: "ok",
          msg: `${Number(j.amount) / 1e6} tUSDC → ${j.ata}`,
          sig: typeof j.signature === "string" ? j.signature : "",
        });
      }
    } catch (e) {
      setState({ kind: "err", msg: e instanceof Error ? e.message : "request failed" });
    }
  }
  return (
    <div className="mt-6 rounded-[12px] border border-border bg-surface p-5">
      <p className="font-mono text-[12px] text-muted">devnet tUSDC faucet</p>
      <div className="mt-3 flex flex-col gap-3 sm:flex-row">
        <input
          value={addr}
          onChange={(e) => setAddr(e.target.value)}
          placeholder="wallet address (base58)"
          spellCheck={false}
          aria-label="Wallet address for test funds"
          className="min-h-[48px] flex-1 rounded-[8px] border border-border bg-background px-4 font-mono text-[14px] text-foreground placeholder:text-muted focus-visible:outline-2 focus-visible:outline-accent"
        />
        <button
          type="button"
          onClick={() => void req()}
          disabled={state.kind === "busy" || addr.trim() === ""}
          className="rounded-[8px] bg-foreground px-6 py-3 min-h-[48px] font-mono text-[15px] font-medium text-background hover:bg-accent hover:text-ink-bg disabled:opacity-50"
        >
          {state.kind === "busy" ? "dripping…" : "Get 50 tUSDC"}
        </button>
      </div>
      {state.kind === "ok" && (
        <p className="mt-3 font-mono text-[13px] text-foreground">
          {state.msg}
          <br />
          <span className="text-muted">tx {state.sig}</span>
        </p>
      )}
      {state.kind === "err" && (
        <p className="mt-3 font-mono text-[13px] text-foreground">drip refused: {state.msg}</p>
      )}
      <p className="mt-3 text-[13px] text-muted">
        50 per drip · 100 lifetime per address · 5/day per IP · devnet only.
        Need devnet SOL too? faucet.solana.com.
      </p>
    </div>
  );
}
