# AgentPaymaster

EIP-4337 gas sponsorship paymaster for AI agents in the auction platform. Extends `BasePaymaster` from the account-abstraction v0.7 library, which itself inherits `Ownable` and provides stake/deposit helpers for the EntryPoint.

Agents don't hold ETH. They can't pay for gas. AgentPaymaster solves this by sponsoring UserOperations on their behalf, gated by two distinct validation paths depending on what the agent is trying to do.

**Source**: `contracts/src/AgentPaymaster.sol` (176 lines)
**Test**: `contracts/test/AgentPaymaster.t.sol` (19 tests)
**Solidity**: 0.8.24, Cancun EVM
**Target**: Base Sepolia (chainId 84532)

## Table of Contents

- [Overview](#overview)
- [Two-Path Validation Logic](#two-path-validation-logic)
- [External Interfaces](#external-interfaces)
- [State Variables](#state-variables)
- [Events](#events)
- [Errors](#errors)
- [Functions](#functions)
- [paymasterAndData Layout](#paymasteranddata-layout)
- [Security Fixes](#security-fixes)
- [Test Coverage](#test-coverage)
- [Deployment and Configuration](#deployment-and-configuration)

## Overview

AgentPaymaster sits between the EIP-4337 EntryPoint and agent smart wallets (`AgentAccount`). When an agent submits a `PackedUserOperation`, the EntryPoint calls `validatePaymasterUserOp` to decide whether the paymaster will cover gas costs.

The paymaster only sponsors `AgentAccount.execute(address,uint256,bytes)` calls (selector `0xb61d27f6`). Everything else is rejected. Within that constraint, it applies method-based gating: the inner call target and selector determine which validation path runs.

```
Agent (AgentAccount) ──UserOp──> EntryPoint ──validatePaymasterUserOp──> AgentPaymaster
                                                                              │
                                                    ┌─────────────────────────┤
                                                    │                         │
                                              Bond Deposit Path        Non-Bond Path
                                              (USDC.transfer           (any other op)
                                               to escrow)
```

## Two-Path Validation Logic

### Path 1: Bond Deposit

Triggered when the inner call is `USDC.transfer(address,uint256)` (selector `0xa9059cbb`) and the target is the USDC token contract.

**Conditions checked (in order):**

1. Escrow address must be set (not `address(0)`)
2. Transfer recipient must be the escrow contract exactly
3. Agent's `agentId` must be mapped via `accountToAgentId`
4. ERC-8004 identity registry must return a non-zero owner for that `agentId`

**Rationale**: An agent depositing a bond is the first action in the auction lifecycle. The agent doesn't have an active bond yet (that's what it's creating), so the paymaster only checks identity registration. This is the bootstrapping path.

### Path 2: Non-Bond Operations

Triggered for all other `execute()` calls that aren't USDC transfers to escrow.

**Conditions checked (in order):**

1. Escrow address must be set
2. Target contract must be in the `allowedTargets` allowlist
3. `paymasterAndData` must contain an `auctionId` (at least 84 bytes total)
4. Agent must have an active bond (amount > 0) for that `auctionId` in the escrow

**Rationale**: Once an agent has skin in the game (a bond), the paymaster sponsors other auction-related operations. The target allowlist prevents agents from routing gas sponsorship to arbitrary contracts. The bond check ties sponsorship to active auction participation.

## External Interfaces

AgentPaymaster defines two minimal interfaces inline (not imported from separate files):

### IERC8004Registry

```solidity
interface IERC8004Registry {
    function ownerOf(uint256 agentId) external view returns (address);
}
```

Used to verify that an `agentId` is registered in the ERC-8004 identity registry. Returns `address(0)` for unregistered IDs.

### IAuctionEscrowBonds

```solidity
interface IAuctionEscrowBonds {
    function getBondAmount(bytes32 auctionId, uint256 agentId) external view returns (uint256);
}
```

Used to check whether an agent has an active bond for a given auction. Returns 0 if no bond exists.

## State Variables

### Immutables (set in constructor, never change)

| Variable | Type | Description |
|---|---|---|
| `USDC` | `IERC20` | USDC token contract address. Used to identify bond deposit calls. |
| `IDENTITY_REGISTRY` | `IERC8004Registry` | ERC-8004 identity registry. Verifies agent registration. |

### Mutable (owner-controlled)

| Variable | Type | Description |
|---|---|---|
| `escrow` | `IAuctionEscrowBonds` | AuctionEscrow contract. Set post-deployment via `setEscrow()`. |
| `accountToAgentId` | `mapping(address => uint256)` | Maps AgentAccount addresses to ERC-8004 agent IDs. Set via `registerAgent()`. |
| `allowedTargets` | `mapping(address => bool)` | Allowlist of target contracts for non-bond sponsored ops. Set via `setAllowedTarget()`. |

## Events

```solidity
event EscrowUpdated(address indexed oldEscrow, address indexed newEscrow);
event AgentRegistered(address indexed account, uint256 indexed agentId);
event GasSponsored(address indexed account, uint256 actualGasCost);
event AllowedTargetUpdated(address indexed target, bool allowed);
```

- **EscrowUpdated**: Emitted when `setEscrow()` changes the escrow address. Logs both old and new values.
- **AgentRegistered**: Emitted when `registerAgent()` maps an account to an agentId.
- **GasSponsored**: Emitted in `postOp` after every sponsored operation. Logs the actual gas cost for analytics.
- **AllowedTargetUpdated**: Emitted when `setAllowedTarget()` adds or removes a target from the allowlist.

## Errors

| Error | When |
|---|---|
| `EscrowNotSet()` | Escrow address is `address(0)` during bond deposit or non-bond validation |
| `TransferMustTargetEscrow()` | USDC transfer recipient is not the escrow contract |
| `AgentNotRegistered()` | ERC-8004 registry returns `address(0)` for the agent's ID |
| `InsufficientBond()` | Agent has no active bond (amount = 0) for the specified auction |
| `UnsupportedOperation()` | Outer selector isn't `execute()`, inner data too short, or `paymasterAndData` too short |
| `AgentIdNotMapped()` | `accountToAgentId[sender]` returns 0 (agent not registered with paymaster) |
| `TargetNotAllowed()` | Target contract is not in the `allowedTargets` allowlist (non-bond path only) |

## Functions

### constructor

```solidity
constructor(
    IEntryPoint entryPoint_,
    IERC20 usdc_,
    IERC8004Registry identityRegistry_
) BasePaymaster(entryPoint_)
```

Sets the three immutable dependencies. The `BasePaymaster` constructor stores the EntryPoint reference and sets `msg.sender` as owner (via Ownable).

**Note**: `BasePaymaster`'s constructor calls `IEntryPoint.supportsInterface()`. You can't mock the EntryPoint with empty bytecode. Tests use a `MockEntryPoint` that returns `true` for `supportsInterface`.

---

### setEscrow

```solidity
function setEscrow(address escrow_) external onlyOwner
```

Sets or updates the escrow contract address. Can be called multiple times (not a one-time setter like AuctionRegistry's version).

**Access**: Owner only.
**Emits**: `EscrowUpdated(oldEscrow, newEscrow)`

---

### registerAgent

```solidity
function registerAgent(address account, uint256 agentId) external onlyOwner
```

Maps an `AgentAccount` address to its ERC-8004 `agentId`. This mapping is required for both validation paths. Without it, the paymaster rejects the UserOp with `AgentIdNotMapped`.

Designed to be batch-friendly: the owner can call this repeatedly for different agents.

**Access**: Owner only.
**Emits**: `AgentRegistered(account, agentId)`

---

### setAllowedTarget

```solidity
function setAllowedTarget(address target, bool allowed) external onlyOwner
```

Adds or removes a contract address from the non-bond target allowlist. Only targets in this list can receive sponsored calls through the non-bond path.

**Access**: Owner only.
**Emits**: `AllowedTargetUpdated(target, allowed)`

Typical allowlisted targets: `AuctionRegistry`, `AuctionEscrow`, and any other platform contracts agents need to interact with during auctions.

---

### validatePaymasterUserOp (internal)

```solidity
function _validatePaymasterUserOp(
    PackedUserOperation calldata userOp,
    bytes32,       // userOpHash (unused)
    uint256        // maxCost (unused)
) internal view override returns (bytes memory context, uint256 validationData)
```

Called by `BasePaymaster.validatePaymasterUserOp` (which is called by the EntryPoint). This is the core gating logic.

**Flow:**

1. Reject if `callData` < 4 bytes
2. Extract outer selector. Reject if not `execute()` (`0xb61d27f6`)
3. ABI-decode `(address target, uint256 value, bytes innerData)` from callData
4. Reject if `innerData` < 4 bytes
5. Extract inner selector from `innerData`
6. Look up `agentId` from `accountToAgentId[sender]`. Reject if 0.
7. **Branch on path:**
   - If `target == USDC && innerSelector == transfer`: run bond deposit checks
   - Otherwise: run non-bond checks
8. Return `(abi.encode(sender), 0)` on success. The `0` means `SIG_VALIDATION_SUCCESS`.

The returned `context` (encoded sender address) is passed to `_postOp` after execution.

---

### postOp (internal)

```solidity
function _postOp(
    PostOpMode,    // mode (unused)
    bytes calldata context,
    uint256 actualGasCost,
    uint256        // actualUserOpFeePerGas (unused)
) internal override
```

Called by the EntryPoint after the UserOp executes. MVP implementation: decodes the sender from context and emits `GasSponsored` for analytics.

**Future (P1)**: Deduct gas costs from the agent's escrow balance, converting the sponsorship from free to bond-backed.

---

### Inherited from BasePaymaster

These functions come from `BasePaymaster` and are available on AgentPaymaster:

- `addStake(uint32 unstakeDelaySec)` payable: Stake ETH with the EntryPoint
- `unlockStake()`: Begin unstake countdown
- `withdrawStake(address payable)`: Withdraw stake after delay
- `deposit()` payable: Deposit ETH to EntryPoint for gas funding
- `withdrawTo(address payable, uint256)`: Withdraw deposited ETH
- `getDeposit() view`: Check current deposit balance
- `entryPoint() view`: Returns the EntryPoint address
- `owner() view`: Returns the owner address
- `transferOwnership(address)`: Transfer ownership
- `renounceOwnership()`: Renounce ownership

## paymasterAndData Layout

The `paymasterAndData` field in a `PackedUserOperation` follows the EIP-4337 v0.7 format:

```
Offset  Length  Content
──────  ──────  ───────────────────────────────
0       20      Paymaster address
20      16      Verification gas limit (packed)
36      16      Post-op gas limit (packed)
52      ...     Paymaster-specific data
```

`PAYMASTER_DATA_OFFSET = 52` (defined in `UserOperationLib`).

### Bond Deposit Path

No additional paymaster data required. The 52-byte base is sufficient.

```
[20 bytes paymaster][16 bytes verif gas][16 bytes postop gas]
 ─────────────────── 52 bytes total ───────────────────────
```

### Non-Bond Path

Requires a 32-byte `auctionId` appended after offset 52.

```
[20 bytes paymaster][16 bytes verif gas][16 bytes postop gas][32 bytes auctionId]
 ─────────────────── 52 bytes base ──────────────────────── ── 32 bytes data ──
                                                              Total: 84 bytes
```

If `paymasterAndData.length < 84` on the non-bond path, the paymaster reverts with `UnsupportedOperation`.

## Security Fixes

Several security improvements were applied during the audit/review cycle:

### 1. Target Allowlist (`allowedTargets` mapping)

**Problem**: Without a target allowlist, any agent with an active bond could sponsor calls to arbitrary contracts. A malicious agent could drain the paymaster's ETH deposit by routing gas-expensive operations through it.

**Fix**: Added `allowedTargets` mapping and `setAllowedTarget()` admin function. The non-bond path now checks `allowedTargets[target]` before proceeding. Only explicitly allowlisted contracts (AuctionRegistry, AuctionEscrow, etc.) can receive sponsored calls.

**Error**: `TargetNotAllowed()` if the target isn't in the allowlist.

### 2. MCOPY-based `_sliceBytes`

**Problem**: The original byte-slicing helper used a byte-by-byte loop, which is gas-expensive for large payloads.

**Fix**: Replaced with assembly using the `MCOPY` opcode (EVM Cancun, EIP-5656). This copies memory in bulk rather than byte-by-byte.

```solidity
function _sliceBytes(bytes memory data, uint256 start) internal pure returns (bytes memory result) {
    require(data.length >= start, "slice out of bounds");
    uint256 len = data.length - start;
    result = new bytes(len);
    if (len > 0) {
        assembly {
            mcopy(add(result, 0x20), add(add(data, 0x20), start), len)
        }
    }
}
```

**Constraint**: Requires Cancun EVM. Won't compile or execute on pre-Cancun chains.

### 3. EscrowNotSet Check

**Problem**: If `escrow` was never set (still `address(0)`), the bond deposit path would call `getBondAmount` on the zero address, causing unpredictable behavior.

**Fix**: Both paths now check `address(escrow) != address(0)` before any escrow interaction. The bond deposit path checks it before decoding the transfer recipient. The non-bond path checks it as the first step.

### 4. TargetNotAllowed Check Ordering

The non-bond path checks the target allowlist *before* querying the escrow for bond amounts. This prevents unnecessary external calls (and their gas cost) when the target is already known to be disallowed.

Check order in non-bond path:
1. `EscrowNotSet` (is escrow configured?)
2. `TargetNotAllowed` (is target allowlisted?)
3. `UnsupportedOperation` (is paymasterAndData long enough?)
4. `InsufficientBond` (does agent have a bond for this auction?)

## Test Coverage

The test suite in `AgentPaymaster.t.sol` contains 19 tests across five categories:

### Admin Setters (4 tests)

| Test | Validates |
|---|---|
| `test_setEscrow` | Owner can update escrow address |
| `test_registerAgent` | Owner can map account to agentId |
| `test_setEscrow_onlyOwner` | Non-owner reverts |
| `test_registerAgent_onlyOwner` | Non-owner reverts |

### Bond Deposit Path (4 tests)

| Test | Validates |
|---|---|
| `test_validatePaymasterUserOp_bondDeposit_success` | Happy path: registered agent, USDC transfer to escrow |
| `test_validatePaymasterUserOp_bondDeposit_revertsUnregisteredAgent` | Unmapped agentId reverts with `AgentIdNotMapped` |
| `test_validatePaymasterUserOp_bondDeposit_revertsIfTransferNotToEscrow` | Transfer to wrong address reverts with `TransferMustTargetEscrow` |
| `test_validatePaymasterUserOp_bondDeposit_revertsIfNotERC8004Registered` | Zero owner in registry reverts with `AgentNotRegistered` |

### Non-Bond Path (5 tests)

| Test | Validates |
|---|---|
| `test_validatePaymasterUserOp_nonBond_withBond` | Happy path: active bond + allowed target |
| `test_validatePaymasterUserOp_nonBond_revertsWithoutBond` | No bond reverts with `InsufficientBond` |
| `test_validatePaymasterUserOp_nonBond_revertsShortPaymasterData` | Missing auctionId reverts with `UnsupportedOperation` |
| `test_nonBond_revertsTargetNotAllowed` | Disallowed target reverts with `TargetNotAllowed` |
| `test_nonBond_revertsIfEscrowNotSet` | Unset escrow reverts with `EscrowNotSet` |

### Unsupported Selectors (2 tests)

| Test | Validates |
|---|---|
| `test_validatePaymasterUserOp_revertsNonExecuteSelector` | Non-execute outer selector reverts |
| `test_validatePaymasterUserOp_revertsEmptyCallData` | Empty callData reverts |

### Target Allowlist (2 tests)

| Test | Validates |
|---|---|
| `test_setAllowedTarget` | Toggle target on/off |
| `test_setAllowedTarget_onlyOwner` | Non-owner reverts |

### postOp (1 test)

| Test | Validates |
|---|---|
| `test_postOp_emitsGasSponsored` | Emits `GasSponsored` with correct account and gas cost |

### Mock Contracts Used in Tests

- **MockEntryPoint**: Returns `true` for `supportsInterface`. Has fallback/receive for ETH. Required because `BasePaymaster` constructor calls `supportsInterface` on the EntryPoint.
- **MockIdentityRegistry**: Simple `ownerOf` mapping for ERC-8004 simulation.
- **MockEscrowBonds**: Simple `getBondAmount` mapping for bond lookup simulation.
- **MockUSDCToken**: Minimal contract (just needs a valid address, no actual ERC20 logic needed for validation tests).

## Deployment and Configuration

### Constructor Arguments

| Argument | Source |
|---|---|
| `entryPoint_` | EIP-4337 EntryPoint v0.7: `0x0000000071727De22E5E9d8BAf0edAc6f37da032` |
| `usdc_` | USDC token contract on Base Sepolia |
| `identityRegistry_` | ERC-8004 IdentityRegistry contract |

### Post-Deployment Setup

1. **Set escrow**: `setEscrow(escrowAddress)` after AuctionEscrow is deployed
2. **Fund the paymaster**: `deposit()` with ETH so it can cover gas costs at the EntryPoint
3. **Stake (optional)**: `addStake(unstakeDelaySec)` if required by bundler policy
4. **Register agents**: `registerAgent(accountAddress, agentId)` for each agent
5. **Allowlist targets**: `setAllowedTarget(auctionRegistry, true)`, `setAllowedTarget(auctionEscrow, true)`, etc.

### Deployment Order Context

AgentPaymaster is deployed after `AgentAccountFactory` and before `AuctionRegistry`:

```
EntryPoint (external) → AgentAccountFactory → AgentPaymaster → AuctionRegistry → AuctionEscrow
                                                    │                                   │
                                                    └──── setEscrow(escrow) ────────────┘
```

Cross-binding happens last: the paymaster needs the escrow address, and the escrow/registry need each other.
