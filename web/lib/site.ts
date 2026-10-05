/**
 * Single source of truth for every project link on the landing page.
 *
 * Docs links are internal (/docs/*) — they render the repo source file
 * verbatim, so they never 404 and never drift. REPO_URL is only for the
 * GitHub buttons: it stays a placeholder until the repo is public, and
 * the landing hides those buttons while unconfigured (see
 * REPO_CONFIGURED) so no dead link ever ships. Nothing here is secret.
 */

// TODO(user): set the public repo URL (e.g. https://github.com/ORG/harbor).
export const REPO_URL = "https://github.com/REPO_URL_PENDING";

/** False while REPO_URL is still the placeholder — callers must hide
 *  repo links instead of rendering a 404. */
export const REPO_CONFIGURED = !REPO_URL.includes("REPO_URL_PENDING");

export const NPM_PACKAGE = "@infantmen-labs/harbor-sdk";
export const NPM_URL = `https://www.npmjs.com/package/${NPM_PACKAGE}`;

export const INSTALL_CMD = `npm i ${NPM_PACKAGE}`;

export function repoPath(path: string): string {
  return `${REPO_URL}/tree/master/${path}`;
}

export const DOC_LINKS = {
  receiptSchema: () => "/docs/receipt-schema",
  uiContracts: () => "/docs/ui-contracts",
  proofBundle: () => "/docs/proof-bundle",
  authority: () => "/docs/authority",
  review: () => "/docs/review",
  deploy: () => "/docs/deploy",
};
