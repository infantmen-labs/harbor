"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MOCK_SLASH = exports.MOCK_DISPUTE = exports.MOCK_RECEIPTS = exports.MOCK_BOND = exports.MOCK_SLOT = void 0;
exports.MOCK_SLOT = 28320n;
exports.MOCK_BOND = {
    address: "ELDGtssWRaY9kDKsXSoDwMTR2vCW81RdSQU78EaP9PCC",
    merchant: "GQyf8wvGfpaLZvfvbXonpdiEfAGRvRXz2P6PkWxQ4rLJ",
    mint: "8naTPRBsHMbnhFWXFgK7EGqAYvR5HGqBoucsJspLiXpZ",
    amount: 500000n,
    slaBps: 50,
    challengeSlots: 150n,
    openDisputes: 1n,
    lastChangeSlot: 100n,
};
exports.MOCK_RECEIPTS = [1n, 2n, 3n].map((n) => ({
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
exports.MOCK_DISPUTE = {
    address: "HNEFAzn82cmVodwiyz3jWxC6oy8WniL6krYt54rzbDuu",
    binding: "HuzLMKJZeboM1vEKGnrMg4PAoqj8i6JcbQzwLqaxRi1X",
    nonce: 4n,
    reason: 1,
    claimant: "6ssgk8ZjaGJRxT4iPvyAga4fvG8K3X3ersgPd6CTdahi",
    deadlineSlot: exports.MOCK_SLOT - 10n,
    state: "matured",
};
exports.MOCK_SLASH = {
    before: 500000n,
    slash: 1000n,
    after: 499000n,
};
