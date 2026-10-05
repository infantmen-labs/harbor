"use client";

import { useState } from "react";

/** Code block with language label + copy button. Ink theme, static. */
export function CodeBlock({ lang, code }: { lang: string; code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative mt-4 rounded-[12px] border border-border bg-ink-bg p-5 pt-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="font-mono text-[12px] text-ink-inverse/50">
          {lang}
        </span>
        <span className="[&_button]:border-ink-inverse/20 [&_button]:text-ink-inverse/70">
          <button
            type="button"
            aria-label={copied ? "Copied" : "Copy code"}
            onClick={() => {
              void navigator.clipboard.writeText(code).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              });
            }}
            className="rounded-[6px] border border-border px-2 py-1 font-mono text-[12px] text-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent"
          >
            {copied ? "copied ✓" : "copy"}
          </button>
        </span>
      </div>
      <pre className="overflow-x-auto font-mono text-[13px] leading-[160%] text-ink-inverse">
        <code>{code}</code>
      </pre>
    </div>
  );
}
