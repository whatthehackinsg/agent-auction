# contracts/AGENTS.md

Apply root `AGENTS.md` first, then this file.

## Scope

This directory is the Solidity/Foundry module for on-chain auction identity, bonding, and settlement.

- Solidity: `0.8.24`
- EVM: Cancun
- Target chain: Base Sepolia (`84532`)
- Tests: 117 (`forge test`)

## Commands

Run from `contracts/`:

```bash
forge build
forge test
forge test -vvv
forge test --match-contract AuctionEscrow
forge fmt
forge snapshot
```

## Local Rules

- Never edit `contracts/lib/`, `contracts/out/`, or `contracts/cache/`.
- Keep contract APIs/types aligned with `src/interfaces/IAuctionTypes.sol`.
- Preserve one-time wiring semantics (`AuctionRegistry.setEscrow()` cannot be reset).
- Keep CEI/reentrancy-safe patterns for all escrow or settlement paths.
- Use EIP-712 verification for sequencer-authorized state transitions.

## Module Invariants

- `AuctionEscrow` settlement entry is CRE `onReport()` only.
- Bond accounting remains solvent: escrow balance must cover tracked obligations.
- Off-chain-only agents cannot pass bond-gated flows.
- Winner data emitted/recorded by registry and escrow must stay consistent.

## Test Topology

- `test/AuctionEscrow.t.sol` (49)
- `test/AuctionRegistry.t.sol` (30)
- `test/AgentPaymaster.t.sol` (19)
- `test/AgentAccount.t.sol` (15)

## Pointers

- Contract docs: `contracts/docs/`
- Deployment scripts: `contracts/script/Deploy.s.sol`, `contracts/script/HelperConfig.s.sol`
- Architecture source of truth: `docs/full_contract_arch(amended).md`

## Deployment Notes

- All 6 core contracts are deployed and verified on Base Sepolia (see root README for addresses).
- `AgentPrivacyRegistry` is added to `Deploy.s.sol` (Step 6b) but has **not been deployed on-chain yet**. It has no constructor args and no cross-contract bindings — deploy when ready with `forge script`.
- Test count reflects core contracts only (117). AgentPrivacyRegistry has no dedicated test file yet.
