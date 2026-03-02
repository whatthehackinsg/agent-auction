---
phase: 01-zk-foundation
plan: 03
subsystem: testing
tags: [zk, circom, poseidon, merkle, ethers, base-sepolia, agent-privacy-registry]

# Dependency graph
requires:
  - phase: 01-zk-foundation
    provides: "onboarding.ts with prepareOnboarding and registerOnChain functions"
provides:
  - "register-test-agents.ts: one-shot script registering 3 agents on Base Sepolia AgentPrivacyRegistry"
  - "Non-zero AgentPrivacyRegistry Merkle root on Base Sepolia (0xca223b34...)"
  - "packages/crypto/test-agents/README.md with regeneration instructions"
  - "Git-ignored secret files: agent-{1,2,3}.json (agentSecret + nullifiers kept local only)"
affects:
  - 02-zk-proofs
  - 03-engine-integration
  - 04-settlement

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "BigInt serialization with trailing 'n' suffix for JSON storage of private ZK state"
    - "AlreadyRegistered guard for idempotent on-chain registration scripts"
    - "Gitignore pattern for per-developer secret JSON files with matching README.md placeholder"

key-files:
  created:
    - packages/crypto/scripts/register-test-agents.ts
    - packages/crypto/test-agents/README.md
  modified:
    - .gitignore

key-decisions:
  - "test-agents/*.json files contain agentSecret + nullifiers — added to .gitignore, README.md explains local regeneration"
  - "Agent IDs 1, 2, 3 with capability=[1] for bidder, competitor, and observer roles"
  - "Registry root 0xca223b34b59d6362ccffa90e04ebaa12ea40bb6d5ef3d9b611e2231126cc50f2 is now the stable target for Phase 2 membership proofs"

patterns-established:
  - "One-shot registration scripts: idempotent guard + BigInt-safe JSON serializer + chainId validation"
  - "Private ZK state never committed: .gitignore + README.md placeholder pattern"

requirements-completed: [ZKFN-03]

# Metrics
duration: ~2h (including user-run checkpoint)
completed: 2026-03-02
---

# Phase 1 Plan 03: Register Test Agents Summary

**One-shot registration script that populated AgentPrivacyRegistry on Base Sepolia with 3 agent commitments, yielding a non-zero Merkle root (0xca223b34...) that Phase 2 ZK proofs will target**

## Performance

- **Duration:** ~2h (including checkpoint for user to run on-chain registration)
- **Started:** 2026-03-02
- **Completed:** 2026-03-02
- **Tasks:** 2 (Task 1: write script; Task 2: verify registration + secure secrets)
- **Files modified:** 3 (.gitignore, new README.md, new register-test-agents.ts)

## Accomplishments

- Written `register-test-agents.ts`: idempotent script, BigInt-safe JSON serializer, chainId=84532 guard, AlreadyRegistered skip
- All 3 agents registered on Base Sepolia: Agent 1 (TX 0x4b1a7744, block 38329106), Agent 2 (already registered, skipped), Agent 3 (TX 0x1c5c5614, block 38329108)
- AgentPrivacyRegistry root is now non-zero: `0xca223b34b59d6362ccffa90e04ebaa12ea40bb6d5ef3d9b611e2231126cc50f2`
- Private state JSON files (agentSecret, nullifiers) kept local-only via .gitignore; README.md explains regeneration

## Task Commits

Each task was committed atomically:

1. **Task 1: Write register-test-agents.ts script** - `22393c2` (feat)
2. **Task 2: Secure secrets + document test-agents directory** - `90b9a4f` (feat)

**Plan metadata:** (docs commit — see below)

## Files Created/Modified

- `packages/crypto/scripts/register-test-agents.ts` - One-shot agent registration script (idempotent, BigInt-safe)
- `packages/crypto/test-agents/README.md` - Documents the git-ignored JSON files and how to regenerate them
- `.gitignore` - Added `packages/crypto/test-agents/*.json` to prevent secret leaks

## Decisions Made

- `test-agents/*.json` files contain `agentSecret` and nullifier fields — added to .gitignore; README.md serves as the committed placeholder explaining local regeneration steps
- All 3 agents use `capabilityIds=[1n]` (single capability) — sufficient for Phase 2 membership proof tests
- On-chain root `0xca223b34b59d6362ccffa90e04ebaa12ea40bb6d5ef3d9b611e2231126cc50f2` is the stable anchor for all Phase 2 ZK membership proof generation

## Deviations from Plan

None — plan executed as written. The only addition was creating `test-agents/README.md` (beyond the plan's `.gitkeep` suggestion), which is a net improvement for developer experience.

## Issues Encountered

None — registration script ran successfully on first attempt. Agent 2 was already registered from a prior run, which the AlreadyRegistered guard handled correctly.

## Next Phase Readiness

- AgentPrivacyRegistry is populated. Phase 2 can load any `agent-{1,2,3}.json` and generate a valid `RegistryMembership` Groth16 proof against the live on-chain root.
- The registry root `0xca223b34...` must match the root used in proof generation — Phase 2 should call `getRoot()` dynamically rather than hardcoding.
- No blockers for Phase 2 start.

---
*Phase: 01-zk-foundation*
*Completed: 2026-03-02*
