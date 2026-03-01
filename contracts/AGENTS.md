# contracts/AGENTS.md

Apply root `AGENTS.md` first, then this file.

## Scope

This directory is the Solidity/Foundry module for on-chain auction identity, bonding, escrow, commission, and settlement.

- Solidity: `0.8.24`
- EVM: Cancun
- Target chain: Base Sepolia (`84532`)
- Tests: 144 (`forge test`)

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
- EIP-4337 contracts (`AgentAccount`, `AgentAccountFactory`, `AgentPaymaster`) are archived in `src/deprecated/` and `test/deprecated/`. Do not modify or extend them.

## Module Invariants

- `AuctionEscrow` settlement entry is CRE `onReport()` only.
- Bond accounting remains solvent: escrow USDC balance must cover `totalBonded + totalWithdrawable + platformBalance`.
- Commission rate (`commissionBps`) cannot exceed `MAX_COMMISSION_BPS` (1000 = 10%).
- Commission is deducted in `_processReport()` before crediting winner withdrawable.
- Off-chain-only agents cannot pass bond-gated flows.
- Winner data emitted/recorded by registry and escrow must stay consistent.
- `NftEscrow` reads `AuctionRegistry` state; it has no CRE integration. Claims are permissionless once auction state is correct.

## Test Topology

| File | Count |
|---|---|
| `test/AuctionEscrow.t.sol` | 62 (including 9 commission tests) |
| `test/AuctionRegistry.t.sol` | 30 |
| `test/NftEscrow.t.sol` | 18 |
| `test/deprecated/AgentPaymaster.t.sol` | 19 (archived) |
| `test/deprecated/AgentAccount.t.sol` | 15 (archived) |

## Pointers

- Contract docs: `contracts/docs/`
- Deployment scripts: `contracts/script/Deploy.s.sol`, `contracts/script/HelperConfig.s.sol`
- Architecture source of truth: `docs/full_contract_arch(amended).md`

## Deployment Notes

- Core contracts are deployed and verified on Base Sepolia (see root README for addresses).
- `NftEscrow` is deployed at `0xa05C5AF6a07D5e1abDd2c93EFdcb95D306766a94`.
- `AgentPrivacyRegistry` is deployed at `0x857E1049A5eE2cCA03a5C95F32089FECe51Ce8ff`.
