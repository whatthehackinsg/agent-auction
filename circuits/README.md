# ZK Circuits

Circom circuits and proving artifacts for the Agent Auction privacy layer.

## Current State

- `RegistryMembership.circom` proves membership in the per-agent privacy state
- `BidRange.circom` proves a sealed bid falls inside a valid range
- proving artifacts and verification keys are checked into this workspace
- the package `npm test` script is still a placeholder and intentionally fails

## Public Signal Contracts

### RegistryMembership

- public signals: `registryRoot`, `capabilityCommitment`, `nullifier`
- used by MCP proof generation and engine JOIN verification

### BidRange

- public values: `bidCommitment`, `reservePrice`, `maxBudget`
- output semantics are consumed by sealed-bid flows

The public signal order is an integration contract. If it changes, `packages/crypto` and engine verifiers must be updated in the same workstream.

## Directory Layout

```text
circuits/
  src/
    RegistryMembership.circom
    BidRange.circom
  keys/
    registry_member_vkey.json
    registry_member_final.zkey
    bid_range_vkey.json
    bid_range_final.zkey
  RegistryMembership_js/
  BidRange_js/
  test/
    test_membership.js
    test_membership_negative.js
    test_bidrange.js
    test_bidrange_negative.js
```

## Commands

The package script is intentionally unwired:

```bash
cd circuits
npm test
```

Manual circuit checks:

```bash
node test/test_membership.js
node test/test_membership_negative.js
node test/test_bidrange.js
node test/test_bidrange_negative.js
```

Manual compile flow:

```bash
circom src/RegistryMembership.circom --r1cs --wasm --sym -o .
circom src/BidRange.circom --r1cs --wasm --sym -o .
```

## Trusted Setup Notes

- current hackathon artifacts use a single-contributor setup
- production should use a multi-party ceremony
- BN254 / Groth16 assumptions are shared with `packages/crypto`

## Integration Notes

- `packages/crypto` is the TypeScript-facing wrapper around these artifacts
- the Cloudflare Worker runtime does not change the circuit contract; it only changes how verification is executed inside the engine
