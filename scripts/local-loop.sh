#!/usr/bin/env bash
# One-command localnet full-loop rehearsal (and video path).
#
#   ./scripts/local-loop.sh
#
# Spins an isolated stack (own validator ledger, RPC :8900, server :3001),
# runs happy path -> kill -> fail -> dispute (agent-as-claimant, payer rule)
# -> keeper resolve, then verifies the settlement math to the unit.
# Leaves the stack running for the demo video; re-running resets it.
#
# Usage: ./scripts/local-loop.sh [--fast] [--with-reclaim]
#   --fast shortens the dispute challenge window to the onchain minimum
#   (75 slots) — same asserts, shorter maturity wait.
#   --with-reclaim runs the full upstream reclaim lifecycle after verify
#   (short-grace channel: requestClose → seal → withdrawPayer →
#   distribute → reclaim-if-past-window). Bond math already verified;
#   reclaim moves upstream escrow only.
#   --with-merchant-paths exercises the merchant-side paths the main
#   loop never touches (short-expiry receipts + Expired gate, halt,
#   treasury withdraw, fresh register/post/withdraw/refund_unused).
#   Halts the loop binding (one-way) — run it last.
#
# Env (secrets never hardcoded; everything local to LOOP_DIR):
#   LOOP_DIR          working dir for ledger, logs, pidfiles, run logs
#                     (default ./.loop-run — gitignored, override per run)
#   MERCHANT_KEYPAIR  merchant + upgrade authority (default ~/.config/solana/id.json)
#   AGENT_KEYPAIR     channel payer, also the dispute claimant (default loop-agent.json)
#   UPSTREAM_SO       locally-built payment-channels.so (default:
#                     scripts/fixtures/pair below; override for your own
#                     build — see "Upstream fixture build" in
#                     docs/proof-bundle.md)
#   UPSTREAM_KEYPAIR  keypair matching UPSTREAM_SO's declare_id (default:
#                     the committed fixture keypair)
#   BOND_AMOUNT / DEPOSIT / CLAIM / SALT_OK / SALT_FAIL (defaults: 500000/200000/2000/100/101)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

RPC_URL="${RPC_URL:-http://127.0.0.1:8900}"
SERVER_URL="${SERVER_URL:-http://127.0.0.1:3001}"
MERCHANT_KEYPAIR="${MERCHANT_KEYPAIR:-$HOME/.config/solana/id.json}"
AGENT_KEYPAIR="${AGENT_KEYPAIR:-$HOME/.config/solana/loop-agent.json}"
UPSTREAM_SO="${UPSTREAM_SO:-$ROOT/scripts/fixtures/payment_channels.local.so}"
UPSTREAM_KEYPAIR="${UPSTREAM_KEYPAIR:-$ROOT/scripts/fixtures/local-chnl.json}"
BOND_AMOUNT="${BOND_AMOUNT:-500000}"
DEPOSIT="${DEPOSIT:-200000}"
CLAIM="${CLAIM:-2000}"
SALT_OK="${SALT_OK:-100}"
SALT_FAIL="${SALT_FAIL:-101}"
CHALLENGE_SLOTS=150
WITH_RECLAIM=0
WITH_MERCHANT_PATHS=0
for arg in "$@"; do
  case "$arg" in
    --fast) CHALLENGE_SLOTS=75 ;;
    --with-reclaim) WITH_RECLAIM=1 ;;
    --with-merchant-paths) WITH_MERCHANT_PATHS=1 ;;
    *) echo "unknown flag: $arg (want --fast, --with-reclaim, --with-merchant-paths)" >&2; exit 1 ;;
  esac
done
LOOP_DIR="${LOOP_DIR:-./.loop-run}"
LEDGER="$LOOP_DIR/ledger"
VALIDATOR_PID="$LOOP_DIR/validator.pid"
SERVER_PID="$LOOP_DIR/server.pid"
mkdir -p "$LOOP_DIR"

# Cleanup on abort only: a passing run intentionally leaves the stack up
# for the demo; any other exit kills what this script started (pidfiles
# never point at strangers — see the stop block below).
SUCCESS=0
TMP_SERVER_PID="$LOOP_DIR/tmp-server.pid"
cleanup() {
  if [ "$SUCCESS" != 1 ]; then
    for p in "$VALIDATOR_PID" "$SERVER_PID" "$TMP_SERVER_PID"; do
      if [ -f "$p" ] && kill -0 "$(cat "$p")" 2>/dev/null; then
        kill "$(cat "$p")" 2>/dev/null || true
      fi
    done
  fi
}
trap cleanup EXIT

need() { command -v "$1" >/dev/null 2>&1 || { echo "missing: $1"; exit 1; }; }
need solana; need solana-keygen; need node; need curl
[ -f "$MERCHANT_KEYPAIR" ] || { echo "missing merchant keypair: $MERCHANT_KEYPAIR"; exit 1; }
[ -f "$AGENT_KEYPAIR" ] || { echo "missing agent keypair: $AGENT_KEYPAIR"; exit 1; }
[ -n "$UPSTREAM_SO" ] && [ -f "$UPSTREAM_SO" ] || { echo "set UPSTREAM_SO to a locally-built payment-channels.so (see 'Upstream fixture build' in docs/proof-bundle.md)"; exit 1; }
[ -f "$UPSTREAM_KEYPAIR" ] || { echo "missing upstream keypair: $UPSTREAM_KEYPAIR"; exit 1; }
[ -f target/deploy/harbor.so ] || { echo "missing target/deploy/harbor.so: run anchor build"; exit 1; }
for d in sdk/dist server/dist agent/dist keeper/dist; do
  [ -d "$d" ] || { echo "missing $d: run yarn build"; exit 1; }
done

MERCHANT_PUBKEY="$(solana-keygen pubkey "$MERCHANT_KEYPAIR")"
AGENT_PUBKEY="$(solana-keygen pubkey "$AGENT_KEYPAIR")"
UPSTREAM_ID="$(solana-keygen pubkey "$UPSTREAM_KEYPAIR")"
echo "== merchant $MERCHANT_PUBKEY"
echo "== agent    $AGENT_PUBKEY"
echo "== upstream $UPSTREAM_ID"

echo "== validator (fresh, isolated ledger)"
# Stop only processes THIS script started before (pidfiles); never strangers.
if [ -f "$VALIDATOR_PID" ] && kill -0 "$(cat "$VALIDATOR_PID")" 2>/dev/null; then
  kill "$(cat "$VALIDATOR_PID")" 2>/dev/null || true
  sleep 2
fi
if [ -f "$SERVER_PID" ] && kill -0 "$(cat "$SERVER_PID")" 2>/dev/null; then
  kill "$(cat "$SERVER_PID")" 2>/dev/null || true
fi
sleep 2
# Port ownership: never launch into a stranger's port, never kill one.
RPC_PORT="${RPC_URL##*:}"
SERVER_PORT="${SERVER_URL##*:}"
if ss -ltn 2>/dev/null | grep -q ":$RPC_PORT "; then
  echo "FATAL: :$RPC_PORT busy by a process this script did not start. Free it or change RPC_URL." >&2
  exit 1
fi
if ss -ltn 2>/dev/null | grep -q ":$SERVER_PORT "; then
  echo "FATAL: :$SERVER_PORT busy by a process this script did not start. Free it or change SERVER_URL." >&2
  exit 1
fi
rm -rf "$LEDGER"
nohup solana-test-validator --reset --quiet --ledger "$LEDGER" --rpc-port "$RPC_PORT" > "$LOOP_DIR/validator.log" 2>&1 &
echo $! > "$VALIDATOR_PID"
for _ in $(seq 1 60); do sleep 2; SLOT=$(solana --url "$RPC_URL" slot 2>/dev/null || true); [ -n "$SLOT" ] && [ "$SLOT" -gt 0 ] 2>/dev/null && break; done
# Freshness tripwire: a reset ledger reads low slots. A high slot here
# means we are talking to a stranger's chain — abort, do not deploy.
if [ -z "${SLOT:-}" ] || [ "$SLOT" -gt 2000 ]; then
  echo "FATAL: validator did not boot fresh (slot=${SLOT:-none}). Check $LOOP_DIR/validator.log" >&2
  exit 1
fi
echo "== slot $SLOT (fresh)"
# Warmup gate: a just-booted validator accepts RPC before producing
# blocks. Transacting into a stalled chain flakes (observed once at
# slot 4: channel open landed nowhere the server could read).
sleep 6
SLOT2=$(solana --url "$RPC_URL" slot 2>/dev/null || true)
[ -n "$SLOT2" ] && [ "$SLOT2" -gt "$SLOT" ] 2>/dev/null || { echo "FATAL: chain not advancing ($SLOT -> ${SLOT2:-none})" >&2; exit 1; }
echo "== chain advancing ($SLOT -> $SLOT2)"

echo "== deploy programs"
HARBOR_KEYPAIR="$ROOT/scripts/fixtures/harbor-keypair.json"
[ -f "$HARBOR_KEYPAIR" ] || { echo "missing $HARBOR_KEYPAIR (committed fixture)"; exit 1; }
solana program deploy target/deploy/harbor.so --program-id "$HARBOR_KEYPAIR" --upgrade-authority "$MERCHANT_KEYPAIR" --url "$RPC_URL" > /dev/null
solana program deploy "$UPSTREAM_SO" --program-id "$UPSTREAM_KEYPAIR" --url "$RPC_URL" > /dev/null
echo "== harbor + upstream live"

echo "== fund merchant + agent (local faucet)"
solana airdrop 2 --url "$RPC_URL" --keypair "$MERCHANT_KEYPAIR" > /dev/null
solana transfer "$AGENT_PUBKEY" 0.5 --url "$RPC_URL" --allow-unfunded-recipient > /dev/null

echo "== mint + bond"
MINT_OUT=$(RPC_URL="$RPC_URL" PAYER_KEYPAIR="$MERCHANT_KEYPAIR" MERCHANT_PUBKEY="$MERCHANT_PUBKEY" AGENT_PUBKEY="$AGENT_PUBKEY" MINT_DECIMALS=6 MINT_AMOUNT=2000000000 node server/dist/scripts/mint.js)
MINT=$(echo "$MINT_OUT" | grep '^MINT=' | cut -d= -f2)
[ -n "$MINT" ] || { echo "FATAL: mint.js printed no MINT= (output above)" >&2; exit 1; }
echo "== mint $MINT"
RPC_URL="$RPC_URL" MERCHANT_KEYPAIR="$MERCHANT_KEYPAIR" MINT="$MINT" BOND_AMOUNT="$BOND_AMOUNT" CHALLENGE_SLOTS="$CHALLENGE_SLOTS" node server/dist/scripts/setup.js
BOND=$(MERCHANT_PUBKEY="$MERCHANT_PUBKEY" MINT="$MINT" node scripts/lib/bond-pda.mjs)
[ -n "$BOND" ] || { echo "FATAL: bond PDA derivation printed nothing" >&2; exit 1; }
echo "== bond $BOND"

echo "== server $SERVER_URL"
PORT="$SERVER_PORT" RPC_URL="$RPC_URL" MERCHANT_KEYPAIR="$MERCHANT_KEYPAIR" MINT="$MINT" PRICE_PER_TOKEN=10 UPSTREAM_PROGRAM_ALLOWLIST="$UPSTREAM_ID" nohup node server/dist/src/serve.js > "$LOOP_DIR/server.log" 2>&1 &
echo $! > "$SERVER_PID"
sleep 4
INFO=$(curl -sS -m 8 "$SERVER_URL/info")
echo "$INFO"
# Identity + boot-state assertions: must be OUR merchant and unkilled.
# A stale server on this port (or a snapshot restore) would poison the run.
echo "$INFO" | grep -q "\"merchant\":\"$MERCHANT_PUBKEY\"" || { echo "FATAL: $SERVER_URL is not our server (merchant mismatch)" >&2; exit 1; }
# Deterministic start: revive unconditionally, then assert.
curl -sS -m 10 -X POST "$SERVER_URL/admin/kill" -H 'content-type: application/json' -d '{"killed":false}' > /dev/null
curl -sS -m 8 "$SERVER_URL/info" | grep -q '"killed":false' || { echo "FATAL: server did not boot unkilled" >&2; exit 1; }
echo "== server verified: our merchant, unkilled"

echo "== happy path"
CHANNEL_PROGRAM_ID="$UPSTREAM_ID" RPC_URL="$RPC_URL" SERVER_URL="$SERVER_URL" AGENT_KEYPAIR="$AGENT_KEYPAIR" MERCHANT_PUBKEY="$MERCHANT_PUBKEY" MINT="$MINT" DEPOSIT="$DEPOSIT" REQUESTS=3 BUDGET_PER_REQUEST=5000 REQUEST_DELAY_MS=400 SALT="$SALT_OK" LOG_PATH="$LOOP_DIR"/loop-ok.jsonl node agent/dist/src/index.js

echo "== kill + fail path"
echo "   (demo honesty note: the merchant holds this request's signed voucher"
echo "    and could settle escrow anyway — the bond refunds only the locked"
echo "    claim, never the escrow debit. See docs/review.md.)"
curl -sS -m 10 -X POST "$SERVER_URL/admin/kill" -H 'content-type: application/json' -d '{"killed":true}' > /dev/null
FAIL_OUT=$(CHANNEL_PROGRAM_ID="$UPSTREAM_ID" RPC_URL="$RPC_URL" SERVER_URL="$SERVER_URL" AGENT_KEYPAIR="$AGENT_KEYPAIR" MERCHANT_PUBKEY="$MERCHANT_PUBKEY" MINT="$MINT" DEPOSIT="$DEPOSIT" REQUESTS=2 BUDGET_PER_REQUEST=5000 SALT="$SALT_FAIL" LOG_PATH="$LOOP_DIR"/loop-fail.jsonl node agent/dist/src/index.js 2>&1 || true)
echo "$FAIL_OUT" | grep -E "channel|failed|skipping"
FAIL_CHANNEL=$(echo "$FAIL_OUT" | grep -oE "^channel [A-Za-z0-9]+" | head -1 | cut -d' ' -f2)
[ -n "$FAIL_CHANNEL" ] || { echo "could not parse fail channel"; exit 1; }
curl -sS -m 10 -X POST "$SERVER_URL/admin/kill" -H 'content-type: application/json' -d '{"killed":false}' > /dev/null
echo "== fail channel $FAIL_CHANNEL"

BINDING=$(FAIL_CHANNEL="$FAIL_CHANNEL" node scripts/lib/binding-pda.mjs)
echo "== dispute (agent claims $CLAIM)"
RPC_URL="$RPC_URL" HARBOR_PROGRAM_ID=BuRyKLqCsTLcyLVFEjxTjmF4DryCT3LmVDjwqhduvB4H CLAIMANT_KEYPAIR="$AGENT_KEYPAIR" BOND="$BOND" BINDING="$BINDING" CHANNEL="$FAIL_CHANNEL" MINT="$MINT" NONCE=1 REASON=1 CLAIM_SPEND="$CLAIM" node keeper/dist/scripts/dispute.js

echo "== disputed-bond gate (buyer would refuse here)"
RPC_URL="$RPC_URL" BOND="$BOND" CLAIM="$CLAIM" node scripts/lib/gate-check.mjs

echo "== wait for maturity"
RPC_URL="$RPC_URL" BINDING="$BINDING" NONCE=1 node scripts/lib/wait-maturity.mjs

echo "== keeper resolve"
RESOLVE_OUT=$(OPERATOR_KEYPAIR="$MERCHANT_KEYPAIR" RPC_URL="$RPC_URL" HARBOR_PROGRAM_ID=BuRyKLqCsTLcyLVFEjxTjmF4DryCT3LmVDjwqhduvB4H UPSTREAM_PROGRAM_ALLOWLIST="$UPSTREAM_ID" POLL_MS=5000 MODE=live LOG_PATH="$LOOP_DIR"/loop-keeper.log.jsonl RUN_ONCE=1 node keeper/dist/src/index.js)
echo "$RESOLVE_OUT" | tail -1
echo "$RESOLVE_OUT" | grep -q "resolved=1" || { echo "FATAL: keeper resolved nothing (see $LOOP_DIR/loop-keeper.log.jsonl)" >&2; exit 1; }

echo "== verify"
RPC_URL="$RPC_URL" MINT="$MINT" BOND="$BOND" CLAIM="$CLAIM" BOND_AMOUNT="$BOND_AMOUNT" node scripts/lib/verify-loop.mjs

if [ "$WITH_RECLAIM" -eq 1 ]; then
  echo "== reclaim channel (short grace, 1 request)"
  RECLAIM_OUT=$(CHANNEL_PROGRAM_ID="$UPSTREAM_ID" RPC_URL="$RPC_URL" SERVER_URL="$SERVER_URL" AGENT_KEYPAIR="$AGENT_KEYPAIR" MERCHANT_PUBKEY="$MERCHANT_PUBKEY" MINT="$MINT" DEPOSIT=50000 REQUESTS=1 BUDGET_PER_REQUEST=5000 REQUEST_DELAY_MS=400 SALT=102 GRACE_PERIOD_SECS=60 LOG_PATH="$LOOP_DIR"/loop-reclaim.jsonl node agent/dist/src/index.js)
  echo "$RECLAIM_OUT" | grep -E "channel|settled"
  RECLAIM_CHANNEL=$(echo "$RECLAIM_OUT" | grep -oE "^channel [A-Za-z0-9]+" | head -1 | cut -d' ' -f2)
  [ -n "$RECLAIM_CHANNEL" ] || { echo "FATAL: could not parse reclaim channel" >&2; exit 1; }
  echo "== reclaim lifecycle on $RECLAIM_CHANNEL"
  RPC_URL="$RPC_URL" CHANNEL_PROGRAM="$UPSTREAM_ID" CHANNEL="$RECLAIM_CHANNEL" PAYER_KEYPAIR="$AGENT_KEYPAIR" MINT="$MINT" node scripts/lib/reclaim-proof.mjs
fi

if [ "$WITH_MERCHANT_PATHS" -eq 1 ]; then
  echo "== short-expiry server (:3102, RECEIPT_EXPIRY_SLOTS=20)"
  PORT=3102 RPC_URL="$RPC_URL" MERCHANT_KEYPAIR="$MERCHANT_KEYPAIR" MINT="$MINT" PRICE_PER_TOKEN=10 RECEIPT_EXPIRY_SLOTS=20 UPSTREAM_PROGRAM_ALLOWLIST="$UPSTREAM_ID" nohup node server/dist/src/serve.js > "$LOOP_DIR/tmp-server.log" 2>&1 &
  echo $! > "$TMP_SERVER_PID"
  sleep 4
  curl -sS -m 8 "http://127.0.0.1:3102/info" | grep -q "\"merchant\":\"$MERCHANT_PUBKEY\"" || { echo "FATAL: tmp server did not boot" >&2; exit 1; }
  echo "== short-expiry request"
  EXPIRY_OUT=$(CHANNEL_PROGRAM_ID="$UPSTREAM_ID" RPC_URL="$RPC_URL" SERVER_URL=http://127.0.0.1:3102 AGENT_KEYPAIR="$AGENT_KEYPAIR" MERCHANT_PUBKEY="$MERCHANT_PUBKEY" MINT="$MINT" DEPOSIT=50000 REQUESTS=1 BUDGET_PER_REQUEST=5000 SALT=103 LOG_PATH="$LOOP_DIR"/loop-expiry.jsonl node agent/dist/src/index.js)
  echo "$EXPIRY_OUT" | grep -E "channel|settled"
  EXPIRY_CHANNEL=$(echo "$EXPIRY_OUT" | grep -oE "^channel [A-Za-z0-9]+" | head -1 | cut -d' ' -f2)
  [ -n "$EXPIRY_CHANNEL" ] || { echo "FATAL: could not parse expiry channel" >&2; exit 1; }
  RPC_URL="$RPC_URL" SERVER_URL=http://127.0.0.1:3102 CHANNEL="$EXPIRY_CHANNEL" NONCE=1 node scripts/lib/expiry-check.mjs
  kill "$(cat "$TMP_SERVER_PID")" 2>/dev/null || true
  rm -f "$TMP_SERVER_PID"

  echo "== expired submit (expect Expired)"
  RPC_URL="$RPC_URL" BOND="$BOND" BINDING="$BINDING" MINT="$MINT" MERCHANT_KEYPAIR="$MERCHANT_KEYPAIR" node scripts/lib/submit-expired.mjs

  echo "== halt loop binding (one-way)"
  RPC_URL="$RPC_URL" BINDING="$BINDING" MERCHANT_KEYPAIR="$MERCHANT_KEYPAIR" node scripts/lib/halt-binding.mjs

  echo "== treasury withdraw 1000"
  RPC_URL="$RPC_URL" MINT="$MINT" AUTHORITY_KEYPAIR="$MERCHANT_KEYPAIR" AMOUNT=1000 node scripts/lib/treasury-withdraw.mjs

  echo "== fresh merchant lifecycle"
  rm -f "$LOOP_DIR/fresh.json"
  solana-keygen new --no-bip39-passphrase --silent -o "$LOOP_DIR/fresh.json" > /dev/null
  solana airdrop 1 --url "$RPC_URL" --keypair "$LOOP_DIR/fresh.json" > /dev/null
  RPC_URL="$RPC_URL" MINT="$MINT" FRESH_KEYPAIR="$LOOP_DIR/fresh.json" MINT_AUTH_KEYPAIR="$MERCHANT_KEYPAIR" BOND_AMOUNT=5000 node scripts/lib/fresh-lifecycle.mjs
fi

SUCCESS=1
echo "== stack left running: RPC $RPC_URL | server $SERVER_URL | logs $LOOP_DIR/*.log"
