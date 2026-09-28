import Link from "next/link";
import { PROGRAM_ID, CHANNEL_PROGRAM_ID } from "@/lib/env";
import { explorerUrl, shorten } from "@/lib/explorer";
import { DOC_LINKS, INSTALL_CMD, NPM_URL, REPO_URL } from "@/lib/site";

const SNIPPET = `import {
  bondPda, openDisputeIx, receiptMessageBytes, verifyEd25519,
} from "@infantmen-labs/harbor-sdk";

// 1. Locate the merchant's bond (derived, no fetch needed)
const [bond] = bondPda(merchant, mint);

// 2. Verify every delivery offchain before paying for the next unit
const msg = receiptMessageBytes({
  merchant, binding, cumulativeSpend, meterHash,
  outputHash, status, nonce, expirySlot, signer,
});
const ok = verifyEd25519(signer, msg, signature);

// 3. Claim-staked dispute when delivery fails:
//    locks S from your wallet, caps the refund at S
const ix = openDisputeIx(
  programId, claimant, bond, binding, dispute,
  mint, claimantAta, vault, nonce, reason, claimSpend,
);`;

export default function Landing() {
  return (
    <main>
      <section className="mx-auto w-full max-w-[1280px] px-5 pb-16 pt-20 md:px-8 md:pb-24 md:pt-28">
        <p className="text-[13px] font-medium uppercase tracking-[0.04em] text-muted">
          Developer infrastructure for bonded API payments
        </p>
        <h1 className="mt-4 max-w-[16ch] font-display text-[48px] font-medium leading-[100%] tracking-[-0.02em] md:text-[88px]">
          Bonded optimistic refunds for agent API payments.
        </h1>
        <p className="mt-6 max-w-[52ch] text-[17px] leading-[150%] text-foreground-secondary md:text-[18px]">
          Harbor is a bonded-refund layer for metered APIs: a Solana program, a
          TypeScript SDK, and a keeper. Merchants post a bond, agents pay
          through payment channels, and any claim past the challenge window
          refunds automatically — plus a penalty to the backstop. Receipts
          attest delivery offchain but never acquit onchain, by design. No
          chargebacks, no accounts, no judges.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Link
            href="/live"
            className="rounded-[8px] bg-foreground px-6 py-3 text-[15px] font-medium text-background hover:opacity-90"
          >
            See it fail live
          </Link>
          <Link
            href="/merchant"
            className="rounded-[8px] border border-border bg-surface px-6 py-3 text-[15px] font-medium hover:bg-surface-hover"
          >
            Become a merchant
          </Link>
          <a
            href={REPO_URL}
            target="_blank"
            rel="noreferrer"
            className="rounded-[8px] border border-border px-6 py-3 font-mono text-[15px] font-medium hover:bg-surface-hover"
          >
            GitHub ↗
          </a>
        </div>
        <div className="mt-6 max-w-[560px] overflow-x-auto rounded-[12px] border border-border bg-ink-bg p-4">
          <p className="font-mono text-[14px] text-ink-inverse">
            <span className="opacity-50">$ </span>
            {INSTALL_CMD}
            <span className="opacity-50"> ← publishing now</span>
          </p>
        </div>
      </section>

      <section className="border-y border-border bg-background-secondary">
        <div className="mx-auto grid w-full max-w-[1280px] grid-cols-2 gap-8 px-5 py-12 md:grid-cols-4 md:px-8">
          <HowMetric label="Mechanism" value="Bond → claim → refund" />
          <HowMetric label="Settlement" value="Payment channels" />
          <HowMetric label="Challenge window" value="150 slots" />
          <HowMetric label="Trust model" value="Collateral, not trust" />
        </div>
      </section>

      <section className="mx-auto w-full max-w-[1280px] px-5 py-16 md:px-8 md:py-24">
        <p className="text-[13px] font-medium uppercase tracking-[0.04em] text-muted">
          Integrate in an afternoon
        </p>
        <h2 className="mt-4 max-w-[20ch] font-display text-[32px] font-medium tracking-[-0.01em] md:text-[40px]">
          Three calls cover the whole lifecycle.
        </h2>
        <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_1fr]">
          <div className="overflow-x-auto rounded-[12px] border border-border bg-ink-bg p-5">
            <pre className="font-mono text-[13px] leading-[160%] text-ink-inverse">
              {SNIPPET}
            </pre>
          </div>
          <div className="grid content-start gap-6">
            <HowCard
              n="01"
              title="Bond"
              body="The merchant locks stablecoin collateral sized to its SLA. The bond is the performance guarantee — no legal contract, no account."
            />
            <HowCard
              n="02"
              title="Pay against receipts"
              body="The agent streams cumulative vouchers through a payment channel. Every served unit returns a signed delivery receipt the SDK verifies."
            />
            <HowCard
              n="03"
              title="Refund on failure"
              body="A missed deadline opens a dispute backed by a locked claim. Nobody judges it: past the challenge window the claim refunds to the agent and the bond pays a penalty to the backstop."
            />
          </div>
        </div>
      </section>

      <section className="border-y border-border bg-background-secondary">
        <div className="mx-auto w-full max-w-[1280px] px-5 py-16 md:px-8 md:py-24">
          <p className="text-[13px] font-medium uppercase tracking-[0.04em] text-muted">
            What ships in the SDK
          </p>
          <div className="mt-8 grid gap-6 md:grid-cols-2">
            <SdkCard
              title="PDA helpers"
              body="bondPda · bindingPda · disputePda · receiptPda · treasuryPda. Every address is derivable offline — no RPC call to start."
              href={`${REPO_URL}/tree/master/sdk/src/pda.ts`}
            />
            <SdkCard
              title="Instruction builders"
              body="register · post / top-up / withdraw · bind · openDispute · resolveTimeout. Typed args, correct account ordering, no Anchor client needed."
              href={`${REPO_URL}/tree/master/sdk/src/harbor-ix.ts`}
            />
            <SdkCard
              title="Receipt codec + verification"
              body="185-byte Borsh receipt layout (frozen), ed25519 sign/verify, upstream voucher bytes. The same bytes the program checks."
              href={`${REPO_URL}/tree/master/sdk/src/receipt.ts`}
            />
            <SdkCard
              title="Keeper adjudication"
              body="Timeout-only decide() plus exact-offset account parsers. Run your own watchtower in a dozen lines."
              href={`${REPO_URL}/tree/master/keeper/src/accounts.ts`}
            />
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <a
              href={NPM_URL}
              target="_blank"
              rel="noreferrer"
              className="rounded-[8px] bg-foreground px-6 py-3 font-mono text-[15px] font-medium text-background hover:opacity-90"
            >
              {INSTALL_CMD}
            </a>
            <a
              href={DOC_LINKS.receiptSchema()}
              target="_blank"
              rel="noreferrer"
              className="rounded-[8px] border border-border px-6 py-3 text-[15px] font-medium hover:bg-surface-hover"
            >
              Frozen receipt schema
            </a>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-[1280px] px-5 pb-20 pt-16 md:px-8 md:pt-24 md:pb-28">
        <div className="rounded-[16px] border border-border bg-surface p-6 md:p-10">
          <h2 className="font-display text-[32px] font-medium tracking-[-0.01em] md:text-[40px]">
            Built for the adversarial case first.
          </h2>
          <p className="mt-3 max-w-[60ch] text-[16px] text-foreground-secondary">
            Every other agent-payments demo shows the happy path. Harbor starts
            with the failure: kill the API mid-job and watch the bond make the
            agent whole.
          </p>
          <div className="mt-6 grid gap-3 font-mono text-[13px] text-muted md:grid-cols-2">
            <p>
              program{" "}
              <a
                href={explorerUrl("address", PROGRAM_ID)}
                target="_blank"
                rel="noreferrer"
                className="text-accent underline underline-offset-2"
              >
                {shorten(PROGRAM_ID, 8)}
              </a>
            </p>
            <p>
              channels{" "}
              <a
                href={explorerUrl("address", CHANNEL_PROGRAM_ID)}
                target="_blank"
                rel="noreferrer"
                className="text-accent underline underline-offset-2"
              >
                {shorten(CHANNEL_PROGRAM_ID, 8)}
              </a>
            </p>
            <p>
              proof bundle{" "}
              <a
                href={DOC_LINKS.proofBundle()}
                target="_blank"
                rel="noreferrer"
                className="text-accent underline underline-offset-2"
              >
                every sig, reproduced
              </a>
            </p>
            <p>
              authority + risks{" "}
              <a
                href={DOC_LINKS.authority()}
                target="_blank"
                rel="noreferrer"
                className="text-accent underline underline-offset-2"
              >
                disclosed, not hidden
              </a>
            </p>
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/live"
              className="rounded-[8px] bg-foreground px-6 py-3 text-[15px] font-medium text-background hover:opacity-90"
            >
              Open mission control
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="mx-auto flex w-full max-w-[1280px] flex-wrap items-center gap-x-6 gap-y-2 px-5 py-6 font-mono text-[13px] text-muted md:px-8">
          <span className="font-display text-[15px] font-bold text-foreground">
            Harbor
          </span>
          <a
            href={REPO_URL}
            target="_blank"
            rel="noreferrer"
            className="hover:text-foreground"
          >
            GitHub
          </a>
          <a
            href={NPM_URL}
            target="_blank"
            rel="noreferrer"
            className="hover:text-foreground"
          >
            npm
          </a>
          <a
            href={DOC_LINKS.uiContracts()}
            target="_blank"
            rel="noreferrer"
            className="hover:text-foreground"
          >
            Contracts
          </a>
          <a
            href={DOC_LINKS.review()}
            target="_blank"
            rel="noreferrer"
            className="hover:text-foreground"
          >
            Security review
          </a>
          <a
            href={DOC_LINKS.authority()}
            target="_blank"
            rel="noreferrer"
            className="hover:text-foreground"
          >
            Single-key devnet authority — no real funds
          </a>
          <span className="ml-auto">MIT · devnet demo funds only</span>
        </div>
      </footer>
    </main>
  );
}

function HowMetric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[13px] font-medium uppercase tracking-[0.04em] text-muted">
        {label}
      </p>
      <p className="mt-2 font-display text-[24px] font-medium md:text-[30px]">
        {value}
      </p>
    </div>
  );
}

function HowCard({
  n,
  title,
  body,
}: {
  n: string;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-[12px] border border-border bg-surface p-6">
      <p className="font-mono text-[13px] text-muted">{n}</p>
      <h3 className="mt-3 font-display text-[24px] font-medium">{title}</h3>
      <p className="mt-2 text-[15px] leading-[150%] text-foreground-secondary">
        {body}
      </p>
    </div>
  );
}

function SdkCard({
  title,
  body,
  href,
}: {
  title: string;
  body: string;
  href: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="block rounded-[12px] border border-border bg-surface p-6 transition-colors hover:border-muted"
    >
      <h3 className="font-display text-[24px] font-medium">{title} ↗</h3>
      <p className="mt-2 text-[15px] leading-[150%] text-foreground-secondary">
        {body}
      </p>
      <p className="mt-3 font-mono text-[13px] text-muted">
        {href.replace("https://", "").split("/").slice(1, 4).join("/")}
      </p>
    </a>
  );
}
