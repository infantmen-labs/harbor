import { readFileSync } from "node:fs";
// NOTE: named imports only — Turbopack 16.3.6 hangs compiling the
// default `node:path` import in route graphs (bisected 2026-10-05).
import { join as joinPath, resolve as resolvePath } from "node:path";
import { getDocPage, type DocPage } from "./docs-nav";

export type { DocPage };

function repoRoot(): string {
  // Monorepo: the web workspace builds with cwd = code/web.
  return resolvePath(process.cwd(), "..");
}

export function getDocMarkdown(slug: string): {
  page: DocPage;
  markdown: string;
} {
  const page = getDocPage(slug);
  try {
    const markdown = readFileSync(joinPath(repoRoot(), page.file), "utf8");
    return { page, markdown };
  } catch {
    // Missing source must FAIL the build (drift caught in CI),
    // never render a silent 404.
    throw new Error(`docs source missing: ${page.file} (route /docs/${slug})`);
  }
}
