"use client";

import { useState } from "react";
import { TransactionInstruction } from "@solana/web3.js";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { getAssociatedTokenAddress } from "@solana/spl-token";
import {
  buildBindIx,
  buildCreateAtaIx,
  buildPostBondIx,
  buildRegisterIx,
} from "@/lib/dispute";
import { bondPda } from "harbor-sdk";
import { sendWalletTx } from "@/lib/tx";
import { CHANNEL_PROGRAM_ID } from "@/lib/env";
import type { TxState } from "@/lib/types";
import { Card, EmptyState } from "./primitives";
import { TxStatus } from "./status";
import { inputCls, parseAmount, parseKey } from "@/lib/forms";

export function OnboardStepper({ defaultMint }: { defaultMint: string }) {
  const { connection } = useConnection();
  const { publicKey, signTransaction } = useWallet();
  const [mint, setMint] = useState(defaultMint);
  const [amount, setAmount] = useState("500000");
  const [maxSpend, setMaxSpend] = useState("250000");
  const [channel, setChannel] = useState("");
  const [channelProgram, setChannelProgram] = useState(CHANNEL_PROGRAM_ID);
  const [state, setState] = useState<TxState>({ status: "idle" });
  const [done, setDone] = useState<string | null>(null);

  if (publicKey === null) {
    return (
      <EmptyState
        title="Connect a wallet"
        body="Merchant onboarding signs three transactions: register, fund, bind. Devnet SOL from the faucet covers fees."
      />
    );
  }

  async function run() {
    const wallet = publicKey;
    if (wallet === null || signTransaction === undefined) return;
    const mintKey = parseKey(mint);
    const bondAmount = parseAmount(amount);
    if (mintKey === null || bondAmount === null) {
      setState({
        status: "failed",
        error: "Enter a valid mint and a positive amount.",
      });
      return;
    }
    const [bond] = bondPda(wallet, mintKey);
    const merchantAta = await getAssociatedTokenAddress(mintKey, wallet);
    const ixs: TransactionInstruction[] = [];
    const ataInfo = await connection.getAccountInfo(merchantAta);
    if (ataInfo === null) {
      ixs.push(buildCreateAtaIx(wallet, wallet, mintKey, merchantAta));
    }
    const reg = await buildRegisterIx(wallet, mintKey, 50, 150n);
    ixs.push(reg.ix);
    const post = await buildPostBondIx(wallet, bond, mintKey, bondAmount);
    ixs.push(...post.ixs);
    if (channel.trim() !== "") {
      const channelKey = parseKey(channel);
      const programKey = parseKey(channelProgram);
      const spend = parseAmount(maxSpend);
      if (channelKey === null || programKey === null || spend === null) {
        setState({
          status: "failed",
          error: "Binding needs a valid channel, program, and max spend.",
        });
        return;
      }
      const bind = await buildBindIx(
        wallet,
        bond,
        channelKey,
        programKey,
        spend
      );
      ixs.push(bind.ix);
    }
    await sendWalletTx(
      connection,
      wallet,
      async (tx) => signTransaction(tx),
      ixs,
      setState
    );
    setDone(bond.toBase58());
  }

  return (
    <Card>
      <h3 className="mb-4 font-display text-[20px] font-medium">
        Become a merchant
      </h3>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="block text-[14px]">
          <span className="mb-1 block text-muted">Mint</span>
          <input
            value={mint}
            onChange={(e) => setMint(e.target.value)}
            className={inputCls}
          />
        </label>
        <label className="block text-[14px]">
          <span className="mb-1 block text-muted">
            Bond amount (base units)
          </span>
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className={inputCls}
          />
        </label>
        <label className="block text-[14px]">
          <span className="mb-1 block text-muted">
            Channel to bind (optional)
          </span>
          <input
            value={channel}
            onChange={(e) => setChannel(e.target.value)}
            placeholder="leave empty — channels bind on first session"
            className={inputCls}
          />
        </label>
        <label className="block text-[14px]">
          <span className="mb-1 block text-muted">Max spend per channel</span>
          <input
            value={maxSpend}
            onChange={(e) => setMaxSpend(e.target.value)}
            className={inputCls}
          />
        </label>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          onClick={() => void run()}
          className="h-10 rounded-[8px] bg-foreground px-5 text-[15px] font-medium text-background hover:opacity-90"
        >
          Register + fund{channel.trim() !== "" ? " + bind" : ""}
        </button>
        <TxStatus state={state} />
      </div>
      {done !== null && (
        <p className="mt-3 font-mono text-[13px] text-success">
          bonded: {done}
        </p>
      )}
    </Card>
  );
}
