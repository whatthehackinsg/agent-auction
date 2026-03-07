# @agent-auction/crypto

Shared cryptographic primitives for Agent Auction. This package is the common source for Poseidon hashing, EIP-712 helpers, Groth16 proof generation/verification, replay-bundle helpers, and agent onboarding state generation.

## Main Export Groups

| Area | Exports |
|---|---|
| Poseidon and event hashing | `getPoseidon`, `poseidonHash`, `computePayloadHash`, `computeEventHash`, field helpers |
| Nullifiers | `deriveNullifier`, `deriveNullifierBigInt`, `ActionType` |
| Signal indices | `MEMBERSHIP_SIGNALS`, `BID_RANGE_SIGNALS`, related constants |
| Groth16 verification | `verifyMembershipProof`, `verifyBidRangeProof`, `getMembershipVKey`, `getBidRangeVKey` |
| EIP-712 | `hashTypedData`, `encodeTypedData`, `verifyEIP712Signature`, `DEFAULT_DOMAIN`, `TYPED_DATA_TYPES` |
| Replay bundles | `serializeReplayBundle`, `computeContentHash`, `ACTION_TOKENS`, `parseActionToken` |
| Proof generation | `generateMembershipProof`, `generateBidRangeProof`, `computeBidCommitment`, `computeCapabilityCommitment`, `computeLeafHash` |
| Onboarding | `generateSecret`, `computeLeaf`, `buildPoseidonMerkleTree`, `getMerkleProof`, `prepareOnboarding`, `registerOnChain`, `MERKLE_LEVELS` |

## Commands

```bash
cd packages/crypto
npm install
npm run build
npm test
npm run test:watch
```

Build before running engine or MCP work that imports the compiled package output.

## Current Role in the Stack

- MCP uses this package to generate onboarding state and Groth16 proofs.
- The engine uses the same proof contract and signal ordering, while its Worker deployment uses a local Worker-safe verifier backend.
- Circuits and test fixtures are kept aligned with the exported verification keys and signal indices here.

## Example Usage

```ts
import {
  prepareOnboarding,
  generateMembershipProof,
  verifyMembershipProof,
  deriveNullifier,
  ActionType,
} from "@agent-auction/crypto";
```

Typical flow:

1. `prepareOnboarding(agentId, capabilityIds)`
2. persist the returned private state
3. `generateMembershipProof(...)` or `generateBidRangeProof(...)`
4. verify with `verifyMembershipProof(...)` or `verifyBidRangeProof(...)`

## Notes

- This package preserves the proof/public-signal contract used across MCP, circuits, and engine.
- `signal-indices` is exported separately so Worker consumers can import constants without pulling in heavier verification modules.
- The package is ESM and publishes from `dist/`.
