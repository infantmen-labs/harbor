import { PROGRAM_ID, CHANNEL_PROGRAM_ID } from "@/lib/env";
import { explorerUrl, shorten } from "@/lib/explorer";
import {
  DOC_LINKS,
  INSTALL_CMD,
  NPM_URL,
  REPO_CONFIGURED,
  REPO_URL,
} from "@/lib/site";
import { getBondState } from "@/lib/bond";
import { Faq } from "./faq";
import { HeroMedia } from "./hero-media";

const SNIPPET = `import {
  bondPda, openChannelIx, receiptMessageBytes, verifyEd25519,
  suggestClaimSpend, openDisputeIx,
} from "@infantmen-labs/harbor-sdk";

// 1. Gate on collateral (offline), size the claim from chain
const [bond] = bondPda(merchant, mint);
const { claimSpend } = await suggestClaimSpend(
  connection, { binding, claimant, mint },
);

// 2. Verify every delivery before paying for the next unit
const msg = receiptMessageBytes({
  merchant, binding, cumulativeSpend, meterHash,
  outputHash, status, nonce, expirySlot, signer,
});
const ok = verifyEd25519(signer, msg, signature);

// 3. Claim-staked dispute when delivery fails:
//    locks claimSpend, caps the refund at the lock
const ix = openDisputeIx(
  programId, claimant, bond, binding, channel, dispute,
  claim, mint, claimantAta, vault, nonce, reason, claimSpend,
);`;

export default async function Landing() {
  const bond = await getBondState();
  return (
    <>
      <main id="main">
        <nav className="sticky top-0 z-10 border-b border-white/[0.08] bg-[#030303]/90 backdrop-blur-md">
          <div className="mx-auto flex w-full max-w-[1280px] items-center gap-x-6 px-5 py-4 md:px-12">
            <span className="font-display text-[15px] font-medium text-foreground">
              Harbor
            </span>
            <a
              href="#how"
              className="hidden text-[13px] text-muted transition-colors hover:text-foreground sm:inline"
            >
              How
            </a>
            <a
              href="#sdk"
              className="hidden text-[13px] text-muted transition-colors hover:text-foreground sm:inline"
            >
              SDK
            </a>
            <a
              href="#evidence"
              className="hidden text-[13px] text-muted transition-colors hover:text-foreground sm:inline"
            >
              Evidence
            </a>
            <a
              href="#faq"
              className="hidden text-[13px] text-muted transition-colors hover:text-foreground sm:inline"
            >
              FAQ
            </a>
            <a
              href="/docs"
              className="hidden text-[13px] text-muted transition-colors hover:text-foreground sm:inline"
            >
              Docs
            </a>
            <a
              href={NPM_URL}
              target="_blank"
              rel="noreferrer"
              className="ml-auto rounded-[8px] bg-foreground px-4 py-2 text-[14px] font-medium text-background hover:bg-accent hover:text-ink-bg"
            >
              {INSTALL_CMD}
            </a>
          </div>
        </nav>
        <section className="harbor-hero relative mx-auto flex min-h-[calc(100svh-57px)] w-full max-w-[1280px] items-center overflow-hidden border-x border-border px-5 pb-20 pt-24 md:px-12 md:pb-24 md:pt-20">
          <HeroMedia />
          <div
            className="harbor-hero-shade absolute inset-0"
            aria-hidden="true"
          />
          <div
            className="harbor-hero-grid absolute inset-0"
            aria-hidden="true"
          />
          <div className="relative z-[1] max-w-[760px]">
            <p className="flex items-center gap-3 font-mono text-[12px] font-medium uppercase tracking-[0.12em] text-muted md:text-[13px]">
              <span className="inline-block h-px w-8 bg-muted" />
              Developer infrastructure for bonded API payments
            </p>
            <h1 className="mt-7 max-w-[12ch] font-display text-[52px] font-medium leading-[0.94] tracking-[-0.045em] text-foreground md:text-[84px] lg:text-[96px]">
              Bonded optimistic refunds for agent API payments.
            </h1>
            <p className="mt-8 max-w-[48ch] text-[16px] leading-[1.55] text-foreground-secondary md:text-[18px]">
              Harbor is a bonded-refund layer for metered APIs: a Solana
              program, a TypeScript SDK, and a keeper. Merchants post a bond,
              agents pay through payment channels, and claims past the challenge
              window refund automatically — plus a penalty to the backstop.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <a
                href={NPM_URL}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-12 items-center rounded-full bg-foreground px-6 text-[14px] font-medium text-background transition-colors duration-200 hover:bg-accent hover:text-ink-bg"
              >
                {INSTALL_CMD} ↗
              </a>
              <a
                href="#bond"
                className="inline-flex min-h-12 items-center rounded-full border border-white/20 bg-white/[0.04] px-6 text-[14px] font-medium text-foreground transition-colors duration-200 hover:bg-white/[0.1]"
              >
                See the live bond ↓
              </a>
            </div>
          </div>
        </section>

        <section className="border-b border-border">
          <div className="mx-auto flex w-full max-w-[1280px] flex-wrap gap-x-14 gap-y-8 px-5 py-12 md:px-12">
            <div>
              <p className="font-display text-[28px] tracking-[-0.04em] text-foreground md:text-[34px]">
                Bonded
              </p>
              <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.08em] text-muted">
                merchant collateral
              </p>
            </div>
            <div>
              <p className="font-display text-[28px] tracking-[-0.04em] text-foreground md:text-[34px]">
                Onchain
              </p>
              <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.08em] text-muted">
                verifiable settlement
              </p>
            </div>
            <div>
              <p className="font-display text-[28px] tracking-[-0.04em] text-foreground md:text-[34px]">
                Automatic
              </p>
              <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.08em] text-muted">
                timeout refunds
              </p>
            </div>
          </div>
        </section>

        <section
          id="bond"
          className="harbor-scroll-reveal border-y border-border bg-background-secondary"
        >
          <div className="mx-auto grid w-full max-w-[1280px] grid-cols-2 gap-8 px-5 py-12 md:grid-cols-4 md:px-8">
            <BondMetric
              label="Bonded"
              value={bond.amount.toLocaleString("en-US")}
            />
            <BondMetric
              label="Reserved"
              value={bond.reserved.toLocaleString("en-US")}
            />
            <BondMetric
              label="Open disputes"
              value={bond.openDisputes.toString()}
            />
            <BondMetric
              label="Backstop treasury"
              value={bond.treasury.toLocaleString("en-US")}
            />
          </div>
          <p className="mx-auto w-full max-w-[1280px] px-5 pb-6 font-mono text-[13px] text-muted md:px-8">
            Amounts in base units (tUSDC · 6 decimals).{" "}
            {bond.stale ? (
              <>
                as of slot {bond.slot.toLocaleString("en-US")} (cached snapshot)
              </>
            ) : (
              <>
                live from devnet · as of slot{" "}
                {bond.slot.toLocaleString("en-US")} · refreshes hourly ·{" "}
                <a
                  href={explorerUrl("address", PROGRAM_ID)}
                  target="_blank"
                  rel="noreferrer"
                  className="text-accent underline underline-offset-2"
                >
                  verify on explorer
                </a>
              </>
            )}
          </p>
        </section>

        <section className="harbor-scroll-reveal border-b border-border bg-background-secondary">
          <div className="mx-auto grid w-full max-w-[1280px] grid-cols-2 gap-8 px-5 py-12 md:grid-cols-4 md:px-8">
            <HowMetric label="Claim 2000" value="Refund 1900 + burn 4000" />
            <HowMetric label="Reserve lock" value="6000 — exactly 3×" />
            <HowMetric label="Suites green" value="53 TS + 26 Rust" />
            <HowMetric label="Buyer-validated" value="Independent, live runs" />
          </div>
        </section>

        <section
          id="how"
          className="harbor-scroll-reveal mx-auto w-full max-w-[1280px] px-5 py-14 md:px-12 md:py-24"
        >
          <p className="text-[13px] font-medium uppercase tracking-[0.04em] text-muted">
            Integrate in an afternoon
          </p>
          <h2 className="mt-4 max-w-[20ch] font-display text-[32px] font-medium tracking-[-0.01em] md:text-[40px]">
            Three calls cover the whole lifecycle.
          </h2>
          <div className="mt-8 overflow-x-auto rounded-[12px] border border-border bg-ink-bg p-5">
            <pre className="font-mono text-[13px] leading-[160%] text-ink-inverse">
              {SNIPPET}
            </pre>
          </div>
          <div className="mt-12 grid gap-12">
            <HowRow
              n="01"
              title="Bond"
              body="The merchant locks stablecoin collateral as a performance guarantee — no legal contract, no account. The address derives offline; the health reads onchain."
              detail="bondPda(merchant, mint) → 2G19xBTW… · 463000 bonded"
            />
            <HowRow
              n="02"
              title="Pay against receipts"
              body="The agent streams cumulative vouchers through a payment channel. Every served unit returns a signed delivery receipt — the next unit is paid for only after the previous receipt verifies."
              detail="cumulativeSpend: 15000 · verifyEd25519 → true"
              flip
            />
            <HowRow
              n="03"
              title="Refund on failure"
              body="A missed deadline opens a dispute backed by a locked claim sized from chain. Nobody judges it: past the challenge window the claim auto-refunds 95% and burns 2x from the bond."
              detail="claim 2000 → refund 1900 · burn 4000"
            />
          </div>
        </section>

        <section
          id="sdk"
          className="harbor-scroll-reveal border-y border-border bg-background-secondary"
        >
          <div className="harbor-scroll-reveal mx-auto w-full max-w-[1280px] px-5 py-14 md:px-12 md:py-24">
            <p className="text-[13px] font-medium uppercase tracking-[0.04em] text-muted">
              What ships in the SDK
            </p>
            {/* Source links via unpkg .d.ts (registry, live today). The
              keeper card links to /docs/keeper instead — the operator
              guide is what a watchtower runner needs first. Bump the
              pinned SDK version per release. */}
            <div className="mt-8 grid gap-6 md:grid-cols-2">
              <SdkCard
                title="PDA helpers"
                body="bondPda · bindingPda · disputePda · receiptPda · treasuryPda. Every address is derivable offline — no RPC call to start."
                href="https://unpkg.com/@infantmen-labs/harbor-sdk@0.7.0/dist/src/pda.d.ts"
                path="sdk/src/pda.ts"
              />
              <SdkCard
                title="Instruction builders"
                body="register · post / top-up / withdraw · bind · openDispute · resolveTimeout. Typed args, correct account ordering, no Anchor client needed."
                href="https://unpkg.com/@infantmen-labs/harbor-sdk@0.7.0/dist/src/harbor-ix.d.ts"
                path="sdk/src/harbor-ix.ts"
              />
              <SdkCard
                title="Receipt codec + verification"
                body="249-byte v1 receipt layout (mint + program domain separators; all v0 offsets unchanged), ed25519 sign/verify, upstream voucher bytes. The same bytes the program checks."
                href="https://unpkg.com/@infantmen-labs/harbor-sdk@0.7.0/dist/src/receipt.d.ts"
                path="sdk/src/receipt.ts"
              />
              <SdkCard
                title="Keeper adjudication"
                body="Timeout-only decide() plus exact-offset account parsers. Run your own watchtower in a dozen lines."
                href={`${REPO_URL}/tree/master/sdk/src/adjudicate.ts`}
                path="sdk/src/adjudicate.ts"
              />
              <SdkCard
                title="Buyer helpers"
                body="suggestClaimSpend sizes the safe claim from chain; assertVoucherCoversQuote enforces voucher ≥ quote. Upstream channel builders included."
                href="https://unpkg.com/@infantmen-labs/harbor-sdk@0.7.0/dist/src/buyer.d.ts"
                path="sdk/src/buyer.ts"
              />
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <a
                href={NPM_URL}
                target="_blank"
                rel="noreferrer"
                className="rounded-[8px] bg-foreground px-6 py-3 min-h-[48px] inline-flex items-center font-mono text-[15px] font-medium text-background hover:bg-accent hover:text-ink-bg"
              >
                {INSTALL_CMD}
              </a>
              <a
                href={DOC_LINKS.receiptSchema()}
                className="rounded-[8px] border border-border px-6 py-3 min-h-[48px] inline-flex items-center text-[15px] font-medium hover:bg-surface-hover"
              >
                Frozen receipt schema
              </a>
            </div>
          </div>
        </section>

        <section className="harbor-scroll-reveal mx-auto w-full max-w-[1280px] px-5 py-14 md:px-12 md:py-24">
          <p className="text-[13px] font-medium uppercase tracking-[0.04em] text-muted">
            Cost model
          </p>
          <h2 className="mt-4 max-w-[20ch] font-display text-[32px] font-medium tracking-[-0.01em] md:text-[40px]">
            Priced in protocol, not in sales calls.
          </h2>
          <dl className="mt-8 grid gap-px overflow-hidden rounded-[12px] border border-border bg-border md:grid-cols-2">
            <CostRow
              term="Open a dispute"
              detail="0.01 SOL stake, returned on resolve, plus tx fees and payer-paid rent for the dispute and claim accounts."
            />
            <CostRow
              term="Resolve a dispute"
              detail="Claimant +95%. Backstop treasury +5% fee and 2x penalty, paid from the bond. No judge, no invoice."
            />
            <CostRow
              term="Fabricate a claim"
              detail="Nets −5% − fees − rent at every scale: the refund can never exceed the locked claim."
            />
            <CostRow
              term="Happy path"
              detail="Voucher + settle transaction fees only. Receipt accounts cost rent, paid by the payer."
            />
          </dl>
        </section>

        <section
          id="evidence"
          className="harbor-scroll-reveal mx-auto w-full max-w-[1280px] px-5 pb-20 pt-16 md:px-8 md:pt-24 md:pb-28"
        >
          <div className="border border-white/[0.1] bg-surface p-5 md:p-10">
            <h2 className="font-display text-[32px] font-medium tracking-[-0.01em] md:text-[40px]">
              Built for the adversarial case first.
            </h2>
            <p className="mt-3 max-w-[60ch] text-[16px] text-foreground-secondary">
              Every other agent-payments demo shows the happy path. Harbor
              starts with the failure: kill the API mid-job and watch the bond
              pay its side bet — 95% of the locked claim back, 2x burned from
              the bond. The upstream escrow settles to the merchant regardless;
              the bond never touches it. Two pools, stated plainly.
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
                  className="text-accent underline underline-offset-2"
                >
                  every sig, reproduced
                </a>
              </p>
              <p>
                authority + risks{" "}
                <a
                  href={DOC_LINKS.authority()}
                  className="text-accent underline underline-offset-2"
                >
                  disclosed, not hidden
                </a>
              </p>
              <p>
                settle-then-dispute{" "}
                <a
                  href={DOC_LINKS.review()}
                  className="text-accent underline underline-offset-2"
                >
                  proven by an independent buyer
                </a>
              </p>
              <p>
                escrow reclaim{" "}
                <a
                  href={DOC_LINKS.proofBundle()}
                  className="text-accent underline underline-offset-2"
                >
                  28 devnet escrows closed, exact
                </a>
              </p>
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <a
                href={explorerUrl("address", PROGRAM_ID)}
                target="_blank"
                rel="noreferrer"
                className="rounded-[8px] bg-foreground px-6 py-3 min-h-[48px] inline-flex items-center text-[15px] font-medium text-background hover:bg-accent hover:text-ink-bg"
              >
                Program on explorer ↗
              </a>
            </div>
          </div>
        </section>

        <section
          id="faq"
          className="harbor-scroll-reveal mx-auto w-full max-w-[1280px] px-5 pb-20 md:px-8 md:pb-28"
        >
          <p className="text-[13px] font-medium uppercase tracking-[0.04em] text-muted">
            Objections, answered
          </p>
          <h2 className="mt-4 max-w-[20ch] font-display text-[32px] font-medium tracking-[-0.01em] md:text-[40px]">
            Asked by skeptics, answered with mechanism.
          </h2>
          <div className="mt-8 max-w-[768px]">
            <Faq />
          </div>
        </section>

        <section className="harbor-scroll-reveal border-t border-border bg-background-secondary">
          <div className="harbor-scroll-reveal mx-auto w-full max-w-[1280px] px-5 py-14 md:px-12 md:py-24">
            <h2 className="max-w-[20ch] font-display text-[32px] font-medium tracking-[-0.01em] md:text-[40px]">
              Bond your first merchant endpoint this afternoon.
            </h2>
            <p className="mt-3 max-w-[52ch] text-[16px] leading-[150%] text-foreground-secondary">
              Install the SDK, point it at the devnet bond, and run the loop.
              The collateral is already there.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <a
                href={NPM_URL}
                target="_blank"
                rel="noreferrer"
                className="rounded-[8px] bg-foreground px-6 py-3 min-h-[48px] inline-flex items-center font-mono text-[15px] font-medium text-background hover:bg-accent hover:text-ink-bg"
              >
                {INSTALL_CMD} ↗
              </a>
              <a
                href="#how"
                className="rounded-[8px] border border-border bg-surface px-6 py-3 min-h-[48px] inline-flex items-center text-[15px] font-medium hover:bg-surface-hover"
              >
                See how it works ↑
              </a>
              <a
                href="/docs#endpoint"
                className="rounded-[8px] border border-border bg-surface px-6 py-3 min-h-[48px] inline-flex items-center text-[15px] font-medium hover:bg-surface-hover"
              >
                Live demo endpoint →
              </a>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex w-full max-w-[1280px] flex-col items-start gap-4 px-5 py-7 font-mono text-[12px] text-muted sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-6 sm:gap-y-2 md:px-12">
          <span className="font-display text-[15px] font-medium text-foreground">
            Harbor
          </span>
          {REPO_CONFIGURED && (
            <a
              href={REPO_URL}
              target="_blank"
              rel="noreferrer"
              className="hover:text-foreground"
            >
              GitHub
            </a>
          )}
          <a
            href={NPM_URL}
            target="_blank"
            rel="noreferrer"
            className="hover:text-foreground"
          >
            npm
          </a>
          <a href={DOC_LINKS.uiContracts()} className="hover:text-foreground">
            Contracts
          </a>
          <a href={DOC_LINKS.review()} className="hover:text-foreground">
            Security review
          </a>
          <a href={DOC_LINKS.authority()} className="hover:text-foreground">
            Single-key devnet authority — no real funds
          </a>
          <span className="ml-auto">MIT · devnet demo funds only</span>
        </div>
      </footer>
    </>
  );
}

function CostRow({ term, detail }: { term: string; detail: string }) {
  return (
    <div className="bg-background px-6 py-5">
      <dt className="font-display text-[18px] font-medium">{term}</dt>
      <dd className="mt-1 text-[15px] leading-[150%] text-foreground-secondary">
        {detail}
      </dd>
    </div>
  );
}

function BondMetric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[13px] font-medium uppercase tracking-[0.04em] text-muted">
        {label}
      </p>
      <p className="mt-2 font-mono text-[24px] md:text-[30px]">{value}</p>
    </div>
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

function HowRow({
  n,
  title,
  body,
  detail,
  flip,
}: {
  n: string;
  title: string;
  body: string;
  detail: string;
  flip?: boolean;
}) {
  return (
    <div className="grid items-center gap-6 md:grid-cols-2">
      <div className={flip ? "md:order-2" : undefined}>
        <p className="font-mono text-[13px] text-muted">{n}</p>
        <h3 className="mt-3 font-display text-[24px] font-medium md:text-[30px]">
          {title}
        </h3>
        <p className="mt-2 max-w-[52ch] text-[16px] leading-[160%] text-foreground-secondary">
          {body}
        </p>
      </div>
      <div className={flip ? "md:order-1" : undefined}>
        <p className="overflow-x-auto rounded-[12px] border border-border bg-surface p-5 font-mono text-[13px] leading-[160%] text-foreground">
          {detail}
        </p>
      </div>
    </div>
  );
}

function SdkCard({
  title,
  body,
  href,
  path,
}: {
  title: string;
  body: string;
  href: string;
  path?: string;
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
        {path ?? href.replace("https://", "").split("/").slice(1, 4).join("/")}
      </p>
    </a>
  );
}
