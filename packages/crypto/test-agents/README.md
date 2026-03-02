# Test Agents

This directory holds private state JSON files for the 3 test agents registered on Base Sepolia.

## Files (git-ignored — never commit)

| File | Agent ID | Role |
|------|----------|------|
| `agent-1.json` | 1 | Bidder agent |
| `agent-2.json` | 2 | Competitor agent |
| `agent-3.json` | 3 | Observer agent |

These files contain `agentSecret` and `nullifier` fields — private credentials that must NOT be committed.

## Regenerating

If you need to recreate these files on a new machine, run:

```bash
BASE_SEPOLIA_RPC=<your-rpc> PRIVATE_KEY=<your-key> npx tsx packages/crypto/scripts/register-test-agents.ts
```

The script is idempotent — agents already registered on-chain will be skipped (the "AlreadyRegistered" guard). The JSON files will be saved locally.

## On-chain State

All 3 agents are permanently registered in `AgentPrivacyRegistry` on Base Sepolia:

- Contract: `0x857E1049A5eE2cCA03a5C95F32089FECe51Ce8ff`
- Registry root (after registration): `0xca223b34b59d6362ccffa90e04ebaa12ea40bb6d5ef3d9b611e2231126cc50f2`

The Merkle root is non-zero and stable — Phase 2+ ZK proof generation targets this root.
