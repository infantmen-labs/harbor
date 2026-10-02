## What + why (one theme per PR)

## Verification (paste)

- [ ] `yarn lint` / `cargo fmt --all -- --check`
- [ ] `yarn build` + `yarn test`
- [ ] `cargo clippy -p harbor --all-targets -- -D warnings` + `cargo test -p harbor`
- [ ] Docs updated in the same PR as the behavior they describe

## Secrets check

- [ ] No keypairs, RPC URLs with keys, or tokens in the diff
