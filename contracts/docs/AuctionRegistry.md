# AuctionRegistry

> Auction lifecycle state machine with EIP-712 sequencer signatures and CRE settlement integration.

**Source**: `contracts/src/AuctionRegistry.sol` (287 lines)
**Solidity**: 0.8.24 | **EVM**: Cancun | **Target**: Base Sepolia (chainId 84532)
**Inherits**: `IAuctionTypes`, `Ownable` (OpenZeppelin v5.1)
**Uses**: `ECDSA` (OpenZeppelin)

---

## Table of Contents

- [Overview](#overview)
- [State Machine](#state-machine)
- [AuctionData Struct](#auctiondata-struct)
- [EIP-712 Signature Verification](#eip-712-signature-verification)
  - [Domain 1: Settlement Signatures](#domain-1-settlement-signatures)
  - [Domain 2: Wallet Rotation](#domain-2-wallet-rotation)
- [Functions](#functions)
  - [Constructor](#constructor)
  - [Admin Functions](#admin-functions)
  - [Auction Lifecycle](#auction-lifecycle)
  - [View Functions](#view-functions)
- [Events](#events)
- [Errors](#errors)
- [Integration with CRE](#integration-with-cre)
- [Security Fixes](#security-fixes)
- [Test Coverage](#test-coverage)

---

## Overview

AuctionRegistry is the on-chain state machine for auction lifecycle management. It tracks every auction from creation through settlement or cancellation, stores sequencer-signed results, and emits the `AuctionEnded` event that triggers Chainlink CRE settlement workflows.

The contract enforces a strict state progression. Only the sequencer can create auctions and sign results. Only the escrow contract can mark auctions as settled. Anyone can cancel an expired auction after the 72-hour timeout window.

Key design principles:
- **Single write at close**: `recordResult` is the only on-chain write when an auction ends. All bidding happens off-chain.
- **EIP-712 structured signatures**: Both settlement packets and wallet rotations use typed data signing for human-readable verification and cross-chain replay protection.
- **One-time escrow binding**: The escrow address can only be set once, preventing admin key compromise from redirecting settlement calls.

---

## State Machine

```
NONE ──(createAuction)──> OPEN ──(recordResult)──> CLOSED ──(markSettled)──> SETTLED
                            │                         │
                            │                         └──(updateWinnerWallet)──> [stays CLOSED or SETTLED]
                            │
                            └──(cancelExpiredAuction, after deadline + 72h)──> CANCELLED
```

| State | Value | Description |
|---|---|---|
| `NONE` | 0 | Default. Auction doesn't exist yet. |
| `OPEN` | 1 | Auction created. Agents can join, bond, and bid off-chain. |
| `CLOSED` | 2 | Sequencer submitted the signed result. Winner determined. Waiting for CRE settlement. |
| `SETTLED` | 3 | CRE workflow verified the result and AuctionEscrow released funds. Terminal state. |
| `CANCELLED` | 4 | Auction expired without a result (72h past deadline). Bonds become refundable. Terminal state. |

**Transition rules:**
- `NONE` to `OPEN`: Only via `createAuction`, called by the sequencer.
- `OPEN` to `CLOSED`: Only via `recordResult`, with a valid EIP-712 sequencer signature.
- `OPEN` to `CANCELLED`: Only via `cancelExpiredAuction`, after `deadline + 72 hours`.
- `CLOSED` to `SETTLED`: Only via `markSettled`, called by the escrow contract.
- No other transitions are possible. `SETTLED` and `CANCELLED` are terminal.

---

## AuctionData Struct

Stored in `mapping(bytes32 => AuctionData) public auctions`.

```solidity
struct AuctionData {
    AuctionState state;          // Current lifecycle state
    bytes32 manifestHash;        // Hash of the auction manifest (task description, rules)
    bytes32 roomConfigHash;      // Hash of room configuration (participants, format)
    uint256 reservePrice;        // Minimum acceptable bid (in USDC, 6 decimals)
    uint256 depositAmount;       // Required bond deposit per participant (USDC)
    uint256 deadline;            // Unix timestamp: auction must close before this
    // --- Populated at close (recordResult) ---
    bytes32 finalLogHash;        // Hash of the complete append-only event log
    bytes32 replayContentHash;   // Placeholder for IPFS-pinned replay bundle hash
    uint256 winnerAgentId;       // ERC-8004 agent ID of the winner
    address winnerWallet;        // Payout address for the winner (can be rotated)
    uint256 finalPrice;          // Winning bid amount (USDC)
    uint64  closeTimestamp;      // When the sequencer closed the auction
}
```

**Fields set at creation** (`createAuction`): `state`, `manifestHash`, `roomConfigHash`, `reservePrice`, `depositAmount`, `deadline`. All remaining fields initialize to zero.

**Fields set at close** (`recordResult`): `state` (to CLOSED), `finalLogHash`, `winnerAgentId`, `winnerWallet`, `finalPrice`, `closeTimestamp`. The `replayContentHash` is set to `bytes32(0)` because the CRE workflow fetches replay data from IPFS directly.

---

## EIP-712 Signature Verification

AuctionRegistry uses two separate EIP-712 domains for different signing contexts. This separation prevents signature reuse across operations.

### Domain 1: Settlement Signatures

Used by `recordResult` to verify the sequencer's signature over the settlement packet.

```
EIP712Domain {
    name:              "AgentAuction"
    version:           "1"
    chainId:           <block.chainid>
    verifyingContract: <AuctionRegistry address>
}
```

The domain separator is computed once in the constructor and stored as an immutable:

```solidity
DOMAIN_SEPARATOR = keccak256(abi.encode(
    keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
    keccak256("AgentAuction"),
    keccak256("1"),
    block.chainid,
    address(this)
));
```

**SETTLEMENT_TYPEHASH** encodes all 7 fields of the settlement packet:

```solidity
bytes32 public constant SETTLEMENT_TYPEHASH = keccak256(
    "AuctionSettlementPacket(bytes32 auctionId,bytes32 manifestHash,bytes32 finalLogHash,uint256 winnerAgentId,address winnerWallet,uint256 winningBidAmount,uint64 closeTimestamp)"
);
```

The struct hash is computed as:

```solidity
bytes32 structHash = keccak256(abi.encode(
    SETTLEMENT_TYPEHASH,
    packet.auctionId,
    packet.manifestHash,
    packet.finalLogHash,
    packet.winnerAgentId,
    packet.winnerWallet,
    packet.winningBidAmount,
    packet.closeTimestamp
));
```

Final digest follows the EIP-712 standard:

```
digest = keccak256("\x19\x01" || DOMAIN_SEPARATOR || structHash)
```

The recovered signer must match `sequencerAddress`. If it doesn't, the call reverts with `InvalidSequencerSig`.

### Domain 2: Wallet Rotation

Used by `updateWinnerWallet` to verify the current winner's signature authorizing a wallet change.

```
EIP712Domain {
    name:              "AuctionRegistry"
    version:           "1"
    chainId:           <block.chainid>
    verifyingContract: <AuctionRegistry address>
}
```

Note the different `name` ("AuctionRegistry" vs "AgentAuction"). This is intentional: a settlement signature can never be replayed as a wallet rotation, and vice versa.

**WalletRotation typehash:**

```solidity
keccak256("WalletRotation(bytes32 auctionId,address newWallet)")
```

The rotation domain separator is computed inline (not cached) since wallet rotations are infrequent:

```solidity
bytes32 rotationDomainSeparator = keccak256(abi.encode(
    keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
    keccak256("AuctionRegistry"),
    keccak256("1"),
    block.chainid,
    address(this)
));
```

The recovered signer must match the auction's current `winnerWallet`. If it doesn't, the call reverts with `InvalidEIP712Sig`.

---

## Functions

### Constructor

```solidity
constructor(address sequencer_) Ownable(msg.sender)
```

| Parameter | Type | Description |
|---|---|---|
| `sequencer_` | `address` | Initial sequencer address. Cannot be zero. |

Sets the contract owner to `msg.sender`, stores the sequencer address, and computes the immutable `DOMAIN_SEPARATOR`. Reverts with `ZeroAddress` if `sequencer_` is the zero address.

---

### Admin Functions

#### setEscrow

```solidity
function setEscrow(address escrow_) external onlyOwner
```

One-time binding of the escrow contract address. After this call succeeds, the escrow address is permanently locked. Any subsequent call reverts with `EscrowAlreadyBound`.

| Parameter | Type | Description |
|---|---|---|
| `escrow_` | `address` | AuctionEscrow contract address. Cannot be zero. |

**Access**: Owner only.
**Emits**: `EscrowBound(escrow_)`
**Reverts**: `EscrowAlreadyBound` if already set, `ZeroAddress` if zero address.

#### setSequencer

```solidity
function setSequencer(address sequencer_) external onlyOwner
```

Updates the sequencer address. Unlike `setEscrow`, this can be called multiple times (key rotation for the sequencer is expected).

| Parameter | Type | Description |
|---|---|---|
| `sequencer_` | `address` | New sequencer address. Cannot be zero. |

**Access**: Owner only.
**Emits**: `SequencerUpdated(oldSequencer, newSequencer)`
**Reverts**: `ZeroAddress` if zero address.

---

### Auction Lifecycle

#### createAuction

```solidity
function createAuction(
    bytes32 auctionId,
    bytes32 manifestHash,
    bytes32 roomConfigHash,
    uint256 reservePrice,
    uint256 depositAmount,
    uint256 deadline
) external onlySequencer
```

Creates a new auction and transitions it to `OPEN`. The `auctionId` must not already exist.

| Parameter | Type | Description |
|---|---|---|
| `auctionId` | `bytes32` | Unique auction identifier (typically `keccak256` of auction metadata). |
| `manifestHash` | `bytes32` | Hash of the auction manifest (task description, acceptance criteria). |
| `roomConfigHash` | `bytes32` | Hash of room configuration (participant limits, format rules). |
| `reservePrice` | `uint256` | Minimum bid in USDC (6 decimals). |
| `depositAmount` | `uint256` | Required bond deposit per participant in USDC. |
| `deadline` | `uint256` | Unix timestamp after which the auction can be cancelled. |

**Access**: Sequencer only.
**State transition**: `NONE` to `OPEN`.
**Emits**: `AuctionCreated(auctionId, manifestHash, reservePrice, depositAmount, deadline)`
**Reverts**: `OnlySequencer` if caller is not the sequencer, `AuctionAlreadyExists` if the auction ID is already in use.

#### recordResult

```solidity
function recordResult(
    AuctionSettlementPacket calldata packet,
    bytes calldata sequencerSig
) external
```

Records the auction result. This is the single on-chain write when an auction closes. The function verifies the sequencer's EIP-712 signature over the settlement packet, enforces manifest hash integrity, stores the result, and emits `AuctionEnded` (which triggers the CRE workflow).

| Parameter | Type | Description |
|---|---|---|
| `packet` | `AuctionSettlementPacket` | Settlement data: auctionId, manifestHash, finalLogHash, winnerAgentId, winnerWallet, winningBidAmount, closeTimestamp. |
| `sequencerSig` | `bytes` | EIP-712 signature from the sequencer over the packet. |

**Access**: Permissionless (anyone can submit, but the signature must be from the sequencer).
**State transition**: `OPEN` to `CLOSED`.
**Emits**: `AuctionEnded(auctionId, winnerAgentId, winnerWallet, finalPrice, finalLogHash, replayContentHash)`
**Reverts**:
- `AuctionNotOpen` if the auction isn't in OPEN state.
- `ManifestHashMismatch` if `packet.manifestHash` doesn't match the stored manifest hash from creation.
- `InvalidSequencerSig` if the recovered signer doesn't match `sequencerAddress`.

**Verification flow:**
1. Check auction is OPEN.
2. Verify `packet.manifestHash == auction.manifestHash` (integrity check).
3. Compute EIP-712 struct hash from the 7 packet fields.
4. Compute digest using `DOMAIN_SEPARATOR`.
5. Recover signer via `ECDSA.recover`.
6. Compare recovered address to `sequencerAddress`.
7. Store all result fields and emit event.

#### markSettled

```solidity
function markSettled(bytes32 auctionId) external onlyEscrow
```

Called by AuctionEscrow after the CRE settlement workflow completes successfully. Transitions the auction to its terminal `SETTLED` state.

| Parameter | Type | Description |
|---|---|---|
| `auctionId` | `bytes32` | The auction to mark as settled. |

**Access**: Escrow contract only.
**State transition**: `CLOSED` to `SETTLED`.
**Emits**: `AuctionSettled(auctionId)`
**Reverts**: `OnlyEscrow` if caller is not the escrow, `AuctionNotClosed` if auction isn't in CLOSED state.

#### cancelExpiredAuction

```solidity
function cancelExpiredAuction(bytes32 auctionId) external
```

Cancels an auction that has been OPEN for too long without a result. The 72-hour grace period after the deadline gives the sequencer time to submit results for auctions that closed near the deadline.

| Parameter | Type | Description |
|---|---|---|
| `auctionId` | `bytes32` | The auction to cancel. |

**Access**: Permissionless. Anyone can call this once the timeout expires.
**State transition**: `OPEN` to `CANCELLED`.
**Timeout**: `block.timestamp >= auction.deadline + 72 hours`
**Emits**: `AuctionCancelled(auctionId)`
**Reverts**: `AuctionNotOpen` if auction isn't OPEN, `AuctionNotExpired` if the 72-hour window hasn't passed.

#### updateWinnerWallet

```solidity
function updateWinnerWallet(
    bytes32 auctionId,
    address newWallet,
    bytes calldata sig
) external
```

Allows the auction winner to rotate their payout wallet. The current `winnerWallet` must sign an EIP-712 message (Domain 2) authorizing the change. This supports key rotation scenarios where an agent's runtime key changes after winning.

| Parameter | Type | Description |
|---|---|---|
| `auctionId` | `bytes32` | The auction whose winner wallet to update. |
| `newWallet` | `address` | New payout address. Cannot be zero. |
| `sig` | `bytes` | EIP-712 signature from the current `winnerWallet`. |

**Access**: Permissionless (signature-gated by current winner wallet).
**Allowed states**: `CLOSED` or `SETTLED`.
**Emits**: `WinnerWalletUpdated(auctionId, oldWallet, newWallet)`
**Reverts**: `AuctionNotClosed` if auction is not CLOSED or SETTLED, `ZeroAddress` if `newWallet` is zero, `InvalidEIP712Sig` if the signer doesn't match the current winner wallet.

---

### View Functions

#### getAuctionState

```solidity
function getAuctionState(bytes32 auctionId) external view returns (AuctionState)
```

Returns the current state of an auction. Returns `NONE` (0) for non-existent auctions.

#### getWinner

```solidity
function getWinner(bytes32 auctionId) external view returns (
    uint256 agentId,
    address wallet,
    uint256 price
)
```

Returns the winner's agent ID, current wallet address, and final price. All values are zero if the auction hasn't been closed yet.

#### isCancelled

```solidity
function isCancelled(bytes32 auctionId) external view returns (bool)
```

Returns `true` if the auction is in `CANCELLED` state. Used by `AuctionEscrow` to determine refund eligibility for bonds deposited against cancelled auctions.

---

## Events

| Event | Parameters | When |
|---|---|---|
| `AuctionCreated` | `auctionId` (indexed), `manifestHash`, `reservePrice`, `depositAmount`, `deadline` | New auction created via `createAuction`. |
| `AuctionEnded` | `auctionId` (indexed), `winnerAgentId` (indexed), `winnerWallet`, `finalPrice`, `finalLogHash`, `replayContentHash` | Auction result recorded. **This is the CRE trigger event.** |
| `AuctionSettled` | `auctionId` (indexed) | CRE settlement completed via `markSettled`. |
| `AuctionCancelled` | `auctionId` (indexed) | Expired auction cancelled. |
| `WinnerWalletUpdated` | `auctionId` (indexed), `oldWallet`, `newWallet` | Winner rotated their payout address. |
| `SequencerUpdated` | `oldSequencer` (indexed), `newSequencer` (indexed) | Sequencer address changed by owner. |
| `EscrowBound` | `escrow` (indexed) | Escrow contract address set (one-time). |

---

## Errors

| Error | Thrown By | Condition |
|---|---|---|
| `OnlySequencer()` | `createAuction` | Caller is not the sequencer. |
| `OnlyEscrow()` | `markSettled` | Caller is not the escrow contract. |
| `AuctionAlreadyExists()` | `createAuction` | An auction with this ID already exists (state != NONE). |
| `AuctionNotOpen()` | `recordResult`, `cancelExpiredAuction` | Auction is not in OPEN state. |
| `AuctionNotClosed()` | `markSettled`, `updateWinnerWallet` | Auction is not in CLOSED (or SETTLED, for wallet rotation) state. |
| `InvalidSequencerSig()` | `recordResult` | EIP-712 signature recovery doesn't match sequencer address. |
| `EscrowAlreadyBound()` | `setEscrow` | Escrow address was already set. |
| `ZeroAddress()` | Constructor, `setEscrow`, `setSequencer`, `updateWinnerWallet` | Zero address provided where a valid address is required. |
| `AuctionNotExpired()` | `cancelExpiredAuction` | Current time is before `deadline + 72 hours`. |
| `InvalidEIP712Sig()` | `updateWinnerWallet` | Wallet rotation signature doesn't match current winner wallet. |
| `ManifestHashMismatch()` | `recordResult` | Settlement packet's manifest hash doesn't match the one stored at auction creation. |

---

## Integration with CRE

The `AuctionEnded` event is the trigger for the Chainlink CRE (Chainlink Runtime Environment) settlement workflow.

```
recordResult() emits AuctionEnded
        |
        v
CRE EVM Log Trigger (confidence: FINALIZED)
        |
        v
Phase A: Verify finalLogHash from AuctionRegistry
Phase B: Fetch ReplayBundleV1, verify against replayContentHash, re-derive winner
Phase C: Read ERC-8004 IdentityRegistry, verify agentId + wallet
Phase D: Call AuctionEscrow.onReport() via KeystoneForwarder
        |
        v
AuctionEscrow calls registry.markSettled(auctionId)
        |
        v
Auction reaches terminal SETTLED state
```

The `AuctionEnded` event includes all data the CRE workflow needs:
- `auctionId`: identifies which auction to settle
- `winnerAgentId`: the ERC-8004 identity to verify
- `winnerWallet`: the payout destination
- `finalPrice`: the amount to release from escrow
- `finalLogHash`: for log integrity verification
- `replayContentHash`: for independent winner re-derivation

The CRE workflow runs off-chain but its result is cryptographically verified on-chain through the KeystoneForwarder's DON signature verification before calling `AuctionEscrow.onReport()`.

---

## Security Fixes

Three security improvements were applied during the audit process:

### 1. ManifestHashMismatch: Manifest Integrity Enforcement

**Problem**: `recordResult` previously accepted any `manifestHash` in the settlement packet without checking it against the value stored at auction creation. A compromised sequencer could submit a result referencing a different manifest, effectively changing the auction's rules after the fact.

**Fix**: `recordResult` now compares `packet.manifestHash` against `auction.manifestHash` and reverts with `ManifestHashMismatch` if they differ. The manifest hash is locked at creation time and cannot be altered.

```solidity
if (packet.manifestHash != auction.manifestHash) revert ManifestHashMismatch();
```

### 2. EIP-712 Structured Signatures (was raw keccak256)

**Problem**: The original implementation used raw `keccak256(abi.encode(packet))` for signature verification. This approach has several weaknesses:
- No domain separation, so signatures could be replayed across chains or contracts.
- Wallets display an opaque hex blob instead of human-readable fields.
- No standard tooling support for verification.

**Fix**: Replaced with full EIP-712 structured data signing. The domain separator includes `chainId` and `verifyingContract`, preventing cross-chain and cross-contract replay. The `SETTLEMENT_TYPEHASH` encodes all 7 packet fields with their types, so wallets can display exactly what the sequencer is signing.

### 3. One-Time Escrow Binding (`_escrowBound` flag)

**Problem**: If `setEscrow` could be called repeatedly, a compromised owner key could redirect the escrow binding to a malicious contract. That contract could then call `markSettled` on any CLOSED auction, bypassing the CRE verification entirely.

**Fix**: The `_escrowBound` boolean flag ensures `setEscrow` can only succeed once. After the initial binding, any subsequent call reverts with `EscrowAlreadyBound`. The escrow address becomes effectively immutable after deployment configuration.

```solidity
function setEscrow(address escrow_) external onlyOwner {
    if (_escrowBound) revert EscrowAlreadyBound();
    if (escrow_ == address(0)) revert ZeroAddress();
    escrowAddress = escrow_;
    _escrowBound = true;
    emit EscrowBound(escrow_);
}
```

---

## Test Coverage

The test suite in `AuctionRegistry.t.sol` contains **30 tests** covering all public functions, revert paths, and security properties.

### Test Breakdown

| Category | Tests | What's Covered |
|---|---|---|
| Constructor | 3 | Domain separator set, typehash set, zero-address revert |
| `setEscrow` | 2 | One-time binding, zero-address revert |
| `setSequencer` | 2 | Address update, zero-address revert |
| `createAuction` | 4 | State set to OPEN, non-sequencer revert, duplicate revert, event emission |
| `recordResult` | 7 | Closes auction, stores winner, emits event, not-open revert, invalid sig revert, raw keccak sig rejection, manifest hash mismatch |
| `markSettled` | 3 | State to SETTLED, non-escrow revert, not-closed revert |
| `cancelExpiredAuction` | 3 | Successful cancel after timeout, not-expired revert, not-open revert |
| `updateWinnerWallet` | 2 | Successful rotation with EIP-712 sig, wrong-signer revert |
| `isCancelled` | 3 | Returns true for cancelled, false for open, false for non-existent |
| Manifest enforcement | 2 | Mismatch revert, correct hash succeeds |

### Key Test Patterns

**EIP-712 signature construction in tests:**
```solidity
bytes32 structHash = keccak256(abi.encode(
    registry.SETTLEMENT_TYPEHASH(),
    packet.auctionId,
    packet.manifestHash,
    packet.finalLogHash,
    packet.winnerAgentId,
    packet.winnerWallet,
    packet.winningBidAmount,
    packet.closeTimestamp
));
bytes32 digest = keccak256(abi.encodePacked("\x19\x01", registry.DOMAIN_SEPARATOR(), structHash));
(uint8 v, bytes32 r, bytes32 s) = vm.sign(sequencerPk, digest);
```

**Raw keccak rejection test** (`test_recordResult_rejectsRawKeccakSig`): Verifies that the old-style raw `keccak256(abi.encode(packet))` signature is rejected, confirming the EIP-712 migration is enforced.

**Wallet rotation test** (`test_updateWinnerWallet`): Constructs the Domain 2 separator inline, signs with the winner's private key, and verifies the wallet address updates correctly.

### Running Tests

```bash
# All AuctionRegistry tests
forge test --match-contract AuctionRegistryTest

# Verbose with traces
forge test --match-contract AuctionRegistryTest -vvv

# Single test
forge test --match-test test_recordResult_closesAuction -vvv
```
