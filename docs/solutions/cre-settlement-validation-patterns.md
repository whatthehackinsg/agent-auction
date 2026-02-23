# CRE Settlement Workflow Security Validation Patterns
## Real-World Examples & Benchmarks (Feb 2026)

---

## EXAMPLE 1: ReceiverTemplate (Chainlink Official Standard)
**Source**: [smartcontractkit/cre-bootcamp-2026](https://github.com/smartcontractkit/cre-bootcamp-2026/blob/main/prediction-market/contracts/src/interfaces/ReceiverTemplate.sol)  
**Permalink**: https://github.com/smartcontractkit/cre-bootcamp-2026/blob/main/prediction-market/contracts/src/interfaces/ReceiverTemplate.sol#L76-L120

### What It Validates

#### 1. **Caller Identity (Forwarder Verification)**
```solidity
// Line 83-85: Verify caller is the trusted Chainlink Forwarder
if (s_forwarderAddress != address(0) && msg.sender != s_forwarderAddress) {
  revert InvalidSender(msg.sender, s_forwarderAddress);
}
```
- **Why it matters**: Prevents unauthorized contracts from calling `onReport()` with arbitrary data
- **Pattern**: Caller address check BEFORE any state mutation
- **Severity**: CRITICAL — This is the first line of defense

#### 2. **Workflow Identity Validation (3-Layer Defense)**
```solidity
// Lines 88-117: Decode and validate workflow metadata
(bytes32 workflowId, bytes10 workflowName, address workflowOwner) = _decodeMetadata(metadata);

// Check 1: Workflow ID (if configured)
if (s_expectedWorkflowId != bytes32(0) && workflowId != s_expectedWorkflowId) {
  revert InvalidWorkflowId(workflowId, s_expectedWorkflowId);
}

// Check 2: Workflow Owner (if configured)
if (s_expectedAuthor != address(0) && workflowOwner != s_expectedAuthor) {
  revert InvalidAuthor(workflowOwner, s_expectedAuthor);
}

// Check 3: Workflow Name (requires author validation)
if (s_expectedWorkflowName != bytes10(0)) {
  if (s_expectedAuthor == address(0)) {
    revert WorkflowNameRequiresAuthorValidation();
  }
  if (workflowName != s_expectedWorkflowName) {
    revert InvalidWorkflowName(workflowName, s_expectedWorkflowName);
  }
}
```
- **Why it matters**: Ensures only the expected workflow can trigger settlement
- **Pattern**: Metadata decoding via assembly (lines 221-225) — efficient, safe
- **Severity**: HIGH — Prevents workflow spoofing

#### 3. **Metadata Decoding (Assembly-Based)**
```solidity
// Lines 213-227: Safe assembly decoding
function _decodeMetadata(bytes memory metadata) internal pure returns (bytes32 workflowId, bytes10 workflowName, address workflowOwner) {
  assembly {
    workflowId := mload(add(metadata, 32))      // Offset 32, size 32
    workflowName := mload(add(metadata, 64))    // Offset 64, size 10
    workflowOwner := shr(mul(12, 8), mload(add(metadata, 74)))  // Offset 74, size 20, right-shift to extract address
  }
}
```
- **Why it matters**: Correctly extracts workflow metadata from packed bytes
- **Pattern**: Uses `mload` + `shr` for safe extraction without ABI decoding overhead
- **Severity**: MEDIUM — Incorrect decoding breaks all downstream validation

---

## EXAMPLE 2: PredictionMarket (Bootcamp Implementation)
**Source**: [smartcontractkit/cre-bootcamp-2026](https://github.com/smartcontractkit/cre-bootcamp-2026/blob/main/prediction-market/contracts/src/PredictionMarket.sol)  
**Permalink**: https://github.com/smartcontractkit/cre-bootcamp-2026/blob/main/prediction-market/contracts/src/PredictionMarket.sol#L133-L170

### What It Validates

#### 1. **Event Decoding & State Validation**
```solidity
// Lines 136-153: Decode settlement report and validate market state
function _settleMarket(bytes calldata report) internal {
  (uint256 marketId, Prediction outcome, uint16 confidence) = abi.decode(
    report,
    (uint256, Prediction, uint16)
  );

  Market memory m = markets[marketId];

  // Cross-check: Market must exist
  if (m.creator == address(0)) revert MarketDoesNotExist();
  
  // Cross-check: Market must not already be settled
  if (m.settled) revert MarketAlreadySettled();

  // State mutation AFTER validation
  markets[marketId].settled = true;
  markets[marketId].confidence = confidence;
  markets[marketId].settledAt = uint48(block.timestamp);
  markets[marketId].outcome = outcome;

  emit MarketSettled(marketId, outcome, confidence);
}
```
- **Why it matters**: Validates report payload matches on-chain state before settlement
- **Pattern**: Decode → Validate → Mutate (checks-effects-interactions)
- **Severity**: CRITICAL — Prevents double-settlement and invalid market IDs

#### 2. **Report Routing (Prefix-Based Dispatch)**
```solidity
// Lines 163-170: Route based on report prefix byte
function _processReport(bytes calldata report) internal override {
  if (report.length > 0 && report[0] == 0x01) {
    _settleMarket(report[1:]);  // Settlement flow
  } else {
    string memory question = abi.decode(report, (string));
    createMarket(question);      // Creation flow
  }
}
```
- **Why it matters**: Prevents accidental settlement of creation reports
- **Pattern**: Explicit prefix byte for flow control
- **Severity**: MEDIUM — Prevents logic confusion

#### 3. **Payout Calculation (Cross-Check with Pool State)**
```solidity
// Lines 192-194: Verify payout against on-chain pool state
uint256 totalPool = m.totalYesPool + m.totalNoPool;
uint256 winningPool = m.outcome == Prediction.Yes ? m.totalYesPool : m.totalNoPool;
uint256 payout = (userPred.amount * totalPool) / winningPool;
```
- **Why it matters**: Ensures payout is derived from on-chain state, not report data
- **Pattern**: Recalculate from state, don't trust report values
- **Severity**: CRITICAL — Prevents payout manipulation

---

## EXAMPLE 3: Chainlink CRE Documentation Pattern
**Source**: [Chainlink Docs - Building Consumer Contracts](https://docs.chain.link/cre/guides/workflow/using-evm-client/onchain-write/building-consumer-contracts)  
**Permalink**: https://docs.chain.link/cre/guides/workflow/using-evm-client/onchain-write/building-consumer-contracts#7-security-considerations

### What It Validates

#### 1. **Forwarder Address Validation (Required at Deployment)**
```solidity
constructor(address _forwarderAddress) Ownable(msg.sender) {
  if (_forwarderAddress == address(0)) {
    revert InvalidForwarderAddress();
  }
  s_forwarderAddress = _forwarderAddress;
  emit ForwarderAddressUpdated(address(0), _forwarderAddress);
}
```
- **Why it matters**: Prevents accidental deployment with zero forwarder (would allow anyone to call onReport)
- **Pattern**: Constructor validation + event emission for audit trail
- **Severity**: CRITICAL — Deployment-time safety check

#### 2. **Replay Protection (Implicit via Forwarder)**
- **Pattern**: KeystoneForwarder validates signatures before calling onReport
- **Why it matters**: Prevents replay of old settlement reports
- **Severity**: HIGH — Handled by Chainlink infrastructure, not contract

#### 3. **Workflow Name Collision Prevention**
```solidity
// Lines 98-116: Enforce workflow name validation requires author validation
if (s_expectedWorkflowName != bytes10(0)) {
  if (s_expectedAuthor == address(0)) {
    revert WorkflowNameRequiresAuthorValidation();
  }
  if (workflowName != s_expectedWorkflowName) {
    revert InvalidWorkflowName(workflowName, s_expectedWorkflowName);
  }
}
```
- **Why it matters**: Workflow names use 40-bit truncation (bytes10), allowing collisions across owners. Requires author validation to prevent spoofing.
- **Pattern**: Dependency enforcement at runtime
- **Severity**: MEDIUM — Prevents collision attacks

---

## EXAMPLE 4: Advanced Validation Pattern (Custom Logic)
**Source**: [Chainlink Docs - Advanced Usage](https://docs.chain.link/cre/guides/workflow/using-evm-client/onchain-write/building-consumer-contracts#51-custom-validation-logic)

### What It Validates

#### 1. **Rate Limiting (Temporal Validation)**
```solidity
function onReport(bytes calldata metadata, bytes calldata report) external override {
  // Custom check: Rate limiting
  if (block.timestamp < s_lastReportTime + s_minReportInterval) {
    revert ReportTooFrequent(block.timestamp - s_lastReportTime, s_minReportInterval);
  }

  // Call parent implementation for standard permission checks
  super.onReport(metadata, report);

  s_lastReportTime = block.timestamp;
}
```
- **Why it matters**: Prevents settlement spam and ensures minimum time between updates
- **Pattern**: Custom validation before parent checks
- **Severity**: MEDIUM — Application-specific safety

#### 2. **Metadata-Aware Business Logic**
```solidity
function _processReport(bytes calldata report) internal override {
  // Access the metadata to get workflow ID
  bytes calldata metadata = msg.data[4:]; // Skip function selector
  (bytes32 workflowId, , ) = _decodeMetadata(metadata);

  // Use workflow ID in your business logic
  s_reportCountByWorkflow[workflowId]++;
}
```
- **Why it matters**: Allows per-workflow tracking and audit trails
- **Pattern**: Metadata extraction for business logic
- **Severity**: LOW — Audit/monitoring only

---

## SECURITY VALIDATION CHECKLIST

### ✅ Implemented in All Examples

| Check | ReceiverTemplate | PredictionMarket | CRE Docs | Custom Logic |
|-------|------------------|------------------|----------|--------------|
| **Forwarder address validation** | ✅ (line 83) | ✅ (inherited) | ✅ (constructor) | ✅ (inherited) |
| **Workflow ID validation** | ✅ (line 91) | ✅ (inherited) | ✅ (line 91) | ✅ (inherited) |
| **Workflow owner validation** | ✅ (line 94) | ✅ (inherited) | ✅ (line 94) | ✅ (inherited) |
| **Workflow name validation** | ✅ (line 113) | ✅ (inherited) | ✅ (line 113) | ✅ (inherited) |
| **Metadata decoding** | ✅ (line 213) | ✅ (inherited) | ✅ (line 213) | ✅ (inherited) |
| **Report payload decoding** | ✅ (abstract) | ✅ (line 137) | ✅ (abstract) | ✅ (abstract) |
| **On-chain state cross-check** | ❌ (abstract) | ✅ (line 142) | ❌ (abstract) | ❌ (abstract) |
| **Checks-effects-interactions** | ✅ (line 119) | ✅ (line 147) | ✅ (line 119) | ✅ (line 119) |
| **Event emission** | ✅ (line 119) | ✅ (line 152) | ✅ (line 119) | ✅ (line 119) |
| **Rate limiting** | ❌ | ❌ | ❌ | ✅ (custom) |

---

## CRITICAL PATTERNS FOR YOUR AUCTION SETTLEMENT

### Pattern 1: Forwarder Validation (MUST HAVE)
```solidity
// In AuctionEscrow.onReport()
if (msg.sender != s_forwarderAddress) {
  revert InvalidForwarder(msg.sender);
}
```
**Why**: Prevents unauthorized settlement calls

### Pattern 2: Event Decoding + State Cross-Check (MUST HAVE)
```solidity
// Decode the settlement report
(uint256 auctionId, address winner, uint256 finalPrice) = abi.decode(report, (uint256, address, uint256));

// Cross-check against on-chain state
Auction memory auction = auctions[auctionId];
if (auction.state != AuctionState.CLOSED) {
  revert InvalidAuctionState(auction.state);
}

// Verify price is within expected range (if applicable)
if (finalPrice > auction.reservePrice * 2) {
  revert PriceOutOfBounds(finalPrice);
}
```
**Why**: Ensures report matches on-chain reality

### Pattern 3: Workflow Identity Validation (RECOMMENDED)
```solidity
// In constructor
constructor(address _forwarder, bytes32 _expectedWorkflowId) {
  s_forwarderAddress = _forwarder;
  s_expectedWorkflowId = _expectedWorkflowId;
}

// In onReport (via ReceiverTemplate)
// Automatically validates workflow ID from metadata
```
**Why**: Prevents settlement from wrong workflow

### Pattern 4: Checks-Effects-Interactions (MUST HAVE)
```solidity
// ✅ CORRECT ORDER
function _processReport(bytes calldata report) internal override {
  // 1. CHECKS: Validate everything
  (uint256 auctionId, address winner) = abi.decode(report, (uint256, address));
  Auction memory auction = auctions[auctionId];
  require(auction.state == AuctionState.CLOSED, "Not closed");

  // 2. EFFECTS: Update state
  auctions[auctionId].state = AuctionState.SETTLED;
  auctions[auctionId].winner = winner;

  // 3. INTERACTIONS: External calls (with ReentrancyGuard)
  USDC.transfer(winner, auction.bondAmount);
  emit AuctionSettled(auctionId, winner);
}
```
**Why**: Prevents reentrancy and state inconsistency

---

## VULNERABILITY PATTERNS TO AVOID

### ❌ Anti-Pattern 1: Trusting Report Data Over On-Chain State
```solidity
// WRONG: Using report value directly
function _processReport(bytes calldata report) internal override {
  (uint256 auctionId, uint256 totalBonded) = abi.decode(report, (uint256, uint256));
  // Directly using totalBonded from report — can be manipulated!
  USDC.transfer(msg.sender, totalBonded);
}

// CORRECT: Recalculate from on-chain state
function _processReport(bytes calldata report) internal override {
  (uint256 auctionId) = abi.decode(report, (uint256));
  Auction memory auction = auctions[auctionId];
  // Use on-chain state, not report
  USDC.transfer(msg.sender, auction.totalBonded);
}
```

### ❌ Anti-Pattern 2: Missing Forwarder Check
```solidity
// WRONG: No forwarder validation
function onReport(bytes calldata metadata, bytes calldata report) external {
  _processReport(report);  // Anyone can call!
}

// CORRECT: Validate forwarder
function onReport(bytes calldata metadata, bytes calldata report) external {
  if (msg.sender != s_forwarderAddress) {
    revert InvalidForwarder(msg.sender);
  }
  _processReport(report);
}
```

### ❌ Anti-Pattern 3: State Mutation Before Validation
```solidity
// WRONG: Mutate state first
function _processReport(bytes calldata report) internal override {
  (uint256 auctionId) = abi.decode(report, (uint256));
  auctions[auctionId].settled = true;  // Mutate first!
  
  // Then validate — too late if validation fails
  if (auctions[auctionId].state != AuctionState.CLOSED) {
    revert InvalidState();  // State already changed!
  }
}

// CORRECT: Validate first
function _processReport(bytes calldata report) internal override {
  (uint256 auctionId) = abi.decode(report, (uint256));
  
  // Validate first
  if (auctions[auctionId].state != AuctionState.CLOSED) {
    revert InvalidState();
  }
  
  // Then mutate
  auctions[auctionId].settled = true;
}
```

---

## BENCHMARK SCORING FOR YOUR CONTRACTS

### AuctionEscrow.onReport() Validation Score

**Expected Checks** (from examples):
1. ✅ Forwarder address validation
2. ✅ Workflow ID validation (via ReceiverTemplate)
3. ✅ Workflow owner validation (via ReceiverTemplate)
4. ✅ Report payload decoding
5. ✅ On-chain state cross-check (auction exists, state is CLOSED)
6. ✅ Price validation (if applicable)
7. ✅ Winner validation (if applicable)
8. ✅ Checks-effects-interactions order
9. ✅ Event emission for audit trail
10. ✅ ReentrancyGuard protection

**Scoring**:
- 10/10: All checks implemented
- 8/10: Missing price or winner validation
- 6/10: Missing on-chain state cross-check
- 4/10: Missing forwarder validation
- 0/10: No validation at all

---

## REFERENCES

1. **ReceiverTemplate (Official Standard)**
   - GitHub: https://github.com/smartcontractkit/cre-bootcamp-2026/blob/main/prediction-market/contracts/src/interfaces/ReceiverTemplate.sol
   - Docs: https://docs.chain.link/cre/guides/workflow/using-evm-client/onchain-write/building-consumer-contracts

2. **PredictionMarket (Real Implementation)**
   - GitHub: https://github.com/smartcontractkit/cre-bootcamp-2026/blob/main/prediction-market/contracts/src/PredictionMarket.sol

3. **CRE Security Best Practices**
   - Docs: https://docs.chain.link/cre/guides/workflow/using-evm-client/onchain-write/building-consumer-contracts#7-security-considerations

4. **Chainlink CRE Overview**
   - Docs: https://docs.chain.link/cre

---

**Document Generated**: Feb 23, 2026  
**Benchmark Version**: 1.0  
**Status**: Ready for audit cross-reference
