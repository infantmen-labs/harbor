# Localnet upstream fixture pair (NOT for devnet/mainnet)

- `payment_channels.local.so` — `solana-foundation/payment-channels`
  @ `3ffa4d67`, source-built with ONLY the declare ID changed to the
  keypair below. Program ID: `8g1PkcJovA978mCpFQL9cKYLRoGPQLoZLdY83BxbvK7f`.
- `local-chnl.json` — throwaway keypair matching that declare ID.
  Localnet-only, holds no value on any other cluster. Regenerate both
  together (never mix a new keypair with this .so): see "Upstream
  fixture build" in `docs/proof-bundle.md`.

`scripts/local-loop.sh` defaults to this pair — fresh clones run with no
env. Override with `UPSTREAM_SO` / `UPSTREAM_KEYPAIR` for your own build.

Do NOT use these on devnet: devnet runs the genuine SF deployment at the
canonical `CHNLxYvVA28MJP9PrFuDXccuoGXAx7jBacfLEkahyGsX` (see
`docs/upstream-pin.md`).
