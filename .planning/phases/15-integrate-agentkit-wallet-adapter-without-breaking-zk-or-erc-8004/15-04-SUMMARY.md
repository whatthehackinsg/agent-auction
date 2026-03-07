---
phase: 15-integrate-agentkit-wallet-adapter-without-breaking-zk-or-erc-8004
plan: 04
subsystem: mcp-server
tags: [mcp, agentkit, cdp, docs, signoff, base-sepolia]
provides:
  - "Internal docs and env guidance aligned to the supported AgentKit/CDP backend contract"
  - "Real Base Sepolia sign-off evidence for the supported AgentKit/CDP lifecycle"
  - "Truthful closure notes for regression-covered attach/exit flows and the residual multi-room JOIN nonce issue"
affects:
  - 16-write-agent-auction-skill-and-autonomous-participation-playbook
  - 17-use-real-base-sepolia
tech-stack:
  patterns:
    - supported-backend docs/env contract
    - truthful live Base Sepolia sign-off
    - regression-covered residual paths
key-files:
  modified:
    - mcp-server/README.md
    - mcp-server/.env.example
    - .planning/ROADMAP.md
    - .planning/REQUIREMENTS.md
    - .planning/STATE.md
  created:
    - .planning/phases/15-integrate-agentkit-wallet-adapter-without-breaking-zk-or-erc-8004/15-04-SUMMARY.md
    - .planning/phases/15-integrate-agentkit-wallet-adapter-without-breaking-zk-or-erc-8004/15-UAT.md
key-decisions:
  - "Phase 15 closes on the supported AgentKit/CDP single-room lifecycle, not on unexercised multi-room behavior"
  - "Explicit attachExisting and exit flows are accepted as targeted-regression-covered rather than re-proven live in the same sign-off run"
  - "The same-agent multi-room JOIN nonce issue is recorded as a follow-up bug in MCP nonce tracking, not a blocker for the supported-path closure gate"
requirements-completed: [AKIT-03, AKIT-04]
completed: 2026-03-08
---

# Phase 15 Plan 04: Docs, Env, and Live Sign-Off Summary

**Supported AgentKit/CDP path documented and proven live on Base Sepolia without weakening ZK or ERC-8004 ownership**

## Accomplishments

- Updated `mcp-server/README.md` and `mcp-server/.env.example` so the supported AgentKit/CDP path is the primary operator guidance and the raw-key route stays clearly labeled as the advanced bridge.
- Recorded truthful live Base Sepolia evidence for the supported path using the CDP-backed wallet `0x6a275Db9e617526C9E787574e1c3ec7A8175629A`.
- Completed the supported-path lifecycle with a real minted identity, real bond deposit, real JOIN, and real BID while preserving the current MCP tool surface and fail-closed ZK behavior.
- Captured the residual multi-room finding honestly: the platform supports the same `agentId` across multiple auction rooms, but the current MCP JOIN nonce tracker is not yet room-scoped.

## Live Sign-Off Evidence

Supported backend:
- `walletBackend: "supported-agentkit-cdp"`
- wallet: `0x6a275Db9e617526C9E787574e1c3ec7A8175629A`

Identity onboarding:
- fresh agent: `1605`
- state file: `mcp-server/agent-1605.json`
- ERC-8004 tx: `0x0bfbdb95418452400ed5c7e5c2f79e30d05a0175d2f57a2b6fea2b9745255479`
- privacy tx: `0x0aae228ae0dbff14bf459cbed2ff88d490ef3d96d5efd112d4839ddccb899b5c`
- `check_identity(agentId="1605")` returned `readyToParticipate: true`

Live auction lifecycle:
- auction: `0xbc2355d74a6a4ffc2d91e7b641014670d878d1e2d5b1a2dbae9343da671d091d`
- read path: `discover_auctions` and `get_auction_details` both succeeded against the supported backend setup
- bond tx: `0x3ec0b978a6853f1e648c8479c4f2442834d88a170122ad663d77aecf36bb482d`
- JOIN seq/eventHash: `1` / `0x04d757cf9d39e8a809fb420c42ab5a256206543a88ab759cd3ba62a822c402ee`
- BID amount/seq/eventHash: `3000000` / `2` / `0x15bd6cbcad0ccabfd4c47353c858e9ca3270ea162d96609c42452280a25b9391`

Regression-covered but not re-run live in this sign-off:
- explicit `attachExisting` identity adoption path
- `claim_refund`
- `withdraw_funds`

Those paths remain covered by the focused MCP suite and were accepted as regression-backed rather than re-exercised in the same live sign-off loop.

## Verification

- `cd /Volumes/MainSSD/HomeData/zengy/workspace/auction-design/mcp-server && npm run typecheck`
- `cd /Volumes/MainSSD/HomeData/zengy/workspace/auction-design/mcp-server && npm test`

Result:
- `typecheck` passed
- full MCP suite passed `98/98`

## Issues Encountered

- The supported AgentKit/CDP `register_identity` path initially failed because the privacy registration tx was submitted too soon after the ERC-8004 mint, causing estimator lag across RPC nodes. That was fixed earlier in Phase 15 by retrying transient estimation failures.
- Multi-room testing uncovered one MCP-specific residual bug: JOIN nonces are still tracked as `JOIN:<agentId>` instead of being scoped per room, so a second JOIN from the same agent in the same MCP runtime can fail even though the engine, contracts, and CRE all allow the same `agentId` to participate in multiple auctions.

## Next Phase Readiness

- Phase `15` is now closed on truthful live evidence for the supported single-room AgentKit/CDP lifecycle.
- Phase `16` can build the external skill/playbook on top of a verified supported runtime path.
- The multi-room JOIN nonce issue should be handled as a follow-up bug or future hardening task rather than hidden inside the AgentKit sign-off.

## Self-Check: PASSED

- Found `.planning/phases/15-integrate-agentkit-wallet-adapter-without-breaking-zk-or-erc-8004/15-04-SUMMARY.md`
- Supported-path docs/env and live Base Sepolia evidence are captured in one closeout record
