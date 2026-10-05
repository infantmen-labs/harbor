import Link from "next/link";
import { notFound } from "next/navigation";
import { DOC_GROUPS, allDocSlugs, docToc, prevNextDoc } from "@/lib/docs-nav";
import { getDocMarkdown } from "@/lib/docs";
import { Markdown } from "../md";

export function generateStaticParams(): Array<{ slug: string }> {
  return allDocSlugs().map((slug) => ({ slug }));
}

export default async function DocPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  let markdown: string;
  try {
    ({ markdown } = getDocMarkdown(slug));
  } catch {
    notFound();
  }
  const { prev, next } = prevNextDoc(slug);
  const toc = docToc(markdown!);

  return (
    <div className="mx-auto grid w-full max-w-[1280px] gap-10 px-5 py-12 md:px-8 lg:grid-cols-[240px_1fr_200px]">
      <nav aria-label="Documentation" className="hidden lg:block">
        <div className="sticky top-20 space-y-6">
          {DOC_GROUPS.map((group) => (
            <div key={group.label}>
              <p className="text-[13px] font-medium uppercase tracking-[0.04em] text-muted">
                {group.label}
              </p>
              <ul className="mt-2 space-y-1">
                {group.pages.map((page) => (
                  <li key={page.slug}>
                    <Link
                      href={`/docs/${page.slug}`}
                      aria-current={page.slug === slug ? "page" : undefined}
                      className={
                        page.slug === slug
                          ? "block rounded-[6px] bg-surface px-3 py-1.5 text-[14px] font-medium text-foreground"
                          : "block rounded-[6px] px-3 py-1.5 text-[14px] text-muted hover:text-foreground"
                      }
                    >
                      {page.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </nav>

      <main id="main" className="min-w-0">
        <Markdown source={markdown!} />
        <nav
          aria-label="Next steps"
          className="mt-12 grid gap-3 border-t border-border pt-6 md:grid-cols-2"
        >
          {prev ? (
            <Link
              href={`/docs/${prev.slug}`}
              className="rounded-[8px] border border-border px-5 py-4 hover:bg-surface-hover"
            >
              <span className="block font-mono text-[12px] text-muted">
                ← Previous
              </span>
              <span className="font-medium">{prev.title}</span>
            </Link>
          ) : (
            <span />
          )}
          {next ? (
            <Link
              href={`/docs/${next.slug}`}
              className="rounded-[8px] border border-border px-5 py-4 text-right hover:bg-surface-hover"
            >
              <span className="block font-mono text-[12px] text-muted">
                Next →
              </span>
              <span className="font-medium">{next.title}</span>
            </Link>
          ) : (
            <span />
          )}
        </nav>
      </main>

      <aside aria-label="On this page" className="hidden text-[14px] xl:block">
        <div className="sticky top-20">
          <p className="text-[13px] font-medium uppercase tracking-[0.04em] text-muted">
            On this page
          </p>
          <ul className="mt-2 space-y-1.5">
            {toc.map((entry) => (
              <li key={entry.id}>
                <a
                  href={`#${entry.id}`}
                  className="text-muted hover:text-foreground"
                >
                  {entry.text}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  );
}
