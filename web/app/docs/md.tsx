"use client";

import { Children, isValidElement, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { headingId } from "@/lib/docs-nav";

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      aria-label={copied ? "Copied" : "Copy code"}
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      className="rounded-[6px] border border-border px-2 py-1 font-mono text-[12px] text-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent"
    >
      {copied ? "copied ✓" : "copy"}
    </button>
  );
}

function codeText(children: ReactNode): string {
  if (typeof children === "string") return children;
  if (Array.isArray(children)) return children.map(codeText).join("");
  return "";
}

export function Markdown({ source }: { source: string }) {
  return (
    <div className="docs-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1({ children }) {
            return (
              <h1 className="font-display text-[32px] font-medium tracking-[-0.01em] md:text-[40px]">
                {children}
              </h1>
            );
          },
          h2({ children }) {
            const text = codeText(children);
            return (
              <h2
                id={headingId(text)}
                className="mt-10 scroll-mt-20 font-display text-[24px] font-medium"
              >
                {children}
              </h2>
            );
          },
          h3({ children }) {
            return (
              <h3 className="mt-8 font-display text-[18px] font-medium">
                {children}
              </h3>
            );
          },
          p({ children }) {
            return (
              <p className="mt-4 max-w-[72ch] text-[16px] leading-[160%] text-foreground-secondary">
                {children}
              </p>
            );
          },
          a({ href, children }) {
            const external = href?.startsWith("http");
            return (
              <a
                href={href}
                {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
                className="text-accent underline underline-offset-2"
              >
                {children}
              </a>
            );
          },
          ul({ children }) {
            return (
              <ul className="mt-4 list-disc space-y-2 pl-6 text-[16px] text-foreground-secondary">
                {children}
              </ul>
            );
          },
          ol({ children }) {
            return (
              <ol className="mt-4 list-decimal space-y-2 pl-6 text-[16px] text-foreground-secondary">
                {children}
              </ol>
            );
          },
          li({ children }) {
            return <li className="leading-[160%]">{children}</li>;
          },
          table({ children }) {
            return (
              <div className="mt-4 overflow-x-auto rounded-[12px] border border-border">
                <table className="w-full text-[15px]">{children}</table>
              </div>
            );
          },
          th({ children }) {
            return (
              <th className="border-b border-border bg-surface px-4 py-3 text-left font-medium">
                {children}
              </th>
            );
          },
          td({ children }) {
            return (
              <td className="border-b border-border px-4 py-3 align-top text-foreground-secondary">
                {children}
              </td>
            );
          },
          blockquote({ children }) {
            return (
              <blockquote className="mt-4 border-l-2 border-accent pl-4 text-[16px] text-foreground-secondary">
                {children}
              </blockquote>
            );
          },
          pre({ children }) {
            const codeEl = Children.toArray(children)[0];
            const text = isValidElement<{ children?: ReactNode }>(codeEl)
              ? codeText(codeEl.props.children)
              : "";
            return (
              <div className="relative mt-4 rounded-[12px] border border-border bg-ink-bg p-5">
                <div className="absolute right-3 top-3 [&_button]:border-ink-inverse/20 [&_button]:text-ink-inverse/70">
                  <CopyButton text={text} />
                </div>
                <pre className="overflow-x-auto font-mono text-[13px] leading-[160%] text-ink-inverse">
                  {children}
                </pre>
              </div>
            );
          },
          code({ children, className }) {
            if (!className) {
              return (
                <code className="rounded-[4px] bg-surface px-1 py-0.5 font-mono text-[0.9em] text-foreground">
                  {children}
                </code>
              );
            }
            return <code className={className}>{children}</code>;
          },
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}
