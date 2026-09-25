/**
 * Mock dataset for `?mock=1`: the full fail-path story from proof-bundle
 * values, no network. Labeled "Demo data" wherever rendered.
 */
import type { BondStatus, DisputeStatus, Receipt } from "./types";

export const MOCK_SLOT = 28320n;

export const MOCK_BOND: BondStatus = {
  address: "ELDGtssWRaY9kDKsXSoDwMTR2vCW81RdSQU78EaP9PCC",
  merchant: "GQyf8wvGfpaLZvfvbXonpdiEfAGRvRXz2P6PkWxQ4rLJ",
  mint: "8naTPRBsHMbnhFWXFgK7EGqAYvR5HGqBoucsJspLiXpZ",
  amount: 500_000n,
  slaBps: 50,
  challengeSlots: 150n,
  openDisputes: 1n,
  lastChangeSlot: 100n,
};

export const MOCK_RECEIPTS: Receipt[] = [1n, 2n, 3n].map((n) => ({
  merchant: "GQyf8wvGfpaLZvfvbXonpdiEfAGRvRXz2P6PkWxQ4rLJ",
  binding: "HuzLMKJZeboM1vEKGnrMg4PAoqj8i6JcbQzwLqaxRi1X",
  cumulativeSpend: (Number(n) * 860).toString(),
  meterHash: "001a07ec2542fea4c28893cdbf8f2a36d7e361c1f2bc9f4cdec30baecb5a76b9",
  outputHash: "15879ccadfc828c6bc091d457b3b02e2ffc93a578ab2b146c81a0b5d8029f069",
  status: 0,
  nonce: n.toString(),
  expirySlot: String(2n ** 63n - 1n),
  signer: "GQyf8wvGfpaLZvfvbXonpdiEfAGRvRXz2P6PkWxQ4rLJ",
  signature: "demo-signature-" + n.toString(),
}));

export const MOCK_DISPUTE: DisputeStatus = {
  address: "HNEFAzn82cmVodwiyz3jWxC6oy8WniL6krYt54rzbDuu",
  binding: "HuzLMKJZeboM1vEKGnrMg4PAoqj8i6JcbQzwLqaxRi1X",
  nonce: 4n,
  reason: 1,
  claimant: "6ssgk8ZjaGJRxT4iPvyAga4fvG8K3X3ersgPd6CTdahi",
  deadlineSlot: MOCK_SLOT - 10n,
  state: "matured",
};

export const MOCK_SLASH = {
  before: 500_000n,
  slash: 1_000n,
  after: 499_000n,
};
