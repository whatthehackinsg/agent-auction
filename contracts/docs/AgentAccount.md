# AgentAccount & AgentAccountFactory

Developer documentation for the Account Abstraction layer of the agent auction platform. These contracts give AI agents EIP-4337 smart wallets with secp256k1 runtime signing, deterministic deployment via CREATE2, and zero-ETH UX when paired with `AgentPaymaster`.

**Solidity**: 0.8.24 | **EVM**: Cancun | **Chain**: Base Sepolia (84532) | **EntryPoint v0.7**: `0x0000000071727De22E5E9d8BAf0edAc6f37da032`

---

## Table of Contents

- [Contract Dependency Graph](#contract-dependency-graph)
- [IAuctionTypes (Shared Types)](#iauctiontypes-shared-types)
- [AgentAccount](#agentaccount)
- [AgentAccountFactory](#agentaccountfactory)
- [Security Fixes](#security-fixes)
- [Deployment Notes](#deployment-notes)
- [Integration Examples](#integration-examples)
- [Test Coverage](#test-coverage)

---

## Contract Dependency Graph

```
IAuctionTypes (shared structs/enums)
    ^ imported by AuctionRegistry, AuctionEscrow, AgentPaymaster

AgentAccountFactory
    |-- deploys --> AgentAccount proxies (ERC1967Proxy, CREATE2)
    |-- holds  --> ACCOUNT_IMPLEMENTATION (singleton AgentAccount)
    |-- holds  --> ENTRY_POINT (IEntryPoint, immutable)

AgentAccount (EIP-4337 BaseAccount)
    |-- inherits --> BaseAccount (account-abstraction v0.7)
    |-- inherits --> Initializable (OpenZeppelin v5.1)
    |-- uses     --> ECDSA, MessageHashUtils (OpenZeppelin)
    |-- validates against --> EntryPoint v0.7
```

`AgentAccountFactory` creates `AgentAccount` proxies. Each proxy delegates to a single implementation contract deployed in the factory's constructor. The implementation itself has initializers disabled, so it can never be initialized directly.

---

## IAuctionTypes (Shared Types)

**File**: `src/interfaces/IAuctionTypes.sol`

A Solidity interface that defines the shared data structures used across `AuctionRegistry`, `AuctionEscrow`, and other auction contracts. No functions, just type declarations.

### AuctionState (enum)

```solidity
enum AuctionState {
    NONE,       // 0 - Default, auction does not exist
    OPEN,       // 1 - Accepting bids and bonds
    CLOSED,     // 2 - Bidding ended, awaiting settlement
    SETTLED,    // 3 - CRE workflow confirmed winner, escrow released
    CANCELLED   // 4 - Auction cancelled, all bonds refundable
}
```

State transitions follow a strict forward-only path: `NONE -> OPEN -> CLOSED -> SETTLED` or `NONE -> OPEN -> CLOSED -> CANCELLED`. No backward transitions are allowed.

### AuctionSettlementPacket (struct)

```solidity
struct AuctionSettlementPacket {
    bytes32 auctionId;        // Unique auction identifier
    bytes32 manifestHash;     // Hash of the auction manifest (task description)
    bytes32 finalLogHash;     // Hash of the complete append-only event log
    uint256 winnerAgentId;    // ERC-8004 agent ID of the winner
    address winnerWallet;     // Payout address for the winner
    uint256 winningBidAmount; // Final winning bid in USDC (6 decimals)
    uint64  closeTimestamp;   // Unix timestamp when bidding closed
}
```

This struct is ABI-encoded by the CRE workflow and delivered to `AuctionEscrow.onReport()` via `KeystoneForwarder`. It contains everything needed to verify and execute settlement on-chain.

### BondRecord (struct)

```solidity
struct BondRecord {
    address depositor;  // Address that deposited the bond (AgentAccount wallet)
    uint256 amount;     // Bond amount in USDC (6 decimals)
    bool    refunded;   // Whether the bond has been refunded via claimRefund()
}
```

Tracks individual bond deposits per agent per auction. The `refunded` flag prevents double-claim attacks on the pull-based refund mechanism.

---

## AgentAccount

**File**: `src/AgentAccount.sol` (103 lines)

An EIP-4337 smart wallet designed for AI agents. Each agent gets a dedicated `AgentAccount` proxy that holds funds, executes arbitrary calls, and validates UserOperations using a secp256k1 runtime signer.

### Inheritance

```
BaseAccount (account-abstraction v0.7)
Initializable (OpenZeppelin v5.1)
```

### State Variables

| Variable | Type | Visibility | Description |
|---|---|---|---|
| `_ENTRY_POINT` | `IEntryPoint` | `private immutable` | EIP-4337 EntryPoint v0.7 address. Set in constructor, never changes. |
| `runtimeSigner` | `address` | `public` | The secp256k1 address authorized to sign UserOperations for this account. Rotatable. |

### Events

```solidity
/// @notice Emitted when the runtime signer is rotated.
/// @param oldSigner The previous signer address.
/// @param newSigner The new signer address.
event RuntimeSignerRotated(address indexed oldSigner, address indexed newSigner);
```

### Errors

```solidity
error InvalidSigner();         // Reserved for future use
error OnlyEntryPointOrSelf();  // Caller is neither EntryPoint nor the account itself
error ZeroAddress();           // Attempted to set signer to address(0)
```

### Constructor

```solidity
constructor(IEntryPoint entryPoint_)
```

Sets the immutable `_ENTRY_POINT` reference and calls `_disableInitializers()` to prevent the implementation contract from being initialized. Only proxies should be initialized.

**Parameters**:
- `entryPoint_`: The EIP-4337 EntryPoint v0.7 contract address.

### Functions

#### `initialize`

```solidity
function initialize(address runtimeSigner_) external initializer
```

One-time setup called by the factory during proxy deployment. Sets the initial runtime signer. Protected by OpenZeppelin's `initializer` modifier, so it reverts on any subsequent call.

**Parameters**:
- `runtimeSigner_`: The secp256k1 address that will sign UserOperations. Must not be `address(0)`.

**Reverts**:
- `ZeroAddress()` if `runtimeSigner_` is the zero address.
- `InvalidInitialization()` (OpenZeppelin) if called more than once.

---

#### `entryPoint`

```solidity
function entryPoint() public view override returns (IEntryPoint)
```

Returns the immutable EntryPoint reference. Required by `BaseAccount`.

**Returns**: The `IEntryPoint` contract this account is bound to.

---

#### `execute`

```solidity
function execute(
    address target,
    uint256 value,
    bytes calldata data
) external onlyEntryPointOrSelf returns (bytes memory)
```

Executes a single arbitrary call from this account. This is the primary way agents interact with other contracts (approve USDC, deposit bonds, call registry functions, etc.).

**Parameters**:
- `target`: The contract or EOA to call.
- `value`: ETH value to send with the call (usually 0 for USDC operations).
- `data`: ABI-encoded calldata for the target function.

**Returns**: The raw bytes returned by the target call.

**Reverts**:
- `OnlyEntryPointOrSelf()` if the caller is not the EntryPoint or the account itself.
- Bubbles up the target's revert reason if the call fails.

**Access**: `onlyEntryPointOrSelf`

---

#### `executeBatch`

```solidity
function executeBatch(
    address[] calldata targets,
    uint256[] calldata values,
    bytes[] calldata datas
) external onlyEntryPointOrSelf returns (bytes[] memory results)
```

Executes multiple calls atomically in a single UserOperation. Useful for multi-step flows like "approve USDC + deposit bond" in one transaction.

**Parameters**:
- `targets`: Array of addresses to call.
- `values`: Array of ETH values for each call.
- `datas`: Array of calldata payloads for each call.

**Returns**: Array of raw return data from each call.

**Reverts**:
- `OnlyEntryPointOrSelf()` if the caller is not the EntryPoint or the account itself.
- `"length mismatch"` if the three arrays have different lengths.
- Bubbles up the first failing call's revert reason (all-or-nothing execution).

**Access**: `onlyEntryPointOrSelf`

---

#### `setRuntimeSigner`

```solidity
function setRuntimeSigner(address newSigner) external onlyEntryPointOrSelf
```

Rotates the runtime signing key. The agent's on-chain identity (ERC-8004 agentId) stays the same; only the key authorized to sign UserOperations changes. This supports key rotation without redeploying the account.

**Parameters**:
- `newSigner`: The new secp256k1 signer address. Must not be `address(0)`.

**Emits**: `RuntimeSignerRotated(oldSigner, newSigner)`

**Reverts**:
- `OnlyEntryPointOrSelf()` if the caller is not the EntryPoint or the account itself.
- `ZeroAddress()` if `newSigner` is `address(0)`.

**Access**: `onlyEntryPointOrSelf`

---

#### `_validateSignature` (internal)

```solidity
function _validateSignature(
    PackedUserOperation calldata userOp,
    bytes32 userOpHash
) internal view override returns (uint256 validationData)
```

Core EIP-4337 signature validation. Called by the EntryPoint during UserOperation validation. Recovers the signer from the signature and checks it against `runtimeSigner`.

**Parameters**:
- `userOp`: The packed UserOperation containing the signature in `userOp.signature`.
- `userOpHash`: The hash of the UserOperation as computed by the EntryPoint.

**Returns**:
- `0` (SIG_VALIDATION_SUCCESS) if the signature is valid and matches `runtimeSigner`.
- `1` (SIG_VALIDATION_FAILED) if the signature is invalid, malformed, or from a different signer.

**Security**: Uses `ECDSA.tryRecover` instead of `ECDSA.recover`. See [Security Fixes](#security-fixes) for details.

---

#### `receive`

```solidity
receive() external payable
```

Allows the account to receive ETH. Necessary for gas prefunding and any ETH-denominated operations.

---

### Access Control: `onlyEntryPointOrSelf`

The `onlyEntryPointOrSelf` modifier protects all state-changing functions. Only two callers are allowed:

1. **EntryPoint** (`0x0000000071727De22E5E9d8BAf0edAc6f37da032`): During UserOperation execution. This is the normal path for agent-initiated transactions.
2. **The account itself** (`address(this)`): For internal calls, such as when `executeBatch` triggers nested operations or when the account calls itself through a UserOperation.

Any other caller gets `OnlyEntryPointOrSelf()`.

---

## AgentAccountFactory

**File**: `src/AgentAccountFactory.sol` (41 lines)

A factory contract that deploys `AgentAccount` proxies using CREATE2 for deterministic addresses. Given the same `runtimeSigner` and `salt`, the resulting account address is identical across any chain where the factory is deployed at the same address.

### State Variables

| Variable | Type | Visibility | Description |
|---|---|---|---|
| `ACCOUNT_IMPLEMENTATION` | `AgentAccount` | `public immutable` | The singleton implementation contract. All proxies delegate to this. |
| `ENTRY_POINT` | `IEntryPoint` | `public immutable` | The EIP-4337 EntryPoint, passed through to the implementation. |

### Events

```solidity
/// @notice Emitted when a new AgentAccount proxy is deployed.
/// @param account The address of the newly deployed proxy.
/// @param runtimeSigner The initial runtime signer for the account.
/// @param salt The CREATE2 salt used for deployment.
event AccountCreated(address indexed account, address indexed runtimeSigner, uint256 salt);
```

### Constructor

```solidity
constructor(IEntryPoint entryPoint_)
```

Deploys the singleton `AgentAccount` implementation and stores both the implementation address and the EntryPoint reference as immutables.

**Parameters**:
- `entryPoint_`: The EIP-4337 EntryPoint v0.7 contract.

**Side effects**: Deploys one `AgentAccount` implementation contract. This implementation has its initializers disabled and serves only as a delegate target.

### Functions

#### `createAccount`

```solidity
function createAccount(
    address runtimeSigner,
    uint256 salt
) external returns (AgentAccount)
```

Deploys a new `AgentAccount` proxy or returns the existing one if already deployed. The proxy is an `ERC1967Proxy` pointing to `ACCOUNT_IMPLEMENTATION`, initialized with the given `runtimeSigner`.

**Parameters**:
- `runtimeSigner`: The secp256k1 address that will sign UserOperations for this account.
- `salt`: A `uint256` salt for CREATE2 address derivation. Different salts produce different addresses for the same signer.

**Returns**: The `AgentAccount` at the computed address (newly deployed or pre-existing).

**Behavior**:
1. Computes the deterministic address via `getAddress(runtimeSigner, salt)`.
2. If code already exists at that address, returns the existing account (idempotent).
3. Otherwise, deploys an `ERC1967Proxy` with CREATE2 using `bytes32(salt)`, encoding `AgentAccount.initialize(runtimeSigner)` as the initialization call.
4. Emits `AccountCreated`.

**Emits**: `AccountCreated(proxyAddress, runtimeSigner, salt)` on new deployments only.

---

#### `getAddress`

```solidity
function getAddress(
    address runtimeSigner,
    uint256 salt
) public view returns (address)
```

Computes the deterministic address for an account without deploying it. Useful for pre-computing addresses before deployment (e.g., to pre-fund the account or register it in an identity system).

**Parameters**:
- `runtimeSigner`: The signer that would be used for initialization.
- `salt`: The CREATE2 salt.

**Returns**: The address where the proxy would be (or is) deployed.

**Note**: This function reconstructs the full proxy creation bytecode (including constructor args) and hashes it with the salt. The result matches `createAccount` exactly.

---

## Security Fixes

### tryRecover vs. recover (Critical)

**Location**: `AgentAccount._validateSignature()` (line 97)

**Problem**: The original implementation used `ECDSA.recover()`, which reverts on malformed or invalid signatures. Per the EIP-4337 specification, `_validateSignature` must never revert. It should return `SIG_VALIDATION_FAILED` (value `1`) for invalid signatures so the EntryPoint can handle the failure gracefully.

A reverting `_validateSignature` causes the entire UserOperation to fail at the validation stage with an opaque error, making it impossible for bundlers to simulate and for the EntryPoint to properly attribute the failure.

**Fix**: Replaced `ECDSA.recover()` with `ECDSA.tryRecover()`:

```solidity
// BEFORE (broken):
address recovered = ECDSA.recover(ethSignedHash, userOp.signature);
if (recovered != runtimeSigner) return 1;

// AFTER (correct):
(address recovered, ECDSA.RecoverError err,) = ECDSA.tryRecover(ethSignedHash, userOp.signature);
if (err != ECDSA.RecoverError.NoError || recovered != runtimeSigner) return 1;
```

`tryRecover` returns a tuple of `(address, RecoverError, bytes32)` instead of reverting. The function checks both that recovery succeeded (`err == NoError`) and that the recovered address matches `runtimeSigner`. Any failure returns `1`.

**Impact**: Without this fix, malformed signatures (wrong length, invalid `v` value, etc.) would revert the entire validation call instead of returning a clean failure code. This breaks bundler simulation and violates the EIP-4337 spec.

### Initializer Pattern

**Location**: `AgentAccount.constructor()` (line 37)

The implementation contract calls `_disableInitializers()` in its constructor. This prevents anyone from calling `initialize()` on the implementation directly. Only proxies (deployed by the factory) can be initialized, and only once.

Without this guard, an attacker could call `initialize()` on the implementation, set themselves as `runtimeSigner`, and potentially interfere with proxy behavior through `delegatecall` edge cases.

### onlyEntryPointOrSelf Guard

**Location**: `AgentAccount._checkEntryPointOrSelf()` (line 29)

All state-changing functions (`execute`, `executeBatch`, `setRuntimeSigner`) are gated behind this modifier. It ensures that only the EntryPoint (during UserOp execution) or the account itself (during internal calls) can trigger state changes.

This prevents:
- Random callers from draining the account's funds.
- Unauthorized signer rotation.
- Arbitrary code execution through the account.

---

## Deployment Notes

### Deployment Order

1. **EntryPoint v0.7** must already exist at `0x0000000071727De22E5E9d8BAf0edAc6f37da032` (canonical deployment on Base Sepolia).
2. Deploy `AgentAccountFactory(entryPoint)`. This also deploys the singleton `AgentAccount` implementation.
3. Call `factory.createAccount(runtimeSigner, salt)` for each agent that needs an account.

### Deterministic Addresses

Addresses are fully deterministic given:
- The factory's deployed address
- The `runtimeSigner` parameter
- The `salt` parameter

You can compute an agent's account address before deployment using `factory.getAddress(signer, salt)`. This lets you:
- Pre-fund the account with USDC or ETH before it exists on-chain.
- Register the address in an ERC-8004 identity registry before the account is deployed.
- Reference the address in off-chain systems (MCP gateway config, sequencer allowlists).

### Proxy Architecture

Each `AgentAccount` is an `ERC1967Proxy` that delegates all calls to the shared implementation. Storage lives in the proxy; logic lives in the implementation. This means:
- All accounts share the same bytecode (gas-efficient deployment).
- The implementation can't be upgraded (no upgrade mechanism is included, by design).
- Each proxy has its own `runtimeSigner` stored in its own storage slot.

### Gas Considerations

Account creation costs roughly 200k-250k gas (proxy deployment + initialization). On Base Sepolia (OP Stack L2), this is very cheap. When paired with `AgentPaymaster`, the agent doesn't need any ETH at all; the paymaster sponsors the gas.

---

## Integration Examples

### Creating an Agent Account

```solidity
// Off-chain: generate a secp256k1 keypair for the agent
// On-chain: deploy the account via the factory

AgentAccountFactory factory = AgentAccountFactory(FACTORY_ADDRESS);
address agentSigner = 0x...; // Agent's runtime public key
uint256 salt = 0;            // Use 0 for the first account per signer

AgentAccount account = factory.createAccount(agentSigner, salt);
// account is now live at a deterministic address
```

### Pre-computing an Address

```solidity
// Compute the address without deploying
address predicted = factory.getAddress(agentSigner, salt);

// Pre-fund with USDC
IERC20(USDC).transfer(predicted, 100e6); // 100 USDC

// Deploy later; the account will already have funds
factory.createAccount(agentSigner, salt);
```

### Executing a Bond Deposit (via UserOperation)

The agent signs a UserOperation that calls `execute` to approve and deposit USDC into `AuctionEscrow`:

```solidity
// Step 1: Agent builds calldata for USDC approval
bytes memory approveData = abi.encodeCall(
    IERC20.approve,
    (address(escrow), bondAmount)
);

// Step 2: Agent builds calldata for bond deposit
bytes memory depositData = abi.encodeCall(
    AuctionEscrow.depositBond,
    (auctionId, agentId, bondAmount)
);

// Step 3: Wrap in executeBatch for atomic execution
address[] memory targets = new address[](2);
targets[0] = address(usdc);
targets[1] = address(escrow);

uint256[] memory values = new uint256[](2);
// both zero, USDC is an ERC-20 call

bytes[] memory datas = new bytes[](2);
datas[0] = approveData;
datas[1] = depositData;

// Step 4: Build UserOperation with this as callData
bytes memory callData = abi.encodeCall(
    AgentAccount.executeBatch,
    (targets, values, datas)
);
// Sign the UserOp with the agent's runtime key, submit to bundler
```

### Rotating the Runtime Signer

```solidity
// Agent submits a UserOperation that calls setRuntimeSigner
bytes memory callData = abi.encodeCall(
    AgentAccount.setRuntimeSigner,
    (newSignerAddress)
);
// Build UserOp with this callData, sign with current runtime key
// After execution, only the new key can sign future UserOps
```

### How AgentPaymaster Interacts

`AgentPaymaster` checks whether an incoming UserOperation is from a known `AgentAccount` and whether that agent has an active bond in `AuctionEscrow`. If so, it sponsors the gas. The paymaster never calls `AgentAccount` directly; it reads the `sender` field from the UserOperation and queries the escrow for bond status.

---

## Test Coverage

**File**: `test/AgentAccount.t.sol` | **Tests**: 15 | **Status**: All passing

The test suite covers the factory, initialization, execution, signer management, signature validation, and ETH reception. Tests use `vm.prank(ENTRY_POINT)` to simulate calls from the EntryPoint and `vm.sign()` to produce valid/invalid signatures.

### Test Inventory

| # | Test Name | Category | What It Verifies |
|---|---|---|---|
| 1 | `test_factory_createsDeterministicAddress` | Factory | `createAccount` returns the address predicted by `getAddress` |
| 2 | `test_factory_sameParamsReturnsSameAccount` | Factory | Calling `createAccount` twice with same params returns the same address (idempotent) |
| 3 | `test_factory_differentSaltDifferentAddress` | Factory | Different salt produces a different account address |
| 4 | `test_runtimeSigner_isSetAfterInit` | Initialize | `runtimeSigner` matches the value passed to `initialize` |
| 5 | `test_initialize_cannotBeCalledTwice` | Initialize | Second call to `initialize` reverts (initializer guard) |
| 6 | `test_execute_fromEntryPoint` | Execute | EntryPoint can call `execute` to send ETH |
| 7 | `test_execute_fromSelf` | Execute | Account can call `execute` on itself |
| 8 | `test_execute_revertsFromRandomCaller` | Execute | Random address gets `OnlyEntryPointOrSelf` revert |
| 9 | `test_executeBatch` | ExecuteBatch | Batch execution sends ETH to multiple targets atomically |
| 10 | `test_setRuntimeSigner_fromEntryPoint` | Signer | EntryPoint can rotate the runtime signer |
| 11 | `test_setRuntimeSigner_revertsZeroAddress` | Signer | Setting signer to `address(0)` reverts with `ZeroAddress` |
| 12 | `test_setRuntimeSigner_revertsFromRandomCaller` | Signer | Random caller gets `OnlyEntryPointOrSelf` revert |
| 13 | `test_validateSignature_correctSigner` | Validation | Valid signature from `runtimeSigner` returns 0 (success) |
| 14 | `test_validateSignature_wrongSigner` | Validation | Signature from wrong key returns 1 (SIG_VALIDATION_FAILED) |
| 15 | `test_receiveEth` | Receive | Account accepts plain ETH transfers |

### Coverage Gaps (Known)

- No fuzz tests for signature validation (e.g., random bytes as signature input).
- No test for `executeBatch` with mismatched array lengths.
- No test for `execute` when the target call reverts (bubble-up behavior).
- No test for `setRuntimeSigner` emitting the `RuntimeSignerRotated` event.
- No integration test with a real `EntryPoint` contract (tests use `vm.etch` + `vm.prank`).

These are acceptable for the hackathon MVP. Production deployment should add these before mainnet.
