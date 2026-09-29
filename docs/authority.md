# Upgrade authority — current state and multisig roadmap

## Current state (devnet, v0.2.0)

The Harbor program (`BuRyKLqCsTLcyLVFEjxTjmF4DryCT3LmVDjwqhduvB4H`) is
upgradeable under a single-key authority:
`GQyf8wvGfpaLZvfvbXonpdiEfAGRvRXz2P6PkWxQ4rLJ`
(the demo merchant key, held offline in `~/.config/solana/id.json`).

This is disclosed, not hidden: the program owns every bond-vault PDA as
its signer, so a malicious upgrade could reassign vault authority and
drain collateral. On devnet with demo funds this is accepted risk. It
must change before any real collateral exists.

## Multisig roadmap (pre-mainnet gate)

1. Stand up a 2-of-3 Squid multisig (founder + two independent signers;
   hardware-held).
2. Rotate the program upgrade authority to the multisig
   (`solana program set-upgrade-authority --new-upgrade-authority <msig>`),
   verified onchain via `solana program show`.
3. Publish the rotation signature + multisig address here and in
   `docs/proof-bundle.md`.
4. Incident plan: any suspected authority compromise → rotate to a fresh
   multisig immediately; halt new bonds via social coordination (no
   onchain pause exists by design); disclose within 24h.

## Treasury withdrawals use the same key

`withdraw_treasury` (v0.3.0) moves accumulated fee + penalty funds only
on the upgrade authority's signature, read from the programdata
account. This introduces no new trust — the key could already drain
vaults via upgrade — and keeps backstop funds governable instead of
stranded. Until the multisig rotation above, treasury movements are
visible onchain within one signature of the disclosed key.

## Why not yet

Multisig rotation on devnet buys judging optics but costs a migration
cycle (new authority → re-verify upgrade path) against a deadline. The
honest claim today: single-key devnet authority, multisig before
mainnet, no real funds until then.
