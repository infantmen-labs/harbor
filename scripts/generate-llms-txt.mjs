#!/usr/bin/env node
// Generates web/public/llms.txt from the docs corpus (same page list as
// web/lib/docs-nav.ts — keep the two in sync when adding a docs page).
// Static file, not a route: avoids Turbopack route-graph issues and serves
// the conventional root path. Run before build (CI does).
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const PAGES = [
  // Keep in sync with web/lib/docs-nav.ts.
  {
    slug: "quickstart",
    title: "Buyer quickstart",
    file: "docs/buyer-quickstart.md",
  },
  { slug: "deploy", title: "Deploy to production", file: "docs/deploy.md" },
  { slug: "keeper", title: "Run the keeper", file: "keeper/README.md" },
  {
    slug: "troubleshooting",
    title: "Troubleshooting",
    file: "docs/troubleshooting.md",
  },
  { slug: "architecture", title: "Architecture", file: "docs/ARCHITECTURE.md" },
  { slug: "authority", title: "Trust model", file: "docs/authority.md" },
  { slug: "review", title: "Security review", file: "docs/review.md" },
  {
    slug: "receipt-schema",
    title: "Receipt schema",
    file: "docs/receipt-schema-v0.md",
  },
  { slug: "sdk", title: "SDK reference", file: "sdk/README.md" },
  { slug: "changelog", title: "Changelog", file: "CHANGELOG.md" },
  {
    slug: "local-development",
    title: "Local development",
    file: "docs/setup.md",
  },
];

const parts = PAGES.map(({ slug, title, file }) => {
  const markdown = readFileSync(path.join(ROOT, file), "utf8");
  return `# ${title} (/docs/${slug}, source: ${file})\n\n${markdown}`;
});
const body = [
  "# Harbor docs (llms.txt)",
  "Bonded optimistic refunds for agent API payments. Full corpus below.",
  ...parts,
].join("\n\n---\n\n");
mkdirSync(path.join(ROOT, "web/public"), { recursive: true });
writeFileSync(path.join(ROOT, "web/public/llms.txt"), body);
console.log(`llms.txt written (${PAGES.length} pages, ${body.length} chars)`);
