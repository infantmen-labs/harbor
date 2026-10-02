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

### Upstream fixture build (localnet only)

```sh
git clone https://github.com/solana-foundation/payment-channels.git upstream-pc
cd upstream-pc
git checkout 3ffa4d6728ad88e4a9667a76ad9ccd68a302c696
solana-keygen new -o ~/.config/solana/local-chnl.json --no-bip39-passphrase
# Point the crate's declare_id! at the new keypair:
grep -rn "declare_id" program/payment_channels/src/ | head -3
# (edit the declare_id! line to `solana-keygen pubkey ~/.config/solana/local-chnl.json`)
cargo build-sbf --manifest-path program/payment_channels/Cargo.toml
# .so lands at target/deploy/payment_channels.so — pass it as UPSTREAM_SO,
# and the keypair as UPSTREAM_KEYPAIR. Default cargo features are fine for
# localnet (cluster TREASURY_OWNER gating only affects mainnet/devnet builds).
Note: this is NOT `programs/harbor/tests/fixtures/payment_channels.so` —
that fixture keeps the canonical declare ID (LiteSVM maps bytes at any
address, so it works there) and cannot be `solana program deploy`ed.
`scripts/fixtures/` already contains a build from the pin with a local
declare ID — rebuild only when the pin changes.
```

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
  - `refund_unused` closed (`2u2NkK8HPheREVQuRdrw9cM2dHryDugBXybgnuQLS6UgzZ6RgpkLYDyXLBGXtRGY5RHjL33BwEKoDcoAe2VNKV45`),
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

## v0.2.1 — payee-verified binding (live on devnet)

`bind_channel` now reads the upstream 256-byte Channel struct and
requires payee == binder on the bond's mint (first-to-bind squat dead;
garbage/closed/wrong-mint channels rejected). No account layout change,
so no state migration. Upgrade sig
`8GB9KDJrikaMYMG7oXQ1thNHfQNzLC9jG9s2EoL2ex8QnR31EMv4AsnwJsphbHFcsXdFEm2SDKRDVeACw8isn9d`
(slot 504611556, deep bytes verified, IDL republished).

The new check immediately caught a real demo-flow bug: the agent opened
channels with a random payee, so settled escrow never reached the
merchant. Fixed (`agent/src/index.ts`: payee = merchant) — the check
then passed against a live upstream channel on the next run.

- v0.2.1 devnet loop: happy channel `7WxRafmkZKpdhADgamF5PS1WxqewvkdEraVqqdaRazBg`
  (3 receipts, settled) → kill → fail channel
  `5RoJGcUgucWogJ3LCeZSoH98F7PiXRh6rLZntfjrEPX` → dispute
  `3dizXUwWmZKP5FJF4JLbY5ZY8W9URRukHNNHtjdsDxD8` (claim 2,500, open sig
  `4BawnxyBjrSNcF32GAJ8r8CoQ4CLzb4YqAP8Tn9M9Z648PGmixfNCpZWrbpX641P5ZyByaQxRpBv7GWSRE8kt3R2`)
  → keeper `resolve-timeout` sig
  `5EkvHDZdpB3dyN2FWB8CRQcW2LrHHHBd8Bsd8NR63cXVeoXDk2Np6xzMCRAZXBsdQadU5pEtzF6L4fFzBmyM4wD2`
  (slot 504613137).
- Math: fee = 125, refund = 2,375, penalty = 5,000. Bond `2G19xBTW…`:
  489,000, reserved 0. Claimant: 2,000,000,725 (−125 net). Treasury:
  11,275 (6,150 + 5,125).

## v0.3.0 — payer-bound claims, governed treasury (live on devnet)

`open_dispute` takes the channel account and requires its stored payer
== claimant (drive-by claims rejected); new `withdraw_treasury` gated
by the programdata upgrade authority. No account layout changes, so no
state migration. Upgrade sig
`31uj962tig5X2VVsPxn27UVx9Y4JX9f5Aetc1gVCMEQycRpNirFz3aCWFJyDwtgAGar9f1ZJ4VBAQBHFTKrQctfw`
(deep-byte verified, IDL republished with `channel` + `claim_spend` +
`withdraw_treasury` confirmed via fetch).

- v0.3.0 devnet loop (agent key as claimant = channel payer): happy
  channel `E8d3PSHkpAr27qooghGdtbL3F62uH3jMbJhCuS9wVVLk` (3 receipts,
  settled) → kill → fail channel
  `CucECNJqAryTN1PKiBE9Zidd49S7BFoQ4EsSfb8QHwZ5` → dispute
  `JAHXgqmqVAoXzCBXVet6WtgohQw6QsMm1EQjcrxDPnaW` (claim 2,000, open sig
  `3fXz7Cggkb454dpX87uGWQtW6Wz2kdFzhhdknVQfvQCVGpwf4rzb6MY7yMaafa2Np11AvNCz1hXuywg2h3oQFvSF`)
  → keeper `resolve-timeout` sig
  `346oQMQ2FVaurEEp6xWmACsWT55KzrrGj7WghB7kmNqfLJoQf7fbBosxkt6Kuhoo6er1tFSTK6WmNsTa1wKUBpG6`
  (slot 504976313).
- Math: fee = 100, refund = 1,900, penalty = 4,000. Bond `2G19xBTW…`:
  485,000, reserved 0. Treasury: 15,375 (11,275 + 4,100).
- v0.3.0 localnet loop on a fresh validator (rebuilt upstream fixture,
  new mint): claim 2,000 → bond 496,000, reserved 0, treasury 4,100,
  resolve sig `2HyPDbuQmEZdhPermgVHK6e1LA3UrC55Zt7Lo2ifLAgHcjoRvfnyCHpn5Tu8BD2GBw5PnLiL1tQvmgG7nUap8`.

## v0.4.0 — claim tombstone, arithmetic errors (live on devnet)

`open_dispute` inits a `claim` PDA `[CLAIM_SEED, binding, nonce]`
(claimant-paid, never closed) so resolved nonces can't re-claim; all
checked-arithmetic sites return `ArithmeticOverflow` instead of
unwrapping (whale claims error, never brick). Upgrade path hit a real
loader constraint worth recording: `ExtendProgram` refuses extensions
under 10,240 bytes, so the programdata was extended +20,480 first, then
upgraded. Upgrade sig
`64jzzwttzrcwVXttXbTfXJcUDJtZRW4gqbGc4wbJtmfHWH1KysvozgN9Yjs1Px5pX8EhenVvtbBHWi9Kk5BwV1ix`
(deep-byte verified, IDL republished with `claim` + `withdraw_treasury`
confirmed via fetch).

- v0.4.0 devnet loop (agent key as claimant = channel payer): happy
  channel `5uvr1JSVRAyQR27jscYXvkWUdR2w5MVtiZHYoxEPLRBS` (3 receipts,
  settled) → kill → fail channel
  `qu1LwbZmc527UgGPUvaUKh8BirQ4kbEUXSeEohGZcu5` → dispute
  `ZZJyDY4TNqLQ1cYoC1boa4AyUQnCA6Thdt4QgDxQiru` (claim 2,000, open sig
  `msTPYKGj8WasqawEFvtakYvKhEUHG6DhdVY9JdnYWJWGxayoWU2V6UpMZxnvtRxjKWHf8131gY679KsyUekLWZg`)
  → keeper `resolve-timeout` sig
  `4HAMcC8ofX6wMcyaU9imXv684TXHLS66DsWRmpMZ5koSAekH4M1EqT8FYvfCZQVPQSCRAckUVTse3yFbuwETSiqx`
  (slot 505642165).
- Math: fee = 100, refund = 1,900, penalty = 4,000. Bond `2G19xBTW…`:
  481,000, reserved 0. Treasury: 19,475 (15,375 + 4,100).
- v0.4.3 loop (server submits receipts onchain per request — 3 landed,
  zero silent failures): happy channel
  `EghyMvMbFdCLiz4dPX7GUoQNP3sYLorGJapw3Dk6FmWa` → kill → fail channel
  `5n3SYvcHY8W5aQSzapuztTGwDxua3zULx5CFbBuveVkw` → dispute
  `E2YQd3xijL8a882dJCDDFgNXX7FNGMKbuGo11KeyGMvv` (claim 2,000, open sig
  after agent refuel `5DJ1cojxVN7VS5bL75cwrRRQQmzsA2QZh1XEewUQSXrntSHzN1EepXnomsR3JRfTQx1df6WYMBiFriAj5yjrMfUh`)
  → keeper `resolve-timeout` sig
  `5hUd2zpYXmET2xZi5B9M7Fnirh46wEEoBJqZ4Qy1RTmTf3kSy3rV5B6eVrqZ2kxWzRY2D8WeeKikyAGCnnP2iJtR`
  (slot 505719456) → second loop same binary: dispute
  `4ZhHpyhNtGkswGtFTiLgtGbyYpDboX4Kf6FxoBNgtrtM`, resolve sig
  `3X4wrzwJVnjJ3pYBgZjRwQ77XUcqJ18z9wxbYBnqRcp1ptpdtewwgMyPJGrJWrpTMx1HsLpYvy1bpSygZ7iKGKgK`
  (slot 505757356). Bond `2G19xBTW…`: 469,000, reserved 0. Treasury:
  31,775 (27,675 + 4,100). Upgrade sig `28ijggmV…`, deep-byte verified.
- v0.4.0 localnet loop on the rebuilt validator: claim 2,000 → bond
  492,000, reserved 0, treasury 8,200, tombstone verified present after
  resolve; resolve sig `5Hpyigh73Y51N4w836ZhKcgdhEibnnBZRkg5qxRnewwXenRwP6sdqA9M4vb7YwLbmijPFbDmzKdTeg3e4bSRoGes`.

## v0.4.3 — canonical vaults, server escrow ceiling (live on devnet)

Audit pass closed two findings: `mint_guard::expected_vault_key` is now
checked first on every fund-moving path (a second token account naming
the bond PDA as owner can no longer divert locks — `InvalidVault`),
and the server reads the onchain channel deposit at session open plus
re-checks it above the cached ceiling per request (over-authorization
returns 402; top-ups learned lazily). Upgrade sig
`385jKYjgWR9H9tysW64eeE8zMnJDznkNY6VdCohYA3U4ic118zGUQS43vc4QQtuCUwPjrQcQXraEUH3D4FcaCAvK`
(deep-byte verified, IDL republished at 0.4.3).

- v0.4.3 devnet loop (agent key as claimant = channel payer): happy
  channel `9czCTa9J7Td5eNcWnxVTkJ3znHCss9sWjAuX5VPw2bTv` (3 receipts,
  settled) → kill → fail channel
  `5DhXVgZvajJoUt5LcFbF9mKyVKvnNSLBCNdYmtP7m5Vx` → dispute
  `D2qKsjBZ7GDyiV2ZiPod4AamnGY9Efyr4eHdWyeR78sQ` (claim 2,000, open sig
  `5DJ1cojxVN7VS5bL75cwrRRQQmzsA2QZh1XEewUQSXrntSHzN1EepXnomsR3JRfTQx1df6WYMBiFriAj5yjrMfUh`)
  → keeper `resolve-timeout` sig
  `3Q6QEU5h3UCuHg2KWEajYyvFtTHWSqi6fbCrygyyamN975JpouP2tPByF2bSLsn1G59ugN8qodviyGbN2c2W9nD9`
  (slot 505719456).
- Math: fee = 100, refund = 1,900, penalty = 4,000. Bond `2G19xBTW…`:
  473,000, reserved 0. Treasury: 27,675 (23,575 + 4,100).

## Tooling publication (live on npm)

- `harbor-sdk` was taken (n1colaslugo, unrelated API-auth SDK), so the
  package ships as `@infantmen-labs/harbor-sdk@0.3.0` (MIT, `files:
[dist]`, 21 files). Third-party proof: `examples/bond-watch` reads
  the live devnet bond with SDK + web3.js only — verified against the
  packed tarball pre-publish and the registry install post-publish.
- Root `yarn build` / `yarn test` orchestrate all workspaces in
  dependency order (caught a real fresh-clone gap: keeper/server
  resolved `harbor-log` types before it was built).

## Notes

- This validator ran without transaction-history retention, so past
  signatures are proven by broadcast receipts + live state, not by
  re-query. Re-run the video pass with history enabled.
- The devnet loop above replays the localnet flows 1:1 against the
  canonical programs; hosting runbook is `docs/deploy.md`.
