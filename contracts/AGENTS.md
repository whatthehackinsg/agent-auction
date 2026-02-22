# contracts/AGENTS.md — Foundry Project Guide

## Overview

6 Solidity contracts implementing the on-chain layer of the agent auction platform. All compiled and tested with Foundry (113 tests passing).

- **Solidity**: 0.8.24
- **EVM**: Cancun
- **Target**: Base Sepolia (chainId 84532)
- **Optimizer**: 200 runs
- **EntryPoint**: EIP-4337 v0.7 at `0x0000000071727De22E5E9d8BAf0edAc6f37da032`

## Build & Test

```bash
forge build                    # Compile all contracts
forge test                     # Run all 113 tests
forge test -vvv                # Verbose with traces
forge test --match-contract X  # Run specific test suite
forge fmt                      # Format code
forge snapshot                 # Gas snapshots
```

## Contract Dependency Graph

```
IAuctionTypes (shared structs/enums)
    ↑ imported by all contracts below

AgentAccountFactory
    └─→ deploys AgentAccount proxies (CREATE2, deterministic addresses)

AgentAccount (EIP-4337 BaseAccount)
    ├─→ secp256k1 runtime signer (set by factory)
    └─→ validates UserOperations against EntryPoint v0.7

AgentPaymaster (EIP-4337 BasePaymaster)
    ├─→ sponsors gas for bond deposits (USDC approve+deposit path)
    └─→ sponsors non-bond ops IF agent has active bond in AuctionEscrow

AuctionRegistry
    ├─→ createAuction (sequencer-signed, EIP-712)
    ├─→ recordResult (sequencer-signed, stores winner + hashes)
    ├─→ markSettled / markCancelled (called by AuctionEscrow)
    └─→ updateWinnerWallet (winner can update payout address)

AuctionEscrow (IReceiver from Chainlink)
    ├─→ depositBond (USDC transferFrom)
    ├─→ onReport (CRE settlement via KeystoneForwarder)
    ├─→ claimRefund (pull-based, losers self-claim)
    └─→ cross-references AuctionRegistry for state validation

MockKeystoneForwarder (test only)
    └─→ simulates KeystoneForwarder.report() for local CRE testing
```

## Source Files → Test Files

| Source | Test | Tests |
|---|---|---|
| `src/AgentAccount.sol` | `test/AgentAccount.t.sol` | 15 |
| `src/AgentPaymaster.sol` | `test/AgentPaymaster.t.sol` | 19 |
| `src/AuctionRegistry.sol` | `test/AuctionRegistry.t.sol` | 30 |
| `src/AuctionEscrow.sol` | `test/AuctionEscrow.t.sol` | 49 |
| `src/interfaces/IAuctionTypes.sol` | (tested via above) | — |
| `src/MockKeystoneForwarder.sol` | (used in AuctionEscrow.t.sol) | — |

## Deployment Order

1. **External dependencies** (already deployed or mocked):
   - USDC token contract
   - ERC-8004 IdentityRegistry
   - EIP-4337 EntryPoint v0.7
   - Chainlink KeystoneForwarder
2. `AgentAccountFactory` — no dependencies on our contracts
3. `AgentPaymaster(entryPoint)` — needs EntryPoint
4. `AuctionRegistry(sequencer, identityRegistry)` — needs sequencer address + identity registry
5. `AuctionEscrow(usdc, keystoneForwarder, registry)` — needs USDC + forwarder + registry
6. **Cross-binding**:
   - `AuctionRegistry.setEscrow(escrow)` — one-time, immutable after set
   - `AgentPaymaster` needs escrow address for bond-check path

## Remappings

```
forge-std/           → lib/forge-std/src/
@openzeppelin/contracts/ → lib/openzeppelin-contracts/contracts/
@account-abstraction/    → lib/account-abstraction/contracts/
@chainlink/contracts/    → lib/chainlink/contracts/
```

## Dependencies (git submodules in lib/)

| Library | Version | Used For |
|---|---|---|
| forge-std | v1.15 | Test framework |
| openzeppelin-contracts | v5.1 | IERC20, Ownable, ReentrancyGuard, Initializable |
| account-abstraction | v0.7 | BaseAccount, BasePaymaster, IEntryPoint, PackedUserOperation |
| chainlink | v2.19 | IReceiver (CRE KeystoneForwarder interface) |

## Key Patterns

### MockEntryPoint for Paymaster Tests
`BasePaymaster` constructor calls `IEntryPoint.supportsInterface()`, so you can't use `vm.etch` with empty bytecode. Tests use a `MockEntryPoint` contract that returns true for `supportsInterface` and tracks deposits.

### EIP-712 Structured Signing
`AuctionRegistry` uses EIP-712 typed data for sequencer signatures on `createAuction` and `recordResult`. The domain separator is built in the constructor with chainId and contract address.

### CRE Settlement Flow
`AuctionEscrow` implements Chainlink's `IReceiver.onReport()`. In production, `KeystoneForwarder` verifies DON signatures and calls `onReport` with the settlement packet. Tests use `MockKeystoneForwarder` to simulate this.

### Pull-Based Refunds
After settlement, losing bidders call `claimRefund()` themselves. The contract never pushes funds — this avoids gas griefing and stuck-funds issues.

## Development Documentation

Detailed documentation for each contract is in `docs/`:

| Doc File | Covers |
|---|---|
| `docs/AgentAccount.md` | AgentAccount, AgentAccountFactory, IAuctionTypes |
| `docs/AgentPaymaster.md` | AgentPaymaster (gas sponsorship, allowlist) |
| `docs/AuctionRegistry.md` | AuctionRegistry (lifecycle, EIP-712) |
| `docs/AuctionEscrow.md` | AuctionEscrow (bonds, CRE settlement, refunds) |

## Known Issues / Future Work

- Security audit complete, 9 findings fixed across 2 rounds
- Deployment scripts in `script/Deploy.s.sol` and `script/HelperConfig.s.sol`
- No mainnet fork tests yet (would test against real USDC)
- `AgentPaymaster` bond-check path references escrow but full integration test is pending
- CRE workflow YAML not yet written (off-chain, WS-2 next task)
