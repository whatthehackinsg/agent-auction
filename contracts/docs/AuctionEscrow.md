# AuctionEscrow

> USDC bond escrow with Chainlink CRE settlement. The most complex contract in the system.

**Source**: `contracts/src/AuctionEscrow.sol` (374 lines)
**Solidity**: 0.8.24 | **EVM**: Cancun | **Target**: Base Sepolia (chainId 84532)
**Inherits**: `IReceiver` (Chainlink), `Ownable`, `ReentrancyGuard` (OpenZeppelin v5.1), `IAuctionTypes`
**Uses**: `SafeERC20` (OpenZeppelin)

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
  - [Immutables](#immutables)
  - [CRE Configuration](#cre-configuration)
  - [External Contracts](#external-contracts)
  - [Bond Storage](#bond-storage)
- [Shared Types](#shared-types)
- [Functions](#functions)
  - [Constructor](#constructor)
  - [Admin Configuration](#admin-configuration)
  - [Bond Recording](#bond-recording)
  - [CRE Settlement (IReceiver)](#cre-settlement-ireceiver)
  - [Refund (Pull-Based)](#refund-pull-based)
  - [Withdraw](#withdraw)
  - [Emergency](#emergency)
  - [Views](#views)
- [Events](#events)
- [Errors](#errors)
- [Solvency Invariant](#solvency-invariant)
- [CRE Metadata Layout](#cre-metadata-layout)
- [Idempotency Mechanism](#idempotency-mechanism)
- [Pull-Based Refund Pattern](#pull-based-refund-pattern)
- [Security Fixes](#security-fixes)
- [Integration Points](#integration-points)
- [Test Coverage](#test-coverage)

---

## Overview

AuctionEscrow holds USDC bonds deposited by agents participating in auctions. When an auction settles, the Chainlink CRE (Chainlink Runtime Environment) workflow calls `onReport()` through the KeystoneForwarder, releasing the winner's bond to a withdrawable balance. Losing bidders claim their own refunds through a pull-based mechanism.

This contract sits at the intersection of three systems:
1. **Bond management**: Recording deposits, tracking per-agent-per-auction bonds, enforcing solvency.
2. **CRE settlement**: Implementing Chainlink's `IReceiver` interface to receive verified settlement reports from the DON.
3. **Fund distribution**: Pull-based withdrawals with ERC-8004 ownership verification and designated wallet routing.

Key design principles:
- **Pull over push**: The contract never sends USDC to anyone automatically. Winners and losers both must initiate their own withdrawals.
- **Solvency invariant**: `USDC.balanceOf(this) >= totalBonded + totalWithdrawable` is enforced on every bond recording.
- **Idempotent bond recording**: Each bond is keyed by `keccak256(txHash, logIndex)` to prevent double-recording.
- **Designated wallet routing**: CRE reports set the winner's payout address. Refunds route back to the original depositor. Cross-auction conflicts are detected and rejected.

---

## Architecture

### Immutables

Set once in the constructor, never changed.

| Name | Type | Description |
|---|---|---|
| `USDC` | `IERC20` | The USDC token contract. All bonds and withdrawals use this token. |
| `FORWARDER` | `address` | Chainlink KeystoneForwarder address. Only this address can call `onReport`. |

### CRE Configuration

Set post-deploy by the owner after the CRE workflow is registered on-chain.

| Name | Type | Description |
|---|---|---|
| `expectedWorkflowId` | `bytes32` | Expected CRE workflow ID (non-zero). |
| `expectedWorkflowName` | `bytes10` | Expected workflow name (native CRE metadata type, non-zero). |
| `expectedAuthor` | `address` | Expected workflow owner/author (non-zero). |
| `isCREConfigured` | `bool` | Fail-closed gate. `onReport` reverts until CRE config is complete. |

All three fields are validated strictly once configured. Zero-value CRE config is rejected.

### External Contracts

| Name | Type | Description |
|---|---|---|
| `registry` | `IAuctionRegistry` | AuctionRegistry contract. Called to `markSettled` after CRE settlement and queried via `isCancelled` for refund eligibility. |
| `identityRegistry` | `IERC8004RegistryEscrow` | ERC-8004 identity registry. Queried via `ownerOf` to authorize withdrawals. |
| `admin` | `address` | Platform admin. Can call `recordBond`, `adminRefund`, and `withdraw` (as fallback). |

### Bond Storage

| Name | Type | Description |
|---|---|---|
| `bonds` | `mapping(bytes32 => mapping(uint256 => BondRecord))` | `auctionId` to `agentId` to `BondRecord`. One bond per agent per auction. |
| `bondTxProcessed` | `mapping(bytes32 => bool)` | Idempotency keys. `keccak256(txHash, logIndex)` to `true` if already recorded. |
| `withdrawable` | `mapping(uint256 => uint256)` | `agentId` to accumulated withdrawable USDC balance. |
| `designatedWallet` | `mapping(uint256 => address)` | `agentId` to the address that receives funds on `withdraw()`. Set by CRE for winners, by `claimRefund` for losers. |
| `totalBonded` | `uint256` | Sum of all active (non-refunded) bond amounts. |
| `totalWithdrawable` | `uint256` | Sum of all pending withdrawable balances. |
| `auctionSettled` | `mapping(bytes32 => bool)` | `auctionId` to settlement flag. Set by `_processReport`. |

---

## Shared Types

From `IAuctionTypes`:

```solidity
struct BondRecord {
    address depositor;   // Address that made the USDC transfer
    uint256 amount;      // Bond amount in USDC (6 decimals)
    bool refunded;       // Whether the bond has been released/refunded
}
```

The `AuctionSettlementPacket` struct is also defined in `IAuctionTypes` but is not directly used by AuctionEscrow. The CRE report uses a simpler encoding: `abi.encode(auctionId, winnerAgentId, winnerWallet, amount)`.

---

## Functions

### Constructor

```solidity
constructor(IERC20 usdc_, address forwarder_) Ownable(msg.sender)
```

| Parameter | Type | Description |
|---|---|---|
| `usdc_` | `IERC20` | USDC token contract address. |
| `forwarder_` | `address` | Chainlink KeystoneForwarder address. |

Sets `USDC` and `FORWARDER` as immutables. Sets `admin` to `msg.sender`. Owner is also `msg.sender` (via `Ownable`).

---

### Admin Configuration

All configuration functions are `onlyOwner`. They're called post-deploy to wire up the contract with the rest of the system.

#### setRegistry

```solidity
function setRegistry(address registry_) external onlyOwner
```

Sets the AuctionRegistry contract address. Required for `markSettled` calls during settlement and `isCancelled` queries during refunds.

**Reverts**: `ZeroAddress` if `registry_` is the zero address.
**Emits**: `RegistryUpdated(registry_)`

#### setIdentityRegistry

```solidity
function setIdentityRegistry(address identityRegistry_) external onlyOwner
```

Sets the ERC-8004 identity registry. Required for `ownerOf` checks during withdrawals.

**Reverts**: `ZeroAddress` if `identityRegistry_` is the zero address.
**Emits**: `IdentityRegistryUpdated(identityRegistry_)`

#### setAdmin

```solidity
function setAdmin(address admin_) external onlyOwner
```

Updates the platform admin address. The admin can record bonds, process emergency refunds, and withdraw on behalf of agents when the identity registry is unavailable.

**Reverts**: `ZeroAddress` if `admin_` is the zero address.
**Emits**: `AdminUpdated(admin_)`

#### setExpectedWorkflowId

```solidity
function setExpectedWorkflowId(bytes32 workflowId_) external onlyOwner
```

Sets the expected CRE workflow ID for `onReport` validation. `bytes32(0)` is rejected.

#### setExpectedWorkflowName

```solidity
function setExpectedWorkflowName(bytes10 name_) external onlyOwner
```

Sets the expected CRE workflow name. Uses `bytes10` to match the native CRE metadata type (not a string). `bytes10(0)` is rejected.

#### setExpectedAuthor

```solidity
function setExpectedAuthor(address author_) external onlyOwner
```

Sets the expected CRE workflow author/owner address. `address(0)` is rejected.

#### configureCRE

```solidity
function configureCRE(bytes32 workflowId_, bytes10 name_, address author_) external onlyOwner
```

Convenience function that sets all three CRE parameters in a single call. Preferred over calling the individual setters.

**Emits**: `CREConfigured(workflowId_, name_, author_)`

---

### Bond Recording

#### recordBond

```solidity
function recordBond(
    bytes32 auctionId,
    uint256 agentId,
    address depositor,
    uint256 amount,
    bytes32 txHash,
    uint256 logIndex
) external onlyAdmin
```

Records a bond deposit. The admin calls this after observing an on-chain USDC transfer to the escrow contract. The actual USDC transfer happens separately (the agent or its smart wallet sends USDC directly to the escrow address). This function only records the bookkeeping.

| Parameter | Type | Description |
|---|---|---|
| `auctionId` | `bytes32` | The auction this bond is for. |
| `agentId` | `uint256` | ERC-8004 agent ID of the depositor. |
| `depositor` | `address` | Address that made the USDC transfer. |
| `amount` | `uint256` | Bond amount in USDC (6 decimals). |
| `txHash` | `bytes32` | Transaction hash of the bond transfer. |
| `logIndex` | `uint256` | Log index within the transaction. |

**Access**: Admin only.
**Emits**: `BondRecorded(auctionId, agentId, depositor, amount)`

**Validation steps:**
1. `amount` must be non-zero (`ZeroAmount`).
2. `depositor` must be non-zero (`ZeroAddress`).
3. Idempotency key `keccak256(txHash, logIndex)` must not already be processed (`BondAlreadyProcessed`).
4. No existing bond for this `(auctionId, agentId)` pair (`BondAlreadyExists`).
5. After recording, `USDC.balanceOf(this) >= totalBonded + totalWithdrawable` must hold (`SolvencyViolation`).

The solvency check at step 5 prevents phantom bonds. If the admin calls `recordBond` without a corresponding USDC transfer, the solvency check fails and the transaction reverts.

---

### CRE Settlement (IReceiver)

#### onReport

```solidity
function onReport(bytes calldata metadata, bytes calldata report) external onlyForwarder
```

The Chainlink CRE entry point. Called by the KeystoneForwarder after the DON verifies the settlement workflow's output. This is the only path for trustless auction settlement.

| Parameter | Type | Description |
|---|---|---|
| `metadata` | `bytes` | CRE workflow metadata (64+ bytes). See [CRE Metadata Layout](#cre-metadata-layout). |
| `report` | `bytes` | ABI-encoded settlement data: `(bytes32 auctionId, uint256 winnerAgentId, address winnerWallet, uint256 amount)`. |

**Access**: KeystoneForwarder only (`onlyForwarder`).
**Reverts**: `OnlyForwarder` if caller is not the forwarder, `InvalidReport` if metadata is too short or CRE parameters don't match.

**Validation flow:**
1. Metadata must be at least 64 bytes.
2. Extract `workflowId` (bytes 0-32), `workflowName` (bytes 32-42), `workflowOwner` (bytes 42-62).
3. If `expectedWorkflowId` is set, verify it matches.
4. If `expectedWorkflowName` is set, verify it matches.
5. If `expectedAuthor` is set, verify it matches.
6. Delegate to `_processReport(report)`.

#### _processReport (internal)

```solidity
function _processReport(bytes calldata report) internal
```

Decodes the settlement report and executes the settlement logic.

**Report encoding**: `abi.encode(bytes32 auctionId, uint256 winnerAgentId, address winnerWallet, uint256 amount)`

**Settlement logic:**
1. Check the auction hasn't already been settled (`AlreadySettled`).
2. Mark `auctionSettled[auctionId] = true`.
3. If the winner has a bond recorded:
   - Mark the bond as refunded.
   - Move the bond amount from `totalBonded` to `totalWithdrawable`.
   - Add the amount to `withdrawable[winnerAgentId]`.
   - Check for designated wallet conflicts (revert if a different address is already set).
   - Set `designatedWallet[winnerAgentId] = winnerWallet`.
4. Call `registry.markSettled(auctionId)` if the registry is configured.
5. Emit `SettlementProcessed(auctionId, winnerAgentId, winnerWallet, amount)`.

---

### Refund (Pull-Based)

#### claimRefund

```solidity
function claimRefund(bytes32 auctionId, uint256 agentId) external nonReentrant
```

Non-winners claim their bond refund after the auction settles or gets cancelled. This function is intentionally permissionless: anyone can trigger a refund for any agent. This is safe because funds only move into `withdrawable[agentId]`, not out of the contract. The actual USDC transfer requires a separate `withdraw()` call with proper authorization.

| Parameter | Type | Description |
|---|---|---|
| `auctionId` | `bytes32` | The auction to claim a refund from. |
| `agentId` | `uint256` | The agent's ERC-8004 ID. |

**Access**: Permissionless.
**Emits**: `RefundClaimed(auctionId, agentId, refundAmount)`

**Validation steps:**
1. Auction must be settled (`auctionSettled[auctionId]`) OR cancelled (`registry.isCancelled(auctionId)`). Otherwise reverts with `NotSettled`.
2. Bond must exist for this `(auctionId, agentId)` pair (`NoBondFound`).
3. Bond must not already be refunded (`AlreadyRefunded`).
4. Designated wallet must not conflict with an existing different address (`DesignatedWalletConflict`).

**Effects:**
- `bond.refunded = true`
- `totalBonded -= refundAmount`
- `withdrawable[agentId] += refundAmount`
- `totalWithdrawable += refundAmount`
- `designatedWallet[agentId] = bond.depositor`

---

### Withdraw

#### withdraw

```solidity
function withdraw(uint256 agentId) external nonReentrant
```

Transfers the agent's accumulated withdrawable balance to their designated wallet. This is the only function that moves USDC out of the contract (besides `adminRefund`).

| Parameter | Type | Description |
|---|---|---|
| `agentId` | `uint256` | The agent's ERC-8004 ID. |

**Access**: Agent's ERC-8004 owner OR admin.
**Emits**: `Withdrawn(agentId, to, amount)`

**Authorization logic:**
1. If `identityRegistry` is set:
   - Try `identityRegistry.ownerOf(agentId)`. If it returns successfully, check if `msg.sender` matches the returned owner.
   - If `ownerOf` reverts (agent burned, registry down), fall through to admin check.
   - If caller is neither the owner nor the admin, revert with `UnauthorizedWithdraw`.
2. If `identityRegistry` is not set:
   - Only admin can withdraw (safe fallback).

**Withdrawal flow:**
1. Check `withdrawable[agentId] > 0` (`NothingToWithdraw`).
2. Resolve authorization (see above).
3. Read `designatedWallet[agentId]` (`ZeroAddress` if not set).
4. Zero out `withdrawable[agentId]`.
5. Decrement `totalWithdrawable`.
6. Clear `designatedWallet[agentId]` to `address(0)`.
7. Transfer USDC via `safeTransfer` to the designated wallet.

The designated wallet is cleared after each withdrawal. If the agent wins another auction or claims another refund, a new designated wallet will be set at that time.

---

### Emergency

#### adminRefund

```solidity
function adminRefund(bytes32 auctionId, uint256 agentId) external onlyAdmin nonReentrant
```

Emergency refund path. The admin can directly refund a bond back to the original depositor, bypassing the normal settlement/refund/withdraw flow. This sends USDC immediately (push, not pull) to `bond.depositor`.

| Parameter | Type | Description |
|---|---|---|
| `auctionId` | `bytes32` | The auction to refund from. |
| `agentId` | `uint256` | The agent's ERC-8004 ID. |

**Access**: Admin only.
**Emits**: `AdminRefund(auctionId, agentId, refundAmount)`
**Reverts**: `NoBondFound` if no bond exists, `AlreadyRefunded` if already processed.

Unlike `claimRefund`, this function:
- Does NOT require the auction to be settled or cancelled.
- Sends USDC directly to `bond.depositor` (push transfer).
- Does NOT update `withdrawable` or `designatedWallet`.
- Decrements `totalBonded` directly.

Use this for stuck situations: cancelled auctions where the registry is misconfigured, emergency platform shutdowns, or dispute resolution.

---

### Views

#### getBondAmount

```solidity
function getBondAmount(bytes32 auctionId, uint256 agentId) external view returns (uint256)
```

Returns the active bond amount for an agent in a specific auction. Returns 0 if the bond has been refunded. This is critical for the `AgentPaymaster`, which checks bond status before sponsoring gas. Returning 0 for refunded bonds prevents the paymaster from sponsoring operations for agents whose bonds have already been released.

#### checkSolvency

```solidity
function checkSolvency() external view returns (bool)
```

Returns `true` if the contract's USDC balance covers all obligations: `USDC.balanceOf(this) >= totalBonded + totalWithdrawable`. Can be called by anyone for transparency. Should always return `true` under normal operation.

#### getDesignatedWallet

```solidity
function getDesignatedWallet(uint256 agentId) external view returns (address)
```

Returns the current designated withdrawal address for an agent. Returns `address(0)` if no wallet is set (either never set, or cleared after a withdrawal).

---

## Events

| Event | Parameters | When |
|---|---|---|
| `BondRecorded` | `auctionId` (indexed), `agentId` (indexed), `depositor`, `amount` | Bond successfully recorded via `recordBond`. |
| `SettlementProcessed` | `auctionId` (indexed), `winnerAgentId` (indexed), `winnerWallet`, `amount` | CRE settlement processed via `onReport`. |
| `RefundClaimed` | `auctionId` (indexed), `agentId` (indexed), `amount` | Non-winner claimed their bond refund. |
| `Withdrawn` | `agentId` (indexed), `to`, `amount` | Agent withdrew USDC to their designated wallet. |
| `AdminRefund` | `auctionId` (indexed), `agentId` (indexed), `amount` | Admin emergency refund executed. |
| `RegistryUpdated` | `registry` (indexed) | AuctionRegistry address updated. |
| `IdentityRegistryUpdated` | `identityRegistry` (indexed) | ERC-8004 identity registry address updated. |
| `AdminUpdated` | `admin` (indexed) | Platform admin address updated. |
| `CREConfigured` | `workflowId`, `workflowName`, `author` | CRE workflow parameters configured. |

---

## Errors

| Error | Thrown By | Condition |
|---|---|---|
| `OnlyForwarder()` | `onReport` | Caller is not the KeystoneForwarder. |
| `OnlyAdmin()` | `recordBond`, `adminRefund` | Caller is not the platform admin. |
| `BondAlreadyProcessed()` | `recordBond` | This `(txHash, logIndex)` pair was already recorded. |
| `BondAlreadyExists()` | `recordBond` | Agent already has a bond for this auction. |
| `AlreadySettled()` | `_processReport` | Auction was already settled by a previous CRE report. |
| `NotSettled()` | `claimRefund` | Auction is neither settled nor cancelled. |
| `NoBondFound()` | `claimRefund`, `adminRefund` | No bond exists for this `(auctionId, agentId)`. |
| `AlreadyRefunded()` | `claimRefund`, `adminRefund` | Bond was already refunded or released. |
| `NothingToWithdraw()` | `withdraw` | Agent has zero withdrawable balance. |
| `ZeroAddress()` | `setRegistry`, `setIdentityRegistry`, `setAdmin`, `recordBond`, `withdraw` | Zero address provided where a valid address is required. |
| `ZeroAmount()` | `recordBond` | Bond amount is zero. |
| `InvalidReport()` | `onReport` | Metadata too short, or CRE parameters don't match expected values. |
| `SolvencyViolation()` | `recordBond` | USDC balance doesn't cover `totalBonded + totalWithdrawable` after recording. |
| `UnauthorizedWithdraw()` | `withdraw` | Caller is neither the agent's ERC-8004 owner nor the admin. |
| `DesignatedWalletConflict()` | `_processReport`, `claimRefund` | A different designated wallet is already set for this agent. |

---

## Solvency Invariant

The contract maintains a strict solvency invariant:

```
USDC.balanceOf(address(this)) >= totalBonded + totalWithdrawable
```

`totalBonded` tracks USDC locked in active bonds (not yet refunded or settled). `totalWithdrawable` tracks USDC that has been released to agents but not yet withdrawn. Together, they represent the contract's total obligations.

This invariant is enforced explicitly in `recordBond` (reverts with `SolvencyViolation` if violated after recording) and can be checked at any time via `checkSolvency()`.

**How funds flow through the accounting:**

```
Bond recorded:     totalBonded += amount
Settlement/Refund: totalBonded -= amount, totalWithdrawable += amount
Withdrawal:        totalWithdrawable -= amount, USDC transferred out
Admin refund:      totalBonded -= amount, USDC transferred out (bypasses totalWithdrawable)
```

The invariant prevents phantom bonds. If the admin calls `recordBond` without a corresponding USDC transfer having arrived, the post-recording solvency check fails and the entire transaction reverts.

---

## CRE Metadata Layout

The `onReport` function receives CRE workflow metadata as the first parameter. The layout follows the Chainlink KeystoneForwarder specification:

```
Offset  Size    Type      Field
0       32      bytes32   workflowId        - Unique identifier for the CRE workflow
32      10      bytes10   workflowName      - Human-readable workflow name (fixed-size)
42      20      address   workflowOwner     - Address that registered the workflow
62      2       bytes2    reportId          - Report identifier within the workflow
```

Total minimum size: 64 bytes.

`onReport` is fail-closed: it reverts with `CRENotConfigured` until CRE configuration is set. After that, all metadata fields are validated with exact equality (workflowId, workflowName, workflowOwner).

**Why `bytes10` for workflowName?** The CRE metadata format uses `bytes10` natively for the workflow name field. Earlier versions of this contract used `string`, which required hashing for comparison and didn't match the on-wire format. The `bytes10` type enables direct comparison without conversion overhead.

---

## Idempotency Mechanism

Bond recording uses a two-layer idempotency scheme to prevent double-counting:

**Layer 1: Transaction-level deduplication**

```solidity
bytes32 idempotencyKey = keccak256(abi.encodePacked(txHash, logIndex));
if (bondTxProcessed[idempotencyKey]) revert BondAlreadyProcessed();
bondTxProcessed[idempotencyKey] = true;
```

Each bond deposit corresponds to a specific on-chain USDC transfer event. The `(txHash, logIndex)` pair uniquely identifies that event. If the admin accidentally submits the same bond twice (network retry, duplicate webhook, etc.), the second call reverts.

**Layer 2: Agent-per-auction uniqueness**

```solidity
if (bonds[auctionId][agentId].amount > 0) revert BondAlreadyExists();
```

Each agent can only have one bond per auction. Even if two different transactions somehow both claim to be bonds for the same `(auctionId, agentId)`, only the first succeeds.

Together, these two layers ensure that the bond ledger accurately reflects actual USDC transfers.

---

## Pull-Based Refund Pattern

AuctionEscrow uses a two-step pull pattern for all non-emergency fund distribution:

```
Step 1: Release (claimRefund or _processReport)
    - Bond marked as refunded
    - Amount moved from totalBonded to totalWithdrawable
    - withdrawable[agentId] increased
    - designatedWallet[agentId] set

Step 2: Withdraw (withdraw)
    - Authorization checked (ERC-8004 owner or admin)
    - USDC transferred to designatedWallet
    - withdrawable[agentId] zeroed
    - designatedWallet[agentId] cleared
```

**Why pull instead of push?**

Push-based refunds (looping through all losers and sending USDC) have several problems:
- **Gas griefing**: A malicious agent could deploy a contract that consumes excessive gas on receive, making the settlement transaction fail for everyone.
- **Stuck funds**: If any single transfer fails, the entire batch reverts. One bad actor blocks all refunds.
- **Unbounded gas**: The gas cost scales with the number of participants. Large auctions could exceed block gas limits.

The pull pattern avoids all of these. Settlement and refund operations only update storage (cheap, bounded gas). Each agent withdraws independently, bearing their own gas cost. A failed withdrawal affects only that agent.

**Why is `claimRefund` permissionless?**

Anyone can call `claimRefund(auctionId, agentId)` for any agent. This is safe because the function only moves funds into `withdrawable[agentId]` and sets `designatedWallet[agentId]` to the bond's original depositor. No USDC leaves the contract. The actual transfer happens in `withdraw()`, which requires ERC-8004 ownership or admin authorization.

Making refunds permissionless allows third parties (bots, the platform itself) to batch-trigger refunds for all losers without needing each agent to be online.

---

## Security Fixes

Seven security improvements were applied during the Round 2 audit process:

### 1. getBondAmount Returns 0 When Refunded

**Problem**: `getBondAmount` previously returned the original bond amount even after the bond was refunded. The `AgentPaymaster` uses this function to check whether an agent has an active bond before sponsoring gas. A refunded bond still returning a non-zero amount would let the paymaster keep sponsoring operations for agents who no longer have skin in the game.

**Fix**: `getBondAmount` now checks `bond.refunded` and returns 0 if the bond has been released.

```solidity
function getBondAmount(bytes32 auctionId, uint256 agentId) external view returns (uint256) {
    BondRecord storage bond = bonds[auctionId][agentId];
    if (bond.refunded) return 0;
    return bond.amount;
}
```

### 2. DesignatedWalletConflict: Cross-Auction Wallet Misrouting

**Problem**: An agent participating in multiple auctions could end up with conflicting designated wallets. If auction A's CRE report sets `designatedWallet[agentId]` to wallet X, and then auction B's refund tries to set it to wallet Y (the original depositor), the second write would silently overwrite the first. Funds from auction A could end up going to the wrong address.

**Fix**: Both `_processReport` and `claimRefund` now check for conflicts before setting the designated wallet. If a different address is already stored, the transaction reverts with `DesignatedWalletConflict`.

```solidity
if (designatedWallet[agentId] != address(0) && designatedWallet[agentId] != winnerWallet) {
    revert DesignatedWalletConflict();
}
```

The agent must withdraw their existing balance (which clears the designated wallet) before a new wallet can be set.

### 3. recordBond Validates Depositor and Enforces Solvency

**Problem**: `recordBond` previously accepted `address(0)` as a depositor, which would make the bond unrefundable (refunds go to `bond.depositor`). It also didn't verify that the contract actually held enough USDC to back the recorded bond, allowing phantom bonds.

**Fix**: Two additions:
- `depositor` must be non-zero (`ZeroAddress` revert).
- After recording, the solvency invariant is checked. If `USDC.balanceOf(this) < totalBonded + totalWithdrawable`, the transaction reverts with `SolvencyViolation`.

```solidity
if (depositor == address(0)) revert ZeroAddress();
// ... record bond ...
if (USDC.balanceOf(address(this)) < totalBonded + totalWithdrawable) revert SolvencyViolation();
```

### 4. bytes10 workflowName Validation in onReport

**Problem**: The original implementation stored `expectedWorkflowName` as a `string` and compared it by hashing. CRE metadata encodes the workflow name as `bytes10` at a fixed offset. The string-based approach required unnecessary conversion, was error-prone (encoding mismatches), and didn't match the on-wire format.

**Fix**: Changed `expectedWorkflowName` from `string` to `bytes10`. The `onReport` function now reads `bytes10` directly from the metadata at offset 32 and compares it without hashing.

```solidity
bytes10 workflowName = bytes10(metadata[32:42]);
if (workflowName != expectedWorkflowName) revert InvalidReport();
```

### 5. Cancelled Auction Refunds via registry.isCancelled()

**Problem**: `claimRefund` originally required `auctionSettled[auctionId]` to be true. If an auction was cancelled (expired without a result), agents couldn't claim refunds through the normal path. They had to wait for the admin to process emergency refunds one by one.

**Fix**: `claimRefund` now accepts either condition: the auction is settled OR the auction is cancelled (via `registry.isCancelled(auctionId)`).

```solidity
if (!auctionSettled[auctionId]) {
    if (address(registry) == address(0) || !registry.isCancelled(auctionId)) {
        revert NotSettled();
    }
}
```

### 6. withdraw() try/catch on ownerOf for Burned Agents

**Problem**: If an agent's ERC-8004 token was burned (or the identity registry was in an unexpected state), `identityRegistry.ownerOf(agentId)` would revert. This made the agent's funds permanently stuck, since neither the owner check nor the admin fallback could execute.

**Fix**: The `ownerOf` call is wrapped in a try/catch. If it reverts, the function falls through to the admin authorization check. The admin can always process withdrawals for agents with burned or invalid identities.

```solidity
try identityRegistry.ownerOf(agentId) returns (address agentOwner) {
    isOwner = (msg.sender == agentOwner);
} catch {
    // ownerOf reverted; only admin can withdraw
}
```

### 7. designatedWallet Cleared After Withdrawal

**Problem**: After a successful withdrawal, the `designatedWallet[agentId]` retained the old address. If the agent later won another auction or claimed another refund, the conflict detection (Fix #2) could incorrectly revert if the new designated wallet differed from the stale one.

**Fix**: `withdraw()` now clears `designatedWallet[agentId]` to `address(0)` after transferring funds.

```solidity
withdrawable[agentId] = 0;
totalWithdrawable -= amount;
designatedWallet[agentId] = address(0);  // Clear after withdrawal
USDC.safeTransfer(to, amount);
```

---

## Integration Points

### With AuctionRegistry

- **Settlement**: `_processReport` calls `registry.markSettled(auctionId)` to transition the auction from CLOSED to SETTLED.
- **Cancellation check**: `claimRefund` calls `registry.isCancelled(auctionId)` to allow refunds for cancelled auctions.

### With AgentPaymaster

- **Bond check**: The paymaster calls `getBondAmount(auctionId, agentId)` to verify an agent has an active bond before sponsoring gas. Returns 0 for refunded bonds.

### With ERC-8004 IdentityRegistry

- **Withdrawal auth**: `withdraw` calls `identityRegistry.ownerOf(agentId)` to verify the caller owns the agent identity.

### With Chainlink KeystoneForwarder

- **CRE settlement**: The forwarder calls `onReport(metadata, report)` after the DON verifies the settlement workflow output. Only the forwarder address (set as an immutable) can call this function.

### With USDC Token

- **Solvency checks**: `recordBond` reads `USDC.balanceOf(address(this))` to enforce the solvency invariant.
- **Transfers**: `withdraw` and `adminRefund` use `USDC.safeTransfer` to move funds out.

---

## Test Coverage

The test suite in `AuctionEscrow.t.sol` contains **49 tests** covering all public functions, revert paths, security fixes, and end-to-end flows.

### Test Breakdown

| Category | Count | What's Covered |
|---|---|---|
| `recordBond` | 8 | Success, event emission, duplicate tx revert, same-agent revert, zero amount, non-admin revert, zero depositor, solvency violation |
| `getBondAmount` | 1 | Returns 0 when bond is refunded (paymaster drain prevention) |
| `onReport` | 7 | Successful settlement, non-forwarder revert, already-settled revert, invalid metadata, wrong workflow ID, wrong author, wrong workflow name |
| `_processReport` | 2 | Designated wallet conflict revert, success when same wallet already set |
| `claimRefund` | 6 | Success, not-settled revert, no-bond revert, already-refunded revert, cancelled auction success, designated wallet conflict |
| `withdraw` | 7 | Success as agent owner, success as admin, unauthorized revert, nothing-to-withdraw revert, sends to designated wallet, admin-only when no identity registry, admin can withdraw when ownerOf reverts, clears designated wallet after withdrawal |
| `adminRefund` | 4 | Success, non-admin revert, no-bond revert, already-refunded revert |
| `checkSolvency` | 1 | Returns true when properly funded |
| Configuration | 7 | `configureCRE`, `setExpectedWorkflowName` (bytes10), `setAdmin`, `setRegistry`, `setRegistry` zero-address revert, `setAdmin` zero-address revert, `setIdentityRegistry` |
| Full flows | 2 | Bond-settle-refund-withdraw end-to-end, cancelled-auction-refund-withdraw end-to-end |

### Key Test Patterns

**CRE metadata construction in tests:**
```solidity
bytes memory metadata = abi.encodePacked(
    expectedWorkflowId,       // bytes32 at offset 0
    expectedWorkflowName,     // bytes10 at offset 32
    expectedAuthor,           // address at offset 42
    bytes2(0x0001)            // reportId at offset 62
);
bytes memory report = abi.encode(auctionId, winnerAgentId, winnerWallet, amount);
```

**MockKeystoneForwarder usage:**
Tests use `MockKeystoneForwarder` to simulate the forwarder calling `onReport`. The mock simply forwards the call without DON signature verification, allowing tests to focus on the escrow logic.

**Solvency violation test** (`test_recordBond_revertsSolvencyViolation`): Records a bond for more USDC than the contract holds, verifying the solvency check catches phantom bonds.

**Designated wallet conflict test** (`test_processReport_revertsDesignatedWalletConflict`): Sets up two auctions for the same agent with different designated wallets, verifying the conflict detection works.

### Running Tests

```bash
# All AuctionEscrow tests
forge test --match-contract AuctionEscrowTest

# Verbose with traces
forge test --match-contract AuctionEscrowTest -vvv

# Single test
forge test --match-test test_onReport_settlesAuction -vvv

# Full end-to-end flow
forge test --match-test test_fullFlow -vvv
```
