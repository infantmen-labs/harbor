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

## Distribution

- x402/MPP facilitators: Harbor receipts as a require-flag before release.
- Agent frameworks and gateway operators bundling bonded endpoints.
- Direct: metered-API companies already fielding agent traffic.

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
