#!/usr/bin/env bash
# Pre-flight for the documented path: toolchain versions, keys, ports,
# built artifacts. Blockers exit 1; busy ports only warn (the loop aborts
# itself on strangers). Usage: ./scripts/setup-check.sh
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
FAIL=0

ver_ge() { [ "${1%%.*}" -ge "$2" ]; } # major-only compare

check_tool() { # name, min-major, version-cmd...
  local name="$1" min="$2"; shift 2
  if ! command -v "$name" >/dev/null 2>&1; then
    echo "MISSING  $name (see docs/setup.md §1)"; FAIL=1; return
  fi
  local ver="$("$@" 2>/dev/null | head -1)"
  echo "ok       $name $ver"
}

echo "== toolchain"
node_major="$(node -p "process.versions.node.split('.')[0]" 2>/dev/null || echo 0)"
if [ "$node_major" -ge 22 ] 2>/dev/null; then echo "ok       node $(node --version)";
else echo "MISSING  node ≥22 (have $(node --version 2>/dev/null || echo none))"; FAIL=1; fi
check_tool yarn 1 yarn --version
check_tool rustc 1 rustc --version
check_tool solana 3 solana --version
check_tool anchor 1 anchor --version
[ -f "$ROOT/rust-toolchain.toml" ] && echo "ok       rust-toolchain.toml pins $(grep -m1 channel "$ROOT/rust-toolchain.toml")"

echo "== keys"
for k in "${MERCHANT_KEYPAIR:-$HOME/.config/solana/id.json}" "${AGENT_KEYPAIR:-$HOME/.config/solana/loop-agent.json}"; do
  if [ -f "$k" ]; then echo "ok       $k";
  else echo "MISSING  $k (see docs/setup.md §2)"; FAIL=1; fi
done

echo "== artifacts (build hints)"
[ -f "$ROOT/target/deploy/harbor.so" ] && echo "ok       target/deploy/harbor.so" \
  || { echo "MISSING  target/deploy/harbor.so (run: anchor build)"; FAIL=1; }
for d in sdk/dist server/dist agent/dist keeper/dist; do
  [ -d "$ROOT/$d" ] && echo "ok       $d" \
    || { echo "MISSING  $d (run: yarn build)"; FAIL=1; }
done
[ -f "$ROOT/scripts/fixtures/payment_channels.local.so" ] && echo "ok       scripts/fixtures/* (committed)" \
  || { echo "MISSING  scripts/fixtures/*"; FAIL=1; }

echo "== ports (warnings only)"
for p in 8900 3001; do
  if ss -ltn 2>/dev/null | grep -q ":$p "; then echo "warn     :$p busy (loop aborts on strangers; free it or override)";
  else echo "ok       :$p free"; fi
done

[ "$FAIL" -eq 0 ] && echo "SETUP CHECK PASS" || echo "SETUP CHECK FAIL"
exit "$FAIL"
