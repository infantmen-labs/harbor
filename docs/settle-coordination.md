# Settle Coordination: Harbor × Payment Channels

Upstream program (pinned commit `3ffa4d67`, same ID on every cluster):
`open` → vouchers → `settle` → `seal` / `settle_and_seal` → `distribute`
→ `reclaim`. Harbor never writes channel state.

## Upstream lifecycle

- `open`: creates the channel PDA
  (`["channel", payer, payee, mint, authorized_signer, salt, open_slot]`)
  and escrows the deposit in a channel-owned ATA. Commits to a distribution
  plan hash (zero recipients = payee takes all).
- `settle`: advances the settled watermark from the highest cumulative
  voucher (Ed25519 precompile + Instructions sysvar). Moves no funds.
- `seal` / `settle_and_seal`: locks the watermark. `settle_and_seal` can
  apply one final voucher atomically (option tag skips it).
- `distribute`: requires sealed. Reveals the recipient preimage (must hash
  to the committed digest), pays recipients/payee, refunds the payer,
  takes the treasury fee. Past the reclaim gate
  (`clock.slot > open_slot + OPEN_SLOT_WINDOW`) it deallocates the channel
  in the same instruction; inside the window it parks in `Distributed` for
  a later `reclaim`.
- `reclaim`: post-window cleanup of parked channels.

## Why no double-pay is possible

Harbor's bond vault (PDA-owned ATA) and the channel escrow (channel-owned
ATA) are disjoint pools under different authorities. A timeout slash moves
bond funds to the dispute claimant; a distribution moves escrow funds to
the payee/payer. Neither instruction can touch the other's pool, so slash
and distribute commute. Proven by `test_channel_compose`, which asserts the
channel escrow balance is unchanged after a Harbor slash.

## MVP policy (frozen)

1. A Harbor dispute SHOULD open before `settle_and_seal` for the best demo
   narrative, but safety never depends on ordering — the pools are disjoint.
2. Harbor never pauses or gates upstream `distribute`. It cannot (different
   program) and need not (no shared state).
3. Harbor challenge windows (`challenge_slots`) and the upstream reclaim
   gate (`OPEN_SLOT_WINDOW`) are independent clocks. No coupling.
4. `halt_binding` exists for upstream program upgrades or oracle incidents:
   it freezes new receipts and disputes on a binding; exits (resolves,
   withdraws, refunds) stay open.
5. Full upstream `distribute` coexistence e2e (sealed channel, treasury,
   splits) is deferred: it exercises treasury/split machinery orthogonal to
   Harbor's disjointness proof. Revisit post-MVP.

## Binding trust

`bind_channel` verifies the channel account against the pinned upstream
layout (owner == declared program, discriminator/version bytes, open
status) and requires the binder to be the recorded payee on the bond's
mint (v0.2.1). PDA re-derivation proved unnecessary: the stored payee is
upstream-written, so squatters cannot forge it. Separately, the merchant
server allowlists which channel programs it will auto-bind
(`CHANNEL_PROGRAM_ALLOWLIST`, default canonical) — induced signing for
attacker-owned programs is rejected before any signature, and the keeper
resolves only allowlisted programs.
