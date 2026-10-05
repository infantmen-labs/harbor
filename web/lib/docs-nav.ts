export interface DocPage {
  slug: string;
  title: string;
  /** Repo-root-relative source file. Single source of truth — the
   *  /docs route renders it verbatim, never a fork. */
  file: string;
  group: string;
}

const PAGES: DocPage[] = [
  {
    slug: "quickstart",
    title: "Quickstart",
    file: "docs/setup.md",
    group: "Start",
  },
  {
    slug: "deploy",
    title: "Deploy to production",
    file: "docs/deploy.md",
    group: "Operate",
  },
  {
    slug: "keeper",
    title: "Run the keeper",
    file: "keeper/README.md",
    group: "Operate",
  },
  {
    slug: "troubleshooting",
    title: "Troubleshooting",
    file: "docs/troubleshooting.md",
    group: "Operate",
  },
  {
    slug: "architecture",
    title: "Architecture",
    file: "docs/ARCHITECTURE.md",
    group: "Understand",
  },
  {
    slug: "authority",
    title: "Trust model",
    file: "docs/authority.md",
    group: "Understand",
  },
  {
    slug: "review",
    title: "Security review",
    file: "docs/review.md",
    group: "Understand",
  },
  {
    slug: "receipt-schema",
    title: "Receipt schema",
    file: "docs/receipt-schema-v0.md",
    group: "Reference",
  },
  {
    slug: "sdk",
    title: "SDK reference",
    file: "sdk/README.md",
    group: "Reference",
  },
  {
    slug: "changelog",
    title: "Changelog",
    file: "CHANGELOG.md",
    group: "Reference",
  },
];

export const DOC_GROUPS: Array<{ label: string; pages: DocPage[] }> = [
  { label: "Start", pages: PAGES.filter((p) => p.group === "Start") },
  { label: "Operate", pages: PAGES.filter((p) => p.group === "Operate") },
  {
    label: "Understand",
    pages: PAGES.filter((p) => p.group === "Understand"),
  },
  {
    label: "Reference",
    pages: PAGES.filter((p) => p.group === "Reference"),
  },
];

export function getDocPage(slug: string): DocPage {
  const page = PAGES.find((p) => p.slug === slug);
  if (!page) throw new Error(`unknown docs slug: ${slug}`);
  return page;
}

export function allDocSlugs(): string[] {
  return PAGES.map((p) => p.slug);
}

export function prevNextDoc(slug: string): {
  prev: DocPage | null;
  next: DocPage | null;
} {
  const i = PAGES.findIndex((p) => p.slug === slug);
  return {
    prev: i > 0 ? PAGES[i - 1]! : null,
    next: i < PAGES.length - 1 ? PAGES[i + 1]! : null,
  };
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function docToc(markdown: string): Array<{ id: string; text: string }> {
  return markdown
    .split("\n")
    .filter((line) => line.startsWith("## "))
    .map((line) => line.replace(/^##\s+/, "").replace(/`/g, ""))
    .map((text) => ({ id: slugify(text), text }));
}

export function headingId(text: string): string {
  return slugify(text.replace(/`/g, ""));
}
