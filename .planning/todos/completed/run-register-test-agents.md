---
title: "Run register-test-agents.ts on Base Sepolia"
area: crypto
priority: high
created: 2026-03-02
source: "phase-01 plan 01-03 checkpoint"
---

## Context

Plan 01-03 (Register Test Agents) wrote `packages/crypto/scripts/register-test-agents.ts` but could not execute it — requires `BASE_SEPOLIA_RPC` and `PRIVATE_KEY` env vars with a funded account.

## Action

```bash
cd /Volumes/MainSSD/HomeData/zengy/workspace/auction-design
BASE_SEPOLIA_RPC=<your-rpc-url> PRIVATE_KEY=<your-funded-private-key> npx tsx packages/crypto/scripts/register-test-agents.ts
```

## Verify

1. `ls packages/crypto/test-agents/` → agent-1.json, agent-2.json, agent-3.json
2. `cast call 0x857E1049A5eE2cCA03a5C95F32089FECe51Ce8ff "getRoot()(bytes32)" --rpc-url https://sepolia.base.org` → non-zero bytes32

## After

Once verified, resume 01-03 checkpoint ("approved") to complete the plan and unblock Wave 2.
