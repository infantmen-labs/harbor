# Proof Bundle — full loop on localnet + devnet deployment

## Devnet deployment (live)

- Program `BuRyKLqCsTLcyLVFEjxTjmF4DryCT3LmVDjwqhduvB4H`, deployed slot
  503109261, 370,464 bytes, upgrade authority
  `GQyf8wvGfpaLZvfvbXonpdiEfAGRvRXz2P6PkWxQ4rLJ`.
- Deploy sig `64x8VfdoYR7kbQitj1kBHTbSakuh3nyxHzcGwDdpBkanpcGgs4bV9A`.
- IDL published via the Program Metadata Program
  (`anchor idl init`, verified with `anchor idl fetch`).
- Upload path that worked: custom resumable uploader
  (`server/scripts/upload-buffer.ts`) — sliced reads (QuickNode 413s
  full-account fetches), bincode Write layout, InitializeBuffer on fresh
  buffers, DeployWithMaxDataLen finalize. Stock tooling failed on both
  public RPC (write attrition) and QuickNode (413s).

## Localnet loop

Validator: `solana-test-validator` (Agave 3.1.14), reset before the run.
Program ID: `BuRyKLqCsTLcyLVFEjxTjmF4DryCT3LmVDjwqhduvB4H`
(deployed slot 85, 370,464 bytes, upgrade authority
`GQyf8wvGfpaLZvfvbXonpdiEfAGRvRXz2P6PkWxQ4rLJ`).

Upstream channel program on localnet: source-built from pinned commit
`3ffa4d67` with a local declare ID
(`7EQY39s1mXBjSVgPTpTE5TwVXG95XezutJD72oxTLMBg`). Mainnet/devnet use the
canonical `CHNLxYvVA28MJP9PrFuDXccuoGXAx7jBacfLEkahyGsX` (same ID on every
cluster; cluster features only change the treasury owner). Lesson learned:
the upstream program derives PDAs from its own ID, so binaries cannot be
re-addressed with a hex patch — build from source for non-canonical IDs.

## Mint

- Test mint `8naTPRBsHMbnhFWXFgK7EGqAYvR5HGqBoucsJspLiXpZ` (6 decimals).
- Merchant fund sig `wcarUmqv4Jz4m1dTudzT6giNDd97t4tC7BHAtejjo9W1rjddwd3X6LL19ZLNujkcqQH2Y6G4iFVbo3iBAVTHMFp`
- Agent fund sig `hp31c2kGhXLbkxzVMJd5x6U1R4F8oBoLRfPC5Kcsxz3nFXiK58XxoPXkpiTCbKBxNB4JFt18JVYHr1uP73AyH8b`
- Claimant fund sig `5gBhF2f49VdYXV9ZEZhezeA2BWyCQcPYLPaQdW3QdLpw4aBWbWUbWBmupR2Cv4hXtU5tg6XDCdVVjhQwByHFvdX1`

## Bond

- `register` + `post_bond` 500,000 via `server/scripts/setup.js`.
- Bond `ELDGtssWRaY9kDKsXSoDwMTR2vCW81RdSQU78EaP9PCC`
- Vault `GRVP5MTbXyvcp6TTfV4x1XpfvRRBR9X9p77p5HXhRdg9`

## Happy path

- Channel `4qrnGaywKW6EQaBtGYitqGwBUYdQHZP1VUVJyUhSeENa`, 8 metered
  completions, all receipts verified against the merchant key, cooperative
  upstream `settle` at close.
- Sample receipt (nonce 2): binding
  `4XAKohgnA4eiEURVdsDygbThLnTE8yZT6mXWLvB7mPrB`, cumulativeSpend 2580,
  retrievable at `GET /receipt/<channel>/2`.

## Fail path

- Channel `AntYGEKiXCKiKDgUx6PidH3QuxSbsGe5rS1YUrx7M1TB`, request 1 →
  `500 {"error":"delivery failed: upstream fault injected"}`, no receipt
  stored (`GET /receipt/.../1` → 404), settle skipped.
- Binding `HuzLMKJZeboM1vEKGnrMg4PAoqj8i6JcbQzwLqaxRi1X`
- Dispute `HNEFAzn82cmVodwiyz3jWxC6oy8WniL6krYt54rzbDuu` (nonce 1, TIMEOUT),
  open sig `2NFdYuksPhhcqv65FPapq6j6Fgz5LjhqBV3CNgLLJfyV3Go1bpGwP2g5yn6Vy32af1Mu4RgkZcac3H9RK8qN5xeu`
- Keeper live `RUN_ONCE=1` → `resolve-timeout`, sig
  `a2aZ6sVwQtPc4osRbXBWsbeDZ5ixDxge5XR6VpFC8LmaqwoDRKUF31YyDs2npo245Jqa3py2oT7dnZpBvKtjsbH`
  (slot 28320, past the 150-slot window).

## Settlement math (verified live at slot ~28362)

- Slash = min(500,000, 200,000 × 50 / 10,000) = 1,000.
- Vault `GRVP...`: 499,000. Claimant ATA `H6jDiovH...`: 101,000
  (100,000 minted + 1,000 slash).
- Upstream escrow untouched by Harbor paths (proven in
  `test_channel_compose` with escrow-intact assertion).

## Notes

- This validator ran without transaction-history retention, so past
  signatures are proven by broadcast receipts + live state, not by
  re-query. Re-run the video pass with history enabled.
- Devnet program deploy is pending (public RPC write instability; see
  roadmap). All flows above are RPC-independent and replay 1:1 on devnet.
