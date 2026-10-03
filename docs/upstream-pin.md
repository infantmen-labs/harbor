# Upstream Dependency Pin: Solana Payment Channels

Harbor composes with this program. It never forks or modifies it.

- Repository: `solana-foundation/payment-channels`
- Pinned commit: `3ffa4d6728ad88e4a9667a76ad9ccd68a302c696`
- Mainnet program ID: `CHNLxYvVA28MJP9PrFuDXccuoGXAx7jBacfLEkahyGsX`
- Devnet/testnet/localnet program ID: same address on every cluster
  (`declare_id!` is hardcoded; cluster build features only change the
  treasury owner, never the ID). Verified in program source.
- Devnet deployment (verified live, Oct 2026): programdata
  `CghQXkmw2F6p1exMETiZdNeUx9QGraWsNZ4eom1Cuiw1`, upgrade authority
  `4zTeC5mVqWLruDexgU2mV66p9t5vCA9JyiZqdGDUspap` (Solana Foundation —
  not ours; none of our keypairs match, and the address is
  undeployable without its keypair). Harbor's offsets verified
  empirically against a real devnet channel (256B, disc 1 / ver 1 /
  status 0, payer@88 / payee@120 / mint@184 decode correctly).
- Devnet `TREASURY_OWNER` (build-time constant, not in the public
  source — devnet shows the sentinel with a TODO at the pin): also
  `4zTeC5mVqWLruDexgU2mV66p9t5vCA9JyiZqdGDUspap`. Mapped by
  offset-matching the world-readable programdata ELF against our
  sentinel-built fixture (byte-length-identical at 66,240; constant at
  fixture's sentinel offset), then proven live: `distribute` with
  `ATA(4zTeC5…, mint)` succeeds, with the sentinel and with the
  mainnet owner it fails `TreasuryAccountMismatch (0x961)`.

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
