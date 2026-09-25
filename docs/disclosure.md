# Pre-existing Code Disclosure

Harbor original code: the Harbor program (`programs/harbor`), SDK, server,
agent, and keeper in this repository, written during the contest window.

Pre-existing / third-party code Harbor builds on (not ours, disclosed):

- `solana-foundation/payment-channels`, pinned commit
  `3ffa4d67`, mainnet program `CHNLxYvVA28MJP9PrFuDXccuoGXAx7jBacfLEkahyGsX`
  (same address on every cluster). Harbor composes with it read-only and
  never modifies it. Test fixture `payment_channels.so` is built from the
  pinned commit.
- Anchor 1.0 framework, Solana system / Tokenkeg / Associated Token
  programs, Ed25519 precompile — standard network programs.
- Open-source TS dependencies declared in each package manifest.

No outside capital, no acquired code, no undisclosed forks.
