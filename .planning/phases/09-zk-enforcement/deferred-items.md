# Deferred Items

## Pre-existing verification failure

- `engine/test/bond-watcher.test.ts` still fails in the full `cd engine && npm run test` run with `expected +0 to be 1` in `detects transfer log and calls recordBond, then marks CONFIRMED`. This predates plan `09-02` and was not modified as part of the proof-hardening work.
