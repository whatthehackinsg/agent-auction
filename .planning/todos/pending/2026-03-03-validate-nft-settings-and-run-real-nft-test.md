---
created: 2026-03-03T17:26:34.978Z
title: Validate NFT settings and run real NFT test
area: contracts
files:
  - contracts/src/NftEscrow.sol
  - engine/src/index.ts
  - engine/src/types/engine.ts
  - mcp-server/README.md
  - frontend/README.md
---

## Problem

NFT auction support exists (escrow + metadata plumbing), but we need to confirm the “real NFT” path works end-to-end (not just mocks): deposit an ERC-721 into `NftEscrow`, run an auction through the engine, settle via CRE, and verify the winner receives the NFT (and reclaim/cancel paths behave correctly).

## Solution

- Identify the current “NFT settings” / config knobs (engine + frontend create form + MCP details endpoint) and confirm they map correctly to `NftEscrow`’s expected inputs.
- Run an E2E test on the target network (Base Sepolia): mint/use a test ERC-721, create auction with NFT item, deposit into escrow, join/bid, settle via CRE, verify NFT transfer + event logs.
- Add a minimal automated test (where feasible) covering the escrow deposit + claim/reclaim flow (or document the manual E2E checklist if automation is too heavy).
