"use client";

import { StatusHeader } from "@/components/header";
import { Container, Section } from "@/components/primitives";
import { ManageBond } from "@/components/manage";
import { OnboardStepper } from "@/components/merchant";
import { PROGRAM_ID } from "@/lib/env";
import { DOC_LINKS } from "@/lib/site";
import { shorten } from "@/components/explorer";

export default function Merchant() {
  const mint =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("mint") ?? ""
      : "";
  return (
    <main className="pb-20">
      <StatusHeader />
      <Container>
        <div className="py-8 md:py-12">
          <p className="text-[13px] font-medium uppercase tracking-[0.04em] text-muted">
            Production surface
          </p>
          <h1 className="mt-2 max-w-[20ch] font-display text-[40px] font-medium leading-[105%] tracking-[-0.02em] md:text-[64px]">
            Become a bonded merchant. No CLI.
          </h1>
          <p className="mt-4 max-w-[60ch] text-[16px] text-foreground-secondary">
            Connect a devnet wallet, register your SLA, fund the bond, and
            manage it — all signed in the browser. Channels bind automatically
            when agents open their first session.
          </p>
          <div className="mt-6 max-w-[80ch] rounded-[12px] border border-error/40 bg-surface p-4 text-[14px] leading-[150%]">
            <span className="font-medium text-error">Risk disclosure. </span>
            <span className="text-foreground-secondary">
              Program upgrades are controlled by a single key — which can
              reassign vault authority and drain all bonds. Do not bond real
              funds. Multisig rotation is planned before mainnet.{" "}
            </span>
            <a
              href={DOC_LINKS.authority()}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-[13px] text-accent underline underline-offset-2"
            >
              authority plan
            </a>
            <span className="font-mono text-[13px] text-muted">
              {" "}
              · program {shorten(PROGRAM_ID, 6)}
            </span>
          </div>
        </div>
        <Section>
          <div className="grid gap-6 lg:grid-cols-2">
            <OnboardStepper defaultMint={mint} />
            <ManageBond defaultMint={mint} />
          </div>
        </Section>
      </Container>
    </main>
  );
}
