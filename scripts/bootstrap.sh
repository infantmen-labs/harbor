#!/usr/bin/env bash
# Fresh-machine bootstrap:rustup (pinned toolchain via rust-toolchain.toml)
# + Solana CLI 3.1.14 + anchor 1.0.0. Idempotent — reruns only fill gaps.
# Node ≥22 + yarn are checked, not installed (use nvm/nodesourcepkg).
set -euo pipefail

AGAVE_VERSION="${AGAVE_VERSION:-3.1.14}"
ANCHOR_VERSION="${ANCHOR_VERSION:-1.0.0}"
SOLANA_HOME="${SOLANA_HOME:-$HOME/.local/share/solana}"

have() { command -v "$1" >/dev/null 2>&1; }

echo "== node"
if have node; then
  MAJOR="$(node -p "process.versions.node.split('.')[0]")"
  if [ "$MAJOR" -ge 22 ]; then echo "   node $(node --version) ok";
  else echo "   node $(node --version) too old — need ≥22 (nvm install 22 / nodesource)"; exit 1; fi
else
  echo "   missing — install Node ≥22 (https://nodejs.org), then rerun"; exit 1
fi
have yarn || { echo "== yarn (npm i -g yarn)"; npm i -g yarn; }
echo "   yarn $(yarn --version) ok"

echo "== rustup (toolchain pins itself via rust-toolchain.toml)"
have rustup || { curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal; }
# shellcheck disable=SC1091
. "$HOME/.cargo/env" 2>/dev/null || true
rustc --version && cargo --version

echo "== solana CLI $AGAVE_VERSION"
if have solana && solana --version | grep -q "$AGAVE_VERSION"; then
  echo "   $(solana --version) ok"
else
  ARCH="$(uname -m)"
  case "$ARCH" in
    x86_64) TARGET="x86_64-unknown-linux-gnu" ;;
    aarch64|arm64) TARGET="aarch64-unknown-linux-gnu" ;;
    *) echo "   unsupported arch $ARCH"; exit 1 ;;
  esac
  mkdir -p "$SOLANA_HOME"
  curl -sSfL "https://github.com/anza-xyz/agave/releases/download/v${AGAVE_VERSION}/solana-release-${TARGET}.tar.bz2" -o /tmp/solana.tar.bz2
  tar -xjf /tmp/solana.tar.bz2 -C "$SOLANA_HOME" --strip-components=1
  rm /tmp/solana.tar.bz2
  export PATH="$SOLANA_HOME/bin:$PATH"
  echo "   installed to $SOLANA_HOME — add to PATH:"
  echo "   export PATH=\"\$HOME/.local/share/solana/bin:\$PATH\""
fi
solana --version || { echo "   solana not on PATH (see above)"; exit 1; }

echo "== anchor $ANCHOR_VERSION (via avm)"
if have anchor && anchor --version | grep -q "$ANCHOR_VERSION"; then
  echo "   $(anchor --version) ok"
else
  cargo install --git https://github.com/solana-foundation/anchor avm --locked --force
  export PATH="$HOME/.avm/bin:$PATH"
  avm install "$ANCHOR_VERSION"
  avm use "$ANCHOR_VERSION" || true
  echo "   add to PATH: export PATH=\"\$HOME/.avm/bin:\$PATH\""
fi
anchor --version
echo "BOOTSTRAP OK"
