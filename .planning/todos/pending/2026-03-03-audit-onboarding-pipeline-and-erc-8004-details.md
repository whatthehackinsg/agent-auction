---
created: 2026-03-03T17:26:34.978Z
title: Audit onboarding pipeline and ERC-8004 details
area: docs
files:
  - docs/full_contract_arch(amended).md
  - docs/research/agent-auction-architecture/01-agent-onboarding.md
  - engine/src/lib/identity.ts
  - engine/src/handlers/actions.ts
  - agent-client/src/identity.ts
  - packages/crypto/src/onboarding.ts
  - packages/crypto/scripts/onboard-agent.ts
---

## Problem

We need a clear, correct, and implementation-aligned onboarding pipeline (identity + keys + proofs) and a concrete understanding of how ERC-8004 is used across the stack (agent registration, wallet rotation, engine verification, settlement constraints). Right now, “how onboarding works” and “what ERC-8004 guarantees” risk being under-specified or drifting from code.

## Solution

- Trace the actual onboarding path in code (agent-client + packages/crypto + engine) and compare against the architecture spec; reconcile any drift.
- Document the exact ERC-8004 contract interactions and assumptions used by the platform (e.g., `ownerOf`, `getAgentWallet`, wallet rotation), including which checks are enforced where (engine vs contracts vs CRE).
- Produce a short “Onboarding checklist” (commands + expected outputs) that exercises the real flow on Base Sepolia and notes required env vars/secrets.
