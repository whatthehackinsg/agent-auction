# circuits/AGENTS.md

Apply root `AGENTS.md` first, then this file.

## Scope

This directory contains Circom/snarkjs circuit sources and artifacts for WS-1.

## Commands

Run from `circuits/`:

```bash
# Current package test script is a placeholder and fails by design.
npm test
```

Use explicit circom/snarkjs commands when working on circuit generation and keys.

## Local Rules

- Keep circuit public signal ordering stable once consumed by verifiers.
- Treat generated artifacts and keys deliberately; avoid accidental drift.
- Do not change circuit semantics without updating dependent crypto verifiers.
- Document trusted setup assumptions and artifact provenance in docs.

## Current State

- `npm test` is intentionally unwired in this module at present.
- This workspace is under active WS-1 development and integration.

## Pointers

- Circuit sources: `circuits/src/`
- Verification keys/artifacts: `circuits/keys/`, `circuits/*_js/`
- Consumers: `packages/crypto/src/`
