import Link from "next/link";
import { DOC_GROUPS } from "@/lib/docs-nav";

export default function DocsHome() {
  return (
    <main
      id="main"
      className="mx-auto w-full max-w-[1280px] px-5 py-16 md:px-8"
    >
      <p className="text-[13px] font-medium uppercase tracking-[0.04em] text-muted">
        Documentation
      </p>
      <h1 className="mt-4 max-w-[20ch] font-display text-[32px] font-medium tracking-[-0.01em] md:text-[40px]">
        Bonded refunds, explained once and linked everywhere.
      </h1>
      <p className="mt-3 max-w-[60ch] text-[16px] leading-[150%] text-foreground-secondary">
        Start with the buyer quickstart — published SDK only, no clone — then
        read only what you need. Every page below renders from its source file
        in the repo — no forks, no stale copies.
      </p>
      <div className="mt-10 grid gap-10 md:grid-cols-2">
        {DOC_GROUPS.map((group) => (
          <section key={group.label} aria-label={group.label}>
            <h2 className="font-display text-[20px] font-medium">
              {group.label}
            </h2>
            <p className="mt-1 text-[14px] text-muted">
              {group.label === "Start" &&
                "Buy your first metered unit in minutes."}
              {group.label === "Operate" &&
                "Run the merchant and keeper sides in production."}
              {group.label === "Understand" &&
                "Why the mechanism is safe before you trust it."}
              {group.label === "Reference" &&
                "Exact layouts, builders, and release history."}
              {group.label === "Contribute" &&
                "Full-stack local setup for Harbor contributors."}
            </p>
            <ul className="mt-4 space-y-1">
              {group.pages.map((page) => (
                <li key={page.slug}>
                  <Link
                    href={`/docs/${page.slug}`}
                    className="block rounded-[8px] px-4 py-3 text-[16px] hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-accent"
                  >
                    {page.title}
                    <span aria-hidden="true" className="text-muted">
                      {" →"}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <p className="mt-10 font-mono text-[13px] text-muted">
        <Link
          href="/llms.txt"
          className="text-accent underline underline-offset-2"
        >
          llms.txt
        </Link>{" "}
        — the whole corpus as plain text, for agents.
      </p>
    </main>
  );
}
