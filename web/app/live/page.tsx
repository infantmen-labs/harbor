"use client";

import { useCallback, useMemo } from "react";
import { PublicKey } from "@solana/web3.js";
import { ATA_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@infantmen-labs/harbor-sdk";
import { StatusHeader } from "@/components/header";
import { Container } from "@/components/primitives";
import { BondCard } from "@/components/bond";
import { ReceiptFeed, useReceipts } from "@/components/receipts";
import { KillButton } from "@/components/kill";
import { DisputeCard, OpenDisputeButton } from "@/components/dispute";
import { ProofPanel } from "@/components/proof";
import { usePoll } from "@/lib/hooks";
import { useMockMode } from "@/lib/mock-mode";
import {
  fetchBond,
  getConnection,
  getSignatures,
  getSlot,
  getTokenBalance,
  listBindingsForBond,
  listBonds,
  listDisputesForBinding,
} from "@/lib/harbor";
import {
  MOCK_BOND,
  MOCK_DISPUTE,
  MOCK_RECEIPTS,
  MOCK_RESOLVE,
  MOCK_SLOT,
} from "@/lib/mock";
import type { ProofEntry } from "@/lib/types";

function vaultFor(bond: string, mint: string): PublicKey {
  return PublicKey.findProgramAddressSync(
    [
      new PublicKey(bond).toBuffer(),
      TOKEN_PROGRAM_ID.toBuffer(),
      new PublicKey(mint).toBuffer(),
    ],
    ATA_PROGRAM_ID
  )[0];
}

export default function Live() {
  const mock = useMockMode();
  const conn = useMemo(() => getConnection(), []);

  const liveBondKey = usePoll(
    useCallback(async () => {
      if (mock) return MOCK_BOND.address;
      const bonds = await listBonds(conn);
      return bonds.length > 0 ? bonds[0].address : null;
    }, [conn, mock]),
    8000,
    !mock
  );

  const bondKey = mock ? MOCK_BOND.address : liveBondKey.data;
  const bondQuery = usePoll(
    useCallback(async () => {
      if (mock) return MOCK_BOND;
      if (bondKey === null) return null;
      return fetchBond(conn, new PublicKey(bondKey));
    }, [conn, mock, bondKey]),
    6000,
    mock || bondKey !== null
  );

  const bond = mock ? MOCK_BOND : bondQuery.data;
  const bindingsQuery = usePoll(
    useCallback(async () => {
      if (mock || bond === null) return [];
      return listBindingsForBond(conn, new PublicKey(bond.address));
    }, [conn, mock, bond]),
    6000,
    !mock && bond !== null
  );
  const binding = useMemo(
    () =>
      mock
        ? {
            address: "HuzLMKJZeboM1vEKGnrMg4PAoqj8i6JcbQzwLqaxRi1X",
            channel: "mock-channel",
          }
        : bindingsQuery.data !== null && bindingsQuery.data.length > 0
        ? {
            address: bindingsQuery.data[0].address,
            channel: bindingsQuery.data[0].channel,
          }
        : null,
    [mock, bindingsQuery.data]
  );

  const channel = mock ? "mock-channel" : binding?.channel ?? null;
  const receipts = useReceipts(channel, !mock && channel !== null);
  const shownReceipts = mock ? MOCK_RECEIPTS : receipts;

  const slotQuery = usePoll(
    useCallback(async () => getSlot(conn), [conn]),
    4000,
    !mock
  );
  const slot = mock ? MOCK_SLOT : slotQuery.data;

  const disputesQuery = usePoll(
    useCallback(async () => {
      if (mock || binding === null || slot === null) return [];
      return listDisputesForBinding(conn, new PublicKey(binding.address), slot);
    }, [conn, mock, binding, slot]),
    6000,
    !mock && binding !== null && slot !== null
  );
  const dispute = mock ? MOCK_DISPUTE : disputesQuery.data?.[0] ?? null;

  const proofQuery = usePoll(
    useCallback(async (): Promise<ProofEntry[]> => {
      if (bond === null) return [];
      if (mock) {
        return [
          {
            label: "Vault before",
            value: MOCK_RESOLVE.before.toString(),
            kind: "amount",
          },
          {
            label: "Claim refunded",
            value: MOCK_RESOLVE.refund.toString(),
            kind: "amount",
          },
          {
            label: "Penalty + fee to backstop",
            value: (MOCK_RESOLVE.penalty + MOCK_RESOLVE.fee).toString(),
            kind: "amount",
          },
          {
            label: "Vault after",
            value: MOCK_RESOLVE.after.toString(),
            kind: "amount",
          },
        ];
      }
      const entries: ProofEntry[] = [];
      const vault = vaultFor(bond.address, bond.mint);
      const bal = await getTokenBalance(conn, vault);
      if (bal !== null) {
        entries.push({
          label: "Vault balance",
          value: bal.toString(),
          kind: "amount",
        });
      }
      const sigs = await getSignatures(conn, new PublicKey(bond.address), 5);
      for (const [i, s] of sigs.entries()) {
        entries.push({ label: `Bond tx ${i + 1}`, value: s, kind: "tx" });
      }
      return entries;
    }, [conn, mock, bond]),
    15000,
    bond !== null
  );

  const nextNonce =
    bond === null ? 1n : (bindingsQuery.data?.[0]?.lastNonce ?? 0n) + 1n;

  return (
    <main className="pb-20">
      <StatusHeader demoData={mock} />
      <Container>
        <div className="py-8 md:py-12">
          <p className="text-[13px] font-medium uppercase tracking-[0.04em] text-muted">
            Mission control {mock && "· demo data"}
          </p>
          <h1 className="mt-2 max-w-[20ch] font-display text-[40px] font-medium leading-[105%] tracking-[-0.02em] md:text-[64px]">
            Watch an API fail — and the bond pay out.
          </h1>
        </div>
        <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
          <div className="space-y-6">
            <ReceiptFeed
              receipts={shownReceipts}
              channel={mock ? null : channel}
            />
            <KillButton />
            <DisputeCard dispute={dispute} slot={slot} />
            {bond !== null && binding !== null && (
              <OpenDisputeButton
                bond={bond.address}
                binding={binding.address}
                channel={binding.channel}
                mint={bond.mint}
                nextNonce={mock ? 4n : nextNonce}
              />
            )}
          </div>
          <div className="space-y-6">
            <BondCard
              bond={bond}
              error={bondQuery.error}
              loaded={bondQuery.updatedAt !== null}
              onRetry={() => window.location.reload()}
            />
            <ProofPanel entries={proofQuery.data ?? []} />
          </div>
        </div>
      </Container>
    </main>
  );
}
