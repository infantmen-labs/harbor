# bond-watch — third-party Harbor example

Read-only bond monitor built **only** on the published `@infantmen-labs/harbor-sdk` plus
`@solana/web3.js`. No repo code, no Anchor client, no wallet, no funds.

```sh
npm install
RPC_URL=https://api.devnet.solana.com BOND=<bond-address> node bond-watch.cjs
```

What it proves: PDAs derive offline (`bondPda`), onchain state decodes
with SDK parsers (`decodeBond`, `decodeDispute`), and a risk desk can
watch bonded/reserved/free collateral plus every open dispute countdown
without trusting Harbor's own dashboard.

Against the demo bond on devnet it prints the live amounts (see
`docs/proof-bundle.md` for the expected figures).
