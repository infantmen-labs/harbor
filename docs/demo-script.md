# Demo script — fail-first, 3 minutes (claim: 2,000 throughout)

All amounts below are exact onchain math for a 2,000-unit claim
(fee = 100, refund = 1,900, penalty = 4,000, open-time reserve = 6,000).
Do not mix in figures from other rehearsals.

## 0:00–0:20 — Problem + mechanism, one sentence

"Agents pay first, failures eat the loss. Harbor: merchants lock a
bond, timeout claims auto-refund 95% + burn 2x. Receipts never acquit."
Show landing hero + `npm i @infantmen-labs/harbor-sdk`.

## 0:20–0:50 — Happy path, fast

Terminal: agent opens channel, 3x `/complete` → receipts. Browser
`/live` receipt feed increments. One `GET /receipt/<channel>/2` +
`verifyEd25519` in terminal. Don't linger.

## 0:50–1:40 — THE demo: kill it (thumbnail segment)

`POST /admin/kill {"killed":true}` → next request 500 "delivery
failed", no receipt (404). Open dispute, lock 2,000. Show bond
**reserved += 6,000** on /live. This 30-second segment is the only
thing judges will remember.

## 1:40–2:30 — Resolve + math on screen

`RUN_ONCE=1` keeper → `resolve-timeout` sig. Show before/after as
overlay text (not narration):
- agent locked 2,000 → refunded 1,900 (net **−100** fee — not profit)
- bond **−4,000** (penalty only; the fee came from the locked claim)
- treasury **+4,100** (100 fee + 4,000 penalty)
- reserved back to 0, dispute closed

## 2:30–3:00 — Third-party proof + integrate

Run `examples/bond-watch/bond-watch.cjs` against the demo bond —
same numbers, zero Harbor UI. End frozen on install cmd + repo +
proof-bundle links.

## What this demo does NOT show (say so if asked)

- Failed-voucher escrow still settles upstream; the bond covers the
  rebate leg, not the payment leg.
- `?mock=1` never appears in the video (labeled offline fallback only).
- No refund button exists anywhere — resolution is permissionless
  timeout, never a click.
