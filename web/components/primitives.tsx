import type { ReactNode } from "react";

export function Container({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-[1280px] px-5 md:px-8">{children}</div>
  );
}

export function Section({
  kicker,
  title,
  children,
}: {
  kicker?: string;
  title?: string;
  children: ReactNode;
}) {
  return (
    <section className="py-12 md:py-20">
      {(kicker !== undefined || title !== undefined) && (
        <div className="mb-8 md:mb-12">
          {kicker !== undefined && (
            <p className="text-[13px] font-medium uppercase tracking-[0.04em] text-muted">
              {kicker}
            </p>
          )}
          {title !== undefined && (
            <h2 className="mt-2 font-display text-[32px] md:text-[40px] font-medium leading-[110%] tracking-[-0.01em]">
              {title}
            </h2>
          )}
        </div>
      )}
      {children}
    </section>
  );
}

export function Card({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-[12px] border border-border bg-surface p-5 md:p-6">
      {children}
    </div>
  );
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-[12px] border border-border-subtle bg-background-secondary px-5 py-10 text-center">
      <p className="font-display text-[20px] font-medium">{title}</p>
      <p className="mt-2 text-[14px] text-muted">{body}</p>
    </div>
  );
}

export function ErrorBanner({
  error,
  onRetry,
}: {
  error: string;
  onRetry?: () => void;
}) {
  return (
    <div className="rounded-[12px] border border-error/30 bg-error-bg px-5 py-4 text-[14px]">
      <span className="font-medium text-error">Something went wrong. </span>
      <span className="text-foreground-secondary">{error}</span>
      {onRetry !== undefined && (
        <button
          onClick={onRetry}
          className="ml-3 font-medium text-error underline underline-offset-2"
        >
          Retry
        </button>
      )}
    </div>
  );
}

export function LoadingSkeleton() {
  return (
    <div className="animate-pulse rounded-[12px] border border-border-subtle bg-background-secondary p-5">
      <div className="h-5 w-1/3 rounded-[4px] bg-border-subtle" />
      <div className="mt-3 h-8 w-1/2 rounded-[4px] bg-border-subtle" />
    </div>
  );
}
