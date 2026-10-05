/**
 * Single source of truth for every outbound project link on the landing
 * page. Fill in REPO_URL the moment the public repo exists — everything
 * else derives from it. Hidden while unconfigured (see REPO_CONFIGURED)
 * so no dead link ever ships. Nothing here is secret.
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
  receiptSchema: () => repoPath("docs/receipt-schema-v0.md"),
  uiContracts: () => repoPath("docs/ui-contracts.md"),
  proofBundle: () => repoPath("docs/proof-bundle.md"),
  authority: () => repoPath("docs/authority.md"),
  review: () => repoPath("docs/review.md"),
  deploy: () => repoPath("docs/deploy.md"),
  business: () => repoPath("docs/business.md"),
};
