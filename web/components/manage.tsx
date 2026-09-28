"use client";

import { useCallback, useState } from "react";
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { getAssociatedTokenAddress } from "@solana/spl-token";
import { ATA_PROGRAM_ID, TOKEN_PROGRAM_ID, bondPda } from "@infantmen-labs/harbor-sdk";
import { buildHaltIx, buildTopUpIx, buildWithdrawIx } from "@/lib/dispute";
import { sendWalletTx } from "@/lib/tx";
import {
  fetchBond,
  getConnection as getConn,
  listBindingsForBond,
} from "@/lib/harbor";
import type { BindingStatus, BondStatus, TxState } from "@/lib/types";
import { usePoll } from "@/lib/hooks";
import { Card, EmptyState } from "./primitives";
import { ExplorerLink } from "./explorer";
import { TxStatus } from "./status";
import { inputCls, parseAmount, parseKey } from "@/lib/forms";

function vaultFor(bond: PublicKey, mint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [bond.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ATA_PROGRAM_ID
  )[0];
}

export function ManageBond({ defaultMint }: { defaultMint: string }) {
  const { connection } = useConnection();
  const { publicKey, signTransaction } = useWallet();
  const [mint, setMint] = useState(defaultMint);
  const [amount, setAmount] = useState("100000");
  const [state, setState] = useState<TxState>({ status: "idle" });

  const { data: bond, updatedAt: bondAt } = usePoll(
    useCallback(async (): Promise<BondStatus | null> => {
      if (publicKey === null || mint.trim() === "") return null;
      const mintKey = parseKey(mint);
      if (mintKey === null) return null;
      const [bondKey] = bondPda(publicKey, mintKey);
      return fetchBond(getConn(), bondKey);
    }, [publicKey, mint]),
    6000
  );
  const bondAddress = bond === null ? null : bond.address;

  const { data: bindings } = usePoll(
    useCallback(async (): Promise<BindingStatus[]> => {
      if (bondAddress === null) return [];
      return listBindingsForBond(getConn(), new PublicKey(bondAddress));
    }, [bondAddress]),
    6000
  );

  async function send(ixs: TransactionInstruction[]) {
    if (publicKey === null || signTransaction === undefined) return;
    await sendWalletTx(
      connection,
      publicKey,
      (tx) => signTransaction(tx),
      ixs,
      setState
    );
  }

  async function topUp() {
    if (publicKey === null || bond === null) return;
    const mintKey = parseKey(mint);
    const value = parseAmount(amount);
    if (mintKey === null || value === null) {
      setState({
        status: "failed",
        error: "Enter a valid mint and a positive amount.",
      });
      return;
    }
    const merchantAta = await getAssociatedTokenAddress(mintKey, publicKey);
    await send([
      buildTopUpIx(
        publicKey,
        new PublicKey(bond.address),
        mintKey,
        merchantAta,
        vaultFor(new PublicKey(bond.address), mintKey),
        value
      ),
    ]);
  }

  async function halt(binding: string) {
    if (publicKey === null) return;
    await send([buildHaltIx(publicKey, new PublicKey(binding))]);
  }

  async function withdraw() {
    if (publicKey === null || bond === null) return;
    const mintKey = parseKey(mint);
    const value = parseAmount(amount);
    if (mintKey === null || value === null) {
      setState({
        status: "failed",
        error: "Enter a valid mint and a positive amount.",
      });
      return;
    }
    const merchantAta = await getAssociatedTokenAddress(mintKey, publicKey);
    await send([
      buildWithdrawIx(
        publicKey,
        new PublicKey(bond.address),
        mintKey,
        merchantAta,
        vaultFor(new PublicKey(bond.address), mintKey),
        value
      ),
    ]);
  }

  if (publicKey === null) {
    return (
      <EmptyState
        title="Connect a wallet"
        body="Manage an existing bond: top up, halt a binding, or withdraw."
      />
    );
  }

  return (
    <Card>
      <h3 className="mb-4 font-display text-[20px] font-medium">Manage bond</h3>
      <label className="block text-[14px]">
        <span className="mb-1 block text-muted">Mint</span>
        <input
          value={mint}
          onChange={(e) => setMint(e.target.value)}
          className={inputCls}
        />
      </label>
      {bond === null ? (
        <p className="mt-3 text-[14px] text-muted">
          {bondAt === null
            ? "Looking up bond…"
            : "No bond found for this wallet + mint."}
        </p>
      ) : (
        <div className="mt-3">
          <p className="font-mono text-[14px]">
            {bond.amount.toString()} units · {bond.openDisputes.toString()} open
            disputes
          </p>
          {bond.openDisputes > 0n && (
            <p className="mt-1 text-[13px] text-warning">
              Withdrawals unlock when every dispute resolves.
            </p>
          )}
        </div>
      )}
      <label className="mt-3 block text-[14px]">
        <span className="mb-1 block text-muted">Amount (base units)</span>
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className={inputCls}
        />
      </label>
      <div className="mt-3 flex flex-wrap gap-3">
        <button
          onClick={() => void topUp()}
          disabled={bond === null}
          className="h-10 rounded-[8px] bg-foreground px-4 text-[14px] font-medium text-background disabled:opacity-40"
        >
          Top up
        </button>
        <button
          onClick={() => void withdraw()}
          disabled={bond === null}
          className="h-10 rounded-[8px] border border-border bg-surface px-4 text-[14px] font-medium disabled:opacity-40"
        >
          Withdraw
        </button>
      </div>
      <div className="mt-4">
        <TxStatus state={state} />
      </div>
      {(bindings ?? []).length > 0 && (
        <div className="mt-4 border-t border-border-subtle pt-3">
          <p className="mb-2 text-[14px] font-medium">Bindings</p>
          <ul className="space-y-2">
            {(bindings ?? []).map((b) => (
              <li
                key={b.address}
                className="flex items-center justify-between gap-3"
              >
                <ExplorerLink kind="address" value={b.channel} short />
                {b.halted ? (
                  <span className="font-mono text-[13px] text-error">
                    halted
                  </span>
                ) : (
                  <button
                    onClick={() => void halt(b.address)}
                    className="h-8 rounded-[8px] border border-error/40 px-3 text-[13px] font-medium text-error"
                  >
                    Halt
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
