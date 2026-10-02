# Contributing

Start at `docs/setup.md` — prerequisites, keys, build order, then the
one-command loop (`scripts/local-loop.sh`, `LOOP PASS` is the bar).

Rules that CI enforces (`.github/workflows/`):

- `yarn lint` (prettier) and `cargo fmt` must be clean — run the `:fix`
  forms before pushing, never commit reformatting you didn't make.
- `cargo clippy -p harbor --all-targets -- -D warnings` must be clean.
  If a lint fights the protocol (instruction arg counts) or the Anchor
  macro, allow it at the narrowest scope with a justification comment.
- The program is backend-frozen: no changes under `programs/` except
  critical security fixes. The web app is likewise frozen (see
  `web/README.md`); `yarn build`/`yarn test` at root skip `next build`
  by design — CI covers it.

Commit discipline: one theme per commit, no phase or ticket refs in
messages, docs updated in the same commit as the behavior they describe.
SDK/program releases add a `CHANGELOG.md` entry. Local-only planning
docs live outside this repo — never commit them.

Secrets: never in the tree (`.env*`, keypairs, RPC URLs with keys).
If one lands in a log, rotate it — see `docs/deploy.md` §1b.
