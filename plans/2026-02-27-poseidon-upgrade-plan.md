# Poseidon Upgrade Plan (Engine, ZK-Native)

**Date:** 2026-02-27
**Owner:** engine / zk
**Status:** superseded

> **Superseded by**: Ticket `auction-design-1vy` (Fix nullifier hash mismatch). The engine event hash chain stays keccak256 (CF Workers compatible). Only the nullifier tracking changed: ZK-proven Poseidon nullifier from `publicSignals[2]` is used when a proof is provided, keccak fallback otherwise. Per-auction `hashAlgo` toggle was not needed.

## Goal

Upgrade auction engine hashing from current keccak fallback to a real ZK-native Poseidon path, while preserving compatibility for existing auctions and minimizing rollout risk.

## Locked Decisions

1. `hashAlgo` is **immutable per auction**.
2. Rollout is **opt-in first** (not default-first).
3. In `poseidon` mode, **JOIN proof is required**.
4. Existing keccak auctions remain supported and unchanged.

## Scope

### In
- `hashAlgo` (`keccak | poseidon`) support in engine create/init/snapshot APIs.
- Worker-compatible Poseidon implementation for event hash chain + nullifier.
- Poseidon-mode JOIN proof requirement and fail-closed validation.
- Replay determinism with explicit algo awareness.
- Tests + runtime verification + rollout gates.

### Out
- On-chain Groth16 verifier contracts.
- CRE-side full ZK proof-byte re-verification (separate track).
- Sealed-bid MPC feature work.

## Implementation Plan

- [ ] **Task 1: Freeze design + migration policy**
  - Add architecture note documenting immutable per-auction `hashAlgo`.
  - Define migration behavior: old auctions stay keccak; new auctions may opt into poseidon.

- [ ] **Task 2: Select Worker-safe Poseidon backend (hard gate)**
  - Run minimal Worker runtime spike for candidate Poseidon libraries.
  - Reject candidates requiring unsupported runtime primitives (`Worker`, `URL.createObjectURL`, Node-only modules).
  - Record selected backend and rationale.

- [ ] **Task 3: Add `hashAlgo` to engine data flow**
  - Update auction creation payload and persistence path.
  - Thread `hashAlgo` through room initialization and room snapshot.
  - Enforce immutability at auction creation/init boundaries.

- [ ] **Task 4: Implement Poseidon hashing path**
  - Add Worker-safe `engine/src/lib/poseidon.ts`.
  - Refactor crypto path to route by `hashAlgo`:
    - event hash chain computation
    - nullifier derivation
  - Keep keccak path unchanged for legacy auctions.

- [ ] **Task 5: Enforce JOIN-proof requirement in poseidon mode**
  - In poseidon mode: JOIN without proof is rejected.
  - Keep keccak mode backward-compatible for existing flows.
  - Keep fail-closed behavior on malformed/invalid proof data.

- [ ] **Task 6: Replay determinism updates**
  - Ensure replay metadata and verification are hashAlgo-aware.
  - Guarantee deterministic replay for both keccak and poseidon auctions.

- [ ] **Task 7: Tests**
  - Add/extend tests for:
    - Poseidon vector parity
    - hash-chain continuity (both algos)
    - nullifier determinism
    - poseidon JOIN-proof required behavior
    - mixed coexistence (keccak auctions + poseidon auctions)

- [ ] **Task 8: Validation + runtime checks**
  - `cd engine && npm run typecheck`
  - `cd engine && npm run test`
  - `cd engine && wrangler dev --local` smoke for poseidon-mode startup.

- [ ] **Task 9: Rollout**
  - Phase A: release with poseidon opt-in only.
  - Phase B: monitor one release cycle for regressions.
  - Phase C: switch default to poseidon after gates and stability pass.

## Go / No-Go Gates

### Gate A (enable poseidon opt-in)
- All targeted tests pass.
- Full engine test suite passes (excluding known unrelated baseline failures if unchanged).
- Worker local runtime starts and processes poseidon hashing path successfully.
- Replay determinism is validated for poseidon auctions.

### Gate B (make poseidon default)
- Gate A stable in one release cycle.
- No replay/close/settlement regressions from production-like runs.
- Team sign-off on migration risk.

## Notes

- `BidRange` proof enforcement on BID remains a separate task and can be phased after core Poseidon bring-up.
- `hashAlgo` immutability is required to keep `prevHash -> eventHash` chain semantics deterministic per auction and avoid replay ambiguity.
