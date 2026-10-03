# Business — Harbor

## Who pays

API merchants selling to agents (inference, data, RPC). They already lock
reserves at Stripe; Harbor is that reserve, programmable, for buyers that
cannot call a bank. Unpaid delivery disputes kill agent distribution, so
merchants fund the bond that replaces it.

## Pricing

- 10–50 bps on successfully cleared volume (merchant-paid, priced into the API).
- $200–$2k/mo per merchant for policy templates, SLA analytics, and
  accounting exports.
- Expansion: third-party surety marketplace (underwriters post bonds for
  merchants for a cut). No risk warehousing in the MVP — the product sells
  software + the receipt primitive, not insurance.

## Bond economics (worked example, base units)

Every open claim locks 3× its size (`outflow = refund + fee + penalty`),
so a bond's concurrent-claim capacity is `amount / 3`:

| Bond      | Max concurrent 2,000-claims | 5%-fee income at full use | Slash cost of one griefer round |
| --------- | --------------------------- | ------------------------- | ------------------------------- |
| 100,000   | 16                          | 1,600                     | attacker −100, merchant −4,000  |
| 500,000   | 83                          | 8,300                     | attacker −100, merchant −4,000  |
| 2,000,000 | 333                         | 33,300                    | attacker −100, merchant −4,000  |

At 10–50 bps on cleared volume, the fee line pays for dispute-free
operation; it does not compensate griefing — that is priced by the
5%-plus-rent attacker cost and disclosed as the residual in
`docs/review.md`. Bonds must be sized to plausible concurrent exposure,
not to single-claim size.

## Distribution

- Agent frameworks and gateway operators bundling bonded endpoints.
- Direct: metered-API companies already fielding agent traffic.

(Future, not implemented: x402/MPP facilitator use with Harbor receipts
as a require-flag. No code exists; do not treat it as a feature.)

## Moat

- Receipt schema + bond/challenge mechanism as the composable settlement
  primitive (any program can require a Harbor receipt).
- Dispute history per merchant becomes a reputation dataset competitors
  cannot copy without the flow.
- Operator tooling (keeper, dashboards) built on the same primitive.

## Why now

Payment channels put machine payments on rails weeks ago; chargebacks were
deleted on purpose and nothing replaced the performance guarantee. The
first clearing layer for that gap takes the position.
