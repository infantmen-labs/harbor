# Upstream Dependency Pin: Solana Payment Channels

Harbor composes with this program. It never forks or modifies it.

- Repository: `solana-foundation/payment-channels`
- Pinned commit: `3ffa4d6728ad88e4a9667a76ad9ccd68a302c696`
- Mainnet program ID: `CHNLxYvVA28MJP9PrFuDXccuoGXAx7jBacfLEkahyGsX`
- Devnet/testnet/localnet program ID: same address on every cluster
  (`declare_id!` is hardcoded; cluster build features only change the
  treasury owner, never the ID). Verified in program source.

## Channel model

- `open` creates a channel PDA and escrows a payer deposit (spending ceiling).
- Off-chain Ed25519 vouchers carry a cumulative authorized amount; newer supersedes older; settlement never exceeds the deposit.
- `settle` advances the on-chain settled watermark from the highest voucher (verified via Ed25519 precompile + Instructions sysvar).
- `settle_and_seal` / `seal` locks the final watermark.
- `distribute` pays out merchant share + refunds unused deposit + closes escrow.
- `request_close` starts a grace window; `reclaim` recovers after the window.
- `top_up` raises the ceiling mid-session; `withdraw_payer` releases payer funds once sealed.

## PDA seeds (exact)

`["channel", payer, payee, mint, authorized_signer, salt (le bytes), open_slot (le bytes)]`

`open_slot` makes every incarnation a new address; vouchers bind the incarnation via `channel_id` alone.

## Composition rules for Harbor

1. Harbor reads channel PDAs and binds to them; it never writes channel state.
2. A Harbor dispute must open BEFORE `settle_and_seal` for the affected channel.
3. Harbor never finalizes a binding while its dispute is open.
4. If the upstream program changes, the keeper aborts safely and the pin above is re-verified before any further settlement.
