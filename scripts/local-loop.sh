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
# Env (all optional, secrets never hardcoded):
#   MERCHANT_KEYPAIR  merchant + upgrade authority (default ~/.config/solana/id.json)
#   AGENT_KEYPAIR     channel payer, also the dispute claimant (default loop-agent.json)
#   UPSTREAM_SO       locally-built payment-channels.so (default: rebuilt fixture path below)
#   UPSTREAM_KEYPAIR  keypair matching UPSTREAM_SO's declare_id
#   BOND_AMOUNT / DEPOSIT / CLAIM / SALT_OK / SALT_FAIL (defaults: 500000/200000/2000/100/101)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

RPC_URL="${RPC_URL:-http://127.0.0.1:8900}"
SERVER_URL="${SERVER_URL:-http://127.0.0.1:3001}"
MERCHANT_KEYPAIR="${MERCHANT_KEYPAIR:-$HOME/.config/solana/id.json}"
AGENT_KEYPAIR="${AGENT_KEYPAIR:-$HOME/.config/solana/loop-agent.json}"
UPSTREAM_SO="${UPSTREAM_SO:-/tmp/opencode/upstream/target/deploy/payment_channels.so}"
UPSTREAM_KEYPAIR="${UPSTREAM_KEYPAIR:-$HOME/.config/solana/local-chnl.json}"
BOND_AMOUNT="${BOND_AMOUNT:-500000}"
DEPOSIT="${DEPOSIT:-200000}"
CLAIM="${CLAIM:-2000}"
SALT_OK="${SALT_OK:-100}"
SALT_FAIL="${SALT_FAIL:-101}"
LEDGER=/tmp/opencode/loop-ledger

need() { command -v "$1" >/dev/null 2>&1 || { echo "missing: $1"; exit 1; }; }
need solana; need solana-keygen; need node; need curl
[ -f "$MERCHANT_KEYPAIR" ] || { echo "missing merchant keypair: $MERCHANT_KEYPAIR"; exit 1; }
[ -f "$AGENT_KEYPAIR" ] || { echo "missing agent keypair: $AGENT_KEYPAIR"; exit 1; }
[ -f "$UPSTREAM_SO" ] || { echo "missing upstream .so: rebuild via clone/patch/cargo build-sbf (see docs/proof-bundle.md v0.4.0 notes)"; exit 1; }
[ -f "$UPSTREAM_KEYPAIR" ] || { echo "missing upstream keypair: $UPSTREAM_KEYPAIR"; exit 1; }
[ -f target/deploy/harbor.so ] || { echo "missing target/deploy/harbor.so: run anchor build"; exit 1; }
[ -d server/dist ] || { echo "missing server/dist: run yarn build"; exit 1; }

MERCHANT_PUBKEY="$(solana-keygen pubkey "$MERCHANT_KEYPAIR")"
AGENT_PUBKEY="$(solana-keygen pubkey "$AGENT_KEYPAIR")"
UPSTREAM_ID="$(solana-keygen pubkey "$UPSTREAM_KEYPAIR")"
echo "== merchant $MERCHANT_PUBKEY"
echo "== agent    $AGENT_PUBKEY"
echo "== upstream $UPSTREAM_ID"

echo "== validator (fresh, isolated ledger)"
pkill -f "solana-test-validator.*loop-ledge[r]" 2>/dev/null || true
if [ -f /tmp/opencode/loop-server.pid ] && kill -0 "$(cat /tmp/opencode/loop-server.pid)" 2>/dev/null; then
  kill "$(cat /tmp/opencode/loop-server.pid)" 2>/dev/null || true
fi
rm -rf "$LEDGER"
nohup solana-test-validator --reset --quiet --ledger "$LEDGER" --rpc-port 8900 > /tmp/opencode/loop-validator.log 2>&1 &
for _ in $(seq 1 60); do sleep 2; SLOT=$(solana --url "$RPC_URL" slot 2>/dev/null || true); [ -n "$SLOT" ] && [ "$SLOT" -gt 0 ] 2>/dev/null && break; done
echo "== slot $(solana --url "$RPC_URL" slot)"

echo "== deploy programs"
solana program deploy target/deploy/harbor.so --program-id target/deploy/harbor-keypair.json --upgrade-authority "$MERCHANT_KEYPAIR" --url "$RPC_URL" > /dev/null
solana program deploy "$UPSTREAM_SO" --program-id "$UPSTREAM_KEYPAIR" --url "$RPC_URL" > /dev/null
echo "== harbor + upstream live"

echo "== fund merchant + agent (local faucet)"
solana airdrop 2 --url "$RPC_URL" --keypair "$MERCHANT_KEYPAIR" > /dev/null
solana transfer "$AGENT_PUBKEY" 0.5 --url "$RPC_URL" --allow-unfunded-recipient > /dev/null

echo "== mint + bond"
MINT_OUT=$(RPC_URL="$RPC_URL" PAYER_KEYPAIR="$MERCHANT_KEYPAIR" MERCHANT_PUBKEY="$MERCHANT_PUBKEY" AGENT_PUBKEY="$AGENT_PUBKEY" MINT_DECIMALS=6 MINT_AMOUNT=2000000000 node server/dist/scripts/mint.js)
MINT=$(echo "$MINT_OUT" | grep '^MINT=' | cut -d= -f2)
echo "== mint $MINT"
RPC_URL="$RPC_URL" MERCHANT_KEYPAIR="$MERCHANT_KEYPAIR" MINT="$MINT" BOND_AMOUNT="$BOND_AMOUNT" node server/dist/scripts/setup.js
BOND=$(node --input-type=module -e "
import {PublicKey} from '@solana/web3.js';
import {bondPda} from './sdk/dist/src/index.js';
console.log(bondPda(new PublicKey('$MERCHANT_PUBKEY'), new PublicKey('$MINT'))[0].toBase58());")
echo "== bond $BOND"

echo "== server :3001"
PORT=3001 RPC_URL="$RPC_URL" MERCHANT_KEYPAIR="$MERCHANT_KEYPAIR" MINT="$MINT" PRICE_PER_TOKEN=10 UPSTREAM_PROGRAM_ALLOWLIST="$UPSTREAM_ID" nohup node server/dist/src/serve.js > /tmp/opencode/loop-server.log 2>&1 &
echo $! > /tmp/opencode/loop-server.pid
sleep 4
curl -sS -m 8 http://127.0.0.1:3001/info; echo

echo "== happy path"
CHANNEL_PROGRAM_ID="$UPSTREAM_ID" RPC_URL="$RPC_URL" SERVER_URL="$SERVER_URL" AGENT_KEYPAIR="$AGENT_KEYPAIR" MERCHANT_PUBKEY="$MERCHANT_PUBKEY" MINT="$MINT" DEPOSIT="$DEPOSIT" REQUESTS=3 BUDGET_PER_REQUEST=5000 REQUEST_DELAY_MS=400 SALT="$SALT_OK" LOG_PATH=/tmp/opencode/loop-ok.jsonl node agent/dist/src/index.js

echo "== kill + fail path"
echo "   (demo honesty note: the merchant holds this request's signed voucher"
echo "    and could settle escrow anyway — the bond refunds only the locked"
echo "    claim, never the escrow debit. See docs/review.md.)"
curl -sS -m 10 -X POST "$SERVER_URL/admin/kill" -H 'content-type: application/json' -d '{"killed":true}' > /dev/null
FAIL_OUT=$(CHANNEL_PROGRAM_ID="$UPSTREAM_ID" RPC_URL="$RPC_URL" SERVER_URL="$SERVER_URL" AGENT_KEYPAIR="$AGENT_KEYPAIR" MERCHANT_PUBKEY="$MERCHANT_PUBKEY" MINT="$MINT" DEPOSIT="$DEPOSIT" REQUESTS=2 BUDGET_PER_REQUEST=5000 SALT="$SALT_FAIL" LOG_PATH=/tmp/opencode/loop-fail.jsonl node agent/dist/src/index.js 2>&1 || true)
echo "$FAIL_OUT" | grep -E "channel|failed|skipping"
FAIL_CHANNEL=$(echo "$FAIL_OUT" | grep -oE "^channel [A-Za-z0-9]+" | head -1 | cut -d' ' -f2)
[ -n "$FAIL_CHANNEL" ] || { echo "could not parse fail channel"; exit 1; }
curl -sS -m 10 -X POST "$SERVER_URL/admin/kill" -H 'content-type: application/json' -d '{"killed":false}' > /dev/null
echo "== fail channel $FAIL_CHANNEL"

BINDING=$(node --input-type=module -e "
import {PublicKey} from '@solana/web3.js';
const prog = new PublicKey('BuRyKLqCsTLcyLVFEjxTjmF4DryCT3LmVDjwqhduvB4H');
const ch = new PublicKey('$FAIL_CHANNEL');
console.log(PublicKey.findProgramAddressSync([Buffer.from('binding'), ch.toBuffer()], prog)[0].toBase58());")
echo "== dispute (agent claims $CLAIM)"
RPC_URL="$RPC_URL" HARBOR_PROGRAM_ID=BuRyKLqCsTLcyLVFEjxTjmF4DryCT3LmVDjwqhduvB4H CLAIMANT_KEYPAIR="$AGENT_KEYPAIR" BOND="$BOND" BINDING="$BINDING" CHANNEL="$FAIL_CHANNEL" MINT="$MINT" NONCE=1 REASON=1 CLAIM_SPEND="$CLAIM" node keeper/dist/scripts/dispute.js

echo "== wait for maturity"
node --input-type=module -e "
import {Connection, PublicKey} from '@solana/web3.js';
import {disputePda} from './sdk/dist/src/index.js';
import {decodeDispute} from './sdk/dist/src/index.js';
const c = new Connection('$RPC_URL', 'confirmed');
const [d] = disputePda(new PublicKey('$BINDING'), 1n);
const t0 = Date.now();
while (Date.now() - t0 < 300000) {
  const info = await c.getAccountInfo(d).catch(() => null);
  const slot = await c.getSlot().catch(() => 0);
  if (info && slot > Number(decodeDispute(info.data).deadlineSlot)) break;
  await new Promise((r) => setTimeout(r, 5000));
}
console.log('matured');
"

echo "== keeper resolve"
OPERATOR_KEYPAIR="$MERCHANT_KEYPAIR" RPC_URL="$RPC_URL" HARBOR_PROGRAM_ID=BuRyKLqCsTLcyLVFEjxTjmF4DryCT3LmVDjwqhduvB4H UPSTREAM_PROGRAM_ALLOWLIST="$UPSTREAM_ID" POLL_MS=5000 MODE=live LOG_PATH=/tmp/opencode/loop-keeper.log.jsonl RUN_ONCE=1 node keeper/dist/src/index.js | tail -1

echo "== verify"
RPC_URL="$RPC_URL" MINT="$MINT" BOND="$BOND" CLAIM="$CLAIM" BOND_AMOUNT="$BOND_AMOUNT" AGENT="$AGENT_PUBKEY" node --input-type=module -e "
import {Connection, PublicKey} from '@solana/web3.js';
import {getAssociatedTokenAddress} from '@solana/spl-token';
import {treasuryPda} from './sdk/dist/src/index.js';
import H from './web/dist-test/lib/harbor.js';
const c = new Connection(process.env.RPC_URL, 'confirmed');
const bonds = await H.listBonds(c);
const b = bonds.find((x) => x.address === process.env.BOND);
const claim = BigInt(process.env.CLAIM);
const fee = (claim * 500n) / 10000n;
const penalty = claim * 2n;
const wantBond = BigInt(process.env.BOND_AMOUNT) - penalty;
const okBond = b.amount === wantBond && b.reserved === 0n && b.openDisputes === 0n;
const mint = new PublicKey(process.env.MINT);
const [treasury] = treasuryPda(mint);
const tBal = BigInt((await c.getTokenAccountBalance(await getAssociatedTokenAddress(mint, treasury, true))).value.amount);
const okTreasury = tBal === fee + penalty;
console.log(\`bond: \${b.amount} (want \${wantBond}) disputes:\${b.openDisputes} reserved:\${b.reserved}\`);
console.log(\`treasury: \${tBal} (want \${fee + penalty})\`);
console.log(okBond && okTreasury ? 'LOOP PASS' : 'LOOP FAIL');
process.exit(okBond && okTreasury ? 0 : 1);
"

echo "== stack left running: RPC $RPC_URL | server $SERVER_URL | logs /tmp/opencode/loop-*.log"
