import Link from "next/link";
import { PROGRAM_ID, CHANNEL_PROGRAM_ID } from "@/lib/env";
import { explorerUrl, shorten } from "@/lib/explorer";

export default function Landing() {
  return (
    <main>
      <section className="mx-auto w-full max-w-[1280px] px-5 pb-16 pt-20 md:px-8 md:pb-24 md:pt-28">
        <p className="text-[13px] font-medium uppercase tracking-[0.04em] text-muted">
          Surety for machine payments
        </p>
        <h1 className="mt-4 max-w-[16ch] font-display text-[48px] font-medium leading-[100%] tracking-[-0.02em] md:text-[88px]">
          Agents pay. Merchants prove delivery — or pay up.
        </h1>
        <p className="mt-6 max-w-[52ch] text-[17px] leading-[150%] text-foreground-secondary md:text-[18px]">
          Harbor is a bonded-refund layer for metered APIs. Merchants post a
          bond, agents pay through payment channels, and failed deliveries
          refund automatically from the bond — plus a penalty to the backstop.
          No chargebacks, no accounts, no acquittal path.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
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
          How it works
        </p>
        <div className="mt-8 grid gap-6 md:grid-cols-3">
          <HowCard
            n="01"
            title="Bond"
            body="The merchant locks stablecoin collateral sized to its SLA. The bond is the performance guarantee — no legal contract, no account."
          />
          <HowCard
            n="02"
            title="Pay against receipts"
            body="The agent streams cumulative vouchers through a payment channel. Every served unit returns a signed delivery receipt the UI verifies."
          />
          <HowCard
            n="03"
            title="Refund on failure"
            body="A missed deadline opens a dispute backed by a locked claim. Nobody judges it: past the challenge window the claim refunds to the agent and the bond pays a penalty to the backstop."
          />
        </div>
      </section>

      <section className="mx-auto w-full max-w-[1280px] px-5 pb-20 md:px-8 md:pb-28">
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
