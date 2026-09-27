# Proof Bundle — full loop on localnet + devnet deployment + devnet loop

## Devnet deployment (live)

- Program `BuRyKLqCsTLcyLVFEjxTjmF4DryCT3LmVDjwqhduvB4H`, deployed slot
  503109261, 370,464 bytes, upgrade authority
  `GQyf8wvGfpaLZvfvbXonpdiEfAGRvRXz2P6PkWxQ4rLJ`.
- Deploy sig `64x8VfdoYR7kbQitj1kBHTbSakuh3nyxHzcGwDdpBkanpcGgs4bV9A`.
- Upgraded to the hardened build (manual vault creation, Tokenkeg-only
  gate) at a later slot, sig
  `3Eu28zcSpuyKdMMzFjapFvRWS2zBGARRJz3pL5sr7P6dB1HUBTAzejb6iGf7vq3ahg46tjSXbTi34eNpXsYM3xHz`
  (programdata head byte-verified against the new binary).
- IDL published via the Program Metadata Program
  (`anchor idl init`, verified with `anchor idl fetch`, upgraded after
  hardening).
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

## Devnet loop (live, canonical programs)

Programs: Harbor `BuRyKLqCsTLcyLVFEjxTjmF4DryCT3LmVDjwqhduvB4H`,
upstream channels `CHNLxYvVA28MJP9PrFuDXccuoGXAx7jBacfLEkahyGsX`
(deployed on devnet, executable). Demo served by a local
`server/dist/src/serve.js` pointed at devnet (Railway deploy per
`docs/deploy.md` reuses the same env contract).

- Mint `HDwpthFfTBi4YyGo1zgd7zxyonE5CZsCizpVqURHGD54` (6 decimals,
  tUSDC, mint authority = merchant).
- Merchant fund sig
  `5m6PsT5aLSejeNUikReqrrty6PAcaGC7NwgEHkqp98HTXYUezfRfHsx93b3B3LxuM2hT5iD49EhCPZ4kYfMQyAvK`,
  agent fund sig
  `5vwMc1saiS6rFoKvg3kxCBKK7wE7puFpcba25s29wfpUkCrs6qAG7YKeCaqtCP3ap7iSEZZ6nw8DH4bGLBbQRqg3`,
  claimant fund sig
  `9BDHotz8yKxd1XHeNYjJb92KdsY2xcY5ocgSqv2tWTzUrawUkEGiLTdHR1ncmn4VzpS9fQeimxtXg8NHJcDNv2v`
  (2,000,000,000 base units each).
- Bond `2G19xBTWXTYM8y6rQCs9ucMkQr36RDX1FucMf22jFLuP`, vault
  `3qJzdUXWvxcgUMCRnzhXmNYDDxsSDtBukWCvrtTfPmdj` — `register` + 500,000
  `post_bond` via `server/scripts/setup.js` (SLA 50 bps, 150 slots).
- Happy path: channel `926gYcXXimwoeQgfWvHHu6FsgtiiWR5r8L9gqSB7UBUP`, 3
  metered completions, cooperative upstream `settle` at 15000. Receipt
  nonce 2: binding `97NFfTgR6gBJzHzDvmSvJ5exR2iStNdAsAKPYMnEMsw`,
  cumulativeSpend 2930, served live from the demo server log.
- Fail path: channel `BU9h83GSWLR2nL9TzKvEUK12Liz6ufK6Zn4HeG94Myss`,
  request 1 → `500 {"error":"delivery failed: upstream fault injected"}`,
  no receipt stored (404), settle skipped.
- Dispute `Bp8vPmPy5q4XmykNnek2nWdRqi82opKew91Cpc8kYaoK` (nonce 1,
  TIMEOUT), open sig
  `4S4U8mrkVRS5th3eMEfhjdANrLWjAEt9gzco8bDZXMLSHpjQmoTBnmevsD3vKq3poi7E3C7jg9vCArdHWNvTsnVJ`.
- Keeper live `RUN_ONCE=1` with dedicated fee-payer operator
  `5gRRZXP18ZzUHB9Ud6vnnsAApgYXRVQxzXa2Uuf4f8en` →
  `resolve-timeout`, sig
  `4XTq8V3aGSZSXygDGVM9cMdFv7cYH841dGg1KwxowXJ7wLS95F3McVEkdSUVTZESXNHr5CboUQ5PwhSYsheQqY3Z`
  (slot 504490251, past the 150-slot window).
- Settlement math: slash = min(500,000, 200,000 × 50 / 10,000) = 1,000.
  Bond `2G19xBTW…`: 499,000, 0 open disputes. Claimant ATA
  `9KAVa6wtTnL8ZgHfvPM66B9M4tJJazdUfPERHJNhyF96`: 2,000,001,000
  (2,000,000,000 minted + 1,000 slash).

## v0.2.0 upgrade — claim-staked optimistic refunds (live)

Adjudication was redesigned: `resolve_delivered` removed (merchant-signed
receipts can never acquit), disputes lock the claim size, timeout resolve
refunds the claim minus 5% fee plus a 2x bond penalty to the backstop
treasury. Full spec in `docs/ui-contracts.md` Amendments (v0.2.0).

- Upgrade sig `mBoAh5w9JowXzFrusvqWW1A53qRta3xA9KoZJuY4gqp4hMmUTCWwpkwARZn3zuGiNNttrVRFXBGtvxsxVHbmaT8`
  (programdata head byte-verified against the new 363,248-byte binary;
  IDL republished and fetch-verified).
- Migration (no state carry-over by design): old devnet bond withdrawn
  + `refund_unused` closed (`2u2NkK8HPheREVQuRdrw9cM2dHryDugBXybgnuQLS6UgzZ6RgpkLYDyXLBGXtRGY5RHjL33BwEKoDcoAe2VNKV45`),
  then re-registered + 500,000 re-posted to the same PDA
  `2G19xBTWXTYM8y6rQCs9ucMkQr36RDX1FucMf22jFLuP`.
- v0.2 devnet loop: happy channel `3rD2hFGgyED4xuhaggWGWXFKCqReposwUUGvUiaNR99H`
  (3 receipts, settled 15000) → kill → fail channel
  `EhZv4fhkpCC8cPnmJUyrH3QmAxf4HK7NMHCDuhe3hZVp` → dispute
  `2BwogBLcY1z7T7V1PMzrBXYC1DPMu1NLjXFGU9PK4QCZ` (claim 3,000, open sig
  `3sC59qjNWpmWh9XZYWhbdemQCpyWhkzhWkGQkPqSHG6pbdhcff7LTMDMhnLAGwqZHeFNcPdX3d45kmJ6tepQ8wpW`)
  → keeper `resolve-timeout` sig
  `5MywkY1tkaTXbRTD3YUx37gqiwJXzT3HB5ai5D8En35tqLsSAMRxodtDUo4FVSPDiDKpA1U96LVbwVQmUUpg1oeW`
  (slot 504603399).
- Settlement math: fee = 150, refund = 2,850, penalty = 6,000.
  Bond `2G19xBTW…`: 494,000, reserved 0, 0 open disputes. Claimant ATA
  `9KAVa6wt…`: 2,000,000,850 (−150 net = the fee). Treasury
  `6150 = 150 + 6,000` (first treasury funding on any cluster).
- v0.2 localnet loop mirrored on the upgraded validator (bond
  `BFJL3aFj…` migrated the same way): claim 2,000 → bond 496,000,
  claimant +1,900 net, treasury 4,100, resolve sig
  `3LScqXLsRmKTSANuG4F1dV1SfDS9Dcm9s2xHaDew9PvWMBRQSNaaxZZiBYo7FWNkxMvNmStNnrdShhUai7HePuc7`.

## Notes

- This validator ran without transaction-history retention, so past
  signatures are proven by broadcast receipts + live state, not by
  re-query. Re-run the video pass with history enabled.
- The devnet loop above replays the localnet flows 1:1 against the
  canonical programs; hosting runbook is `docs/deploy.md`.
