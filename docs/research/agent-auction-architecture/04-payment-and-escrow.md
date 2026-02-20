# Module 3: Payment (x402) & Escrow

> Split from [research_report_20260219_agent_auction_architecture.md](../research_report_20260219_agent_auction_architecture.md). Citations reference the shared [Bibliography](./06-appendix.md#bibliography).

---

### Module 3: Payment (x402)

**Current Design Assessment:** The platform-as-Merchant model with external Facilitator is correct for MVP. The analysis of bond/settlement/refund flows is thorough.

**Source of truth (normative):** x402 proves an HTTP-layer payment occurred (via facilitator settlement); on-chain USDC transfers are authoritative for funds; `AuctionRegistry` is authoritative for auction results; `AuctionEscrow` is authoritative for bond accounting and withdrawals.

**Trust boundaries (normative):** facilitator is a relayer (not custodian) but still a critical integration dependency; the platform backend is trusted to call `recordBond()` correctly (mitigated by tx-id idempotency and on-chain verification); CRE settlements are only accepted via `KeystoneForwarder` with workflowId/owner gating.

**Research Findings:**

x402 has grown since launch in May 2025: the x402 Foundation was established jointly by Coinbase and Cloudflare (September 2025) [12]. Adoption and volume metrics are commonly cited in press coverage, but primary telemetry is not publicly available; treat quantitative claims as non-authoritative [11]. The x402 V2 specification launched with an extensions system enabling service discovery via Bazaar and authentication features [13].

The `exact` EVM scheme uses EIP-3009 `transferWithAuthorization` as the primary mechanism. **Note:** The exact EVM scheme supports two asset transfer methods: EIP-3009 `transferWithAuthorization` (preferred, for USDC and compatible tokens) and **Permit2** (universal fallback for any ERC-20, via Uniswap's canonical Permit2 contract + `x402Permit2Proxy` deployed via CREATE2). The facilitator selects the method based on `extra.assetTransferMethod` (`"eip3009"` or `"permit2"`) in the `PaymentRequirements` [14]. **Critical architecture detail:** the facilitator is a gas-paying relayer, NOT a custodian — USDC transfers directly from the client wallet to the `payTo` address. The facilitator calls `transferWithAuthorization` on the USDC contract, but the client's EIP-712 signature cryptographically binds `from`, `to`, and `value`, making unauthorized diversion impossible [14]. The PaymentPayload structure requires: `signature` (the EIP-3009 auth signature) and `authorization` (containing `from`, `to`, `value`, `validAfter`, `validBefore`, `nonce`) [14].

**x402 V2 transport (current):** V2 uses three HTTP headers — `PAYMENT-REQUIRED` (server → client, base64-encoded `PaymentRequired` JSON), `PAYMENT-SIGNATURE` (client → server, base64-encoded `PaymentPayload` JSON), and `PAYMENT-RESPONSE` (server → client, base64-encoded `SettlementResponse` JSON). All are uppercase with hyphens, **no `X-` prefix**. Network identifiers use CAIP-2 format (e.g., `eip155:84532` for Base Sepolia). Check `@x402/core` changelog before integrating [13].

Available TypeScript packages: `@x402/core`, `@x402/evm`, `@x402/express`, `@x402/hono`, `@x402/next`, `@x402/axios`, `@x402/fetch`, `@x402/paywall` [15]. The Express middleware (`@x402/express`) provides drop-in paywall functionality.

**Critical limitation confirmed:** x402 exact payments are irreversible push payments. Refunds require a separate transaction from the merchant. This validates the design's decision to handle refunds via business logic rather than protocol.

**Atomicity — Bond deposit only (EIP-4337 agents):** For agents using `AgentAccount` (EIP-4337), the bond deposit is a direct USDC transfer via UserOp. The join action is separate: it goes through the Durable Object sequencer (HTTP/MCP path), which batches it on-chain via `ingestEventBatch()`.

```solidity
// UserOp: bond deposit only (on-chain, atomic)
UserOp.callData = AgentAccount.execute(
  USDC,                                    // target: USDC contract
  0,                                       // value: no ETH
  transfer(escrowAddress, bondAmount)       // direct USDC transfer (not x402)
)
// Bond bookkeeping: admin backend detects successful USDC transfer on-chain,
// then calls AuctionEscrow.recordBond() — idempotent on tx hash, retryable.
//
// Join action: agent sends signed EIP-712 Join struct to DO via HTTP/MCP.
// DO validates, assigns seq, appends to log, broadcasts via WebSocket.
// Sequencer batches the join event on-chain via ingestEventBatch().
```

The bond deposit and join action are intentionally decoupled. Bond deposit is on-chain (USDC transfer via UserOp). Join is off-chain first (DO sequencer for real-time ordering), then batched on-chain (sequencer calls `ingestEventBatch()`). This matches the hybrid model: real-time path through DO, settlement-critical path anchored on-chain by the sequencer. Bond bookkeeping (`recordBond`) is admin-mediated (`onlyAdmin` modifier), called after detecting the successful USDC transfer on-chain. Retryable and idempotent on the tx hash. **Note:** EIP-4337 agents do NOT use x402 for bond deposits. x402 is used for HTTP-layer micropayments (room access, manifest fetching) and for non-4337 EOA agents (see Fallback Strategy below). Gas is sponsored by `AgentPaymaster`. **MVP simplification:** gas debt tracking and deduction from escrow is a P1 feature. For the hackathon, the paymaster sponsors gas from its own ETH stake without per-agent accounting. The gas cost on Base Sepolia is negligible (~fractions of a cent per UserOp). P1 adds `gasDebtLedger` in AuctionEscrow to track and deduct accumulated gas costs at settlement.

**Fallback Strategy (non-4337 agents):** For agents using EOA wallets (Flow C hybrid), the original two strategies remain:
- **Strategy A (preferred):** Set x402 `payTo` to the escrow contract address directly. The platform backend then calls `recordBond(auctionId, agentId, depositor, amount, x402TxId)` — retryable and idempotent on `x402TxId`.
- **Strategy B (reconciliation):** If x402 pays to the platform wallet, track x402 `txID` as a receipt for retry.

**AgentPaymaster — Gas Sponsorship Economics:**
- `AgentPaymaster` implements `IPaymaster` (EIP-4337). It validates that the agent has sufficient locked deposit in escrow for the target auction. If yes, sponsors gas. If no, rejects — anti-spam gate without requiring ETH.
- `postOp()`: records gas cost against the agent's escrow balance. Gas debt accumulates during the auction.
- **MVP:** paymaster sponsors gas from its own ETH stake; no per-agent gas accounting. Base Sepolia gas costs are negligible. **P1 production:** `netPayout = deposit - gasDebt - platformFee`. Gas debt deducted from winnings (winner) or returned deposit (loser) via `gasDebtLedger` in AuctionEscrow.
- Paymaster deposits ETH stake into EntryPoint (`0x0000000071727De22E5E9d8BAf0edAc6f37da032`). For Base Sepolia: use Coinbase's native paymaster at `0xf5d253B62543C6Ef526309D497f619CeF95aD430` or deploy custom.
- Base Sepolia public bundlers: Pimlico, Alchemy, Coinbase CDP, Stackup — all support EntryPoint v0.7.

**CRE Integration (THE KEY):** x402 is an AI payments integration for CRE [16] (the "first AI payments partner" claim appears in promotional materials but could not be independently verified — use cautiously in technical documentation). The `smartcontractkit/x402-cre-price-alerts` repo demonstrates the pattern:
1. Express server with `@x402/express` middleware gates endpoints at $0.01 USDC
2. Agent uses x402 for HTTP-gated resources; settlement is CRE `onReport`; EIP-4337 bond deposit is direct USDC transfer (x402 is EOA fallback only)
3. Server triggers CRE workflow via HTTP Trigger for high-value transitions (settlement, delivery verification)
4. CRE workflow writes to chain via EVMClient
5. Chainlink Forwarder verifies the write came from a valid CRE DON

**Where CRE belongs and where it doesn't:** CRE should NOT gate every action. Real-time operations (bidding, admission, status checks) must stay in the low-latency path (Cloudflare DO, ~ms). CRE should gate only high-value, low-frequency transitions: auction settlement and delivery verification. Bond deposits flow to escrow directly via USDC transfer for EIP-4337 agents; x402 deposit path is EOA fallback. Neither path involves CRE.

**CRE + EIP-4337 boundary (critical architecture note):** CRE cannot natively construct or submit EIP-4337 UserOperations. CRE's `evm.write` always routes through KeystoneForwarder → `onReport()` — it cannot call arbitrary functions or interact with the EIP-4337 bundler mempool. This means: (1) CRE writes to AuctionEscrow (ReceiverTemplate) — this is a regular contract call, not a UserOp. (2) AgentAccount (EIP-4337 wallet) and AuctionEscrow (CRE consumer) are **separate contracts** with separate trust boundaries (`msg.sender == EntryPoint` for wallet, `msg.sender == KeystoneForwarder` for CRE). (3) Agents initiate UserOps; CRE settles via `onReport`. These are parallel, non-conflicting call paths. During research, no official reference implementation combining CRE settlement writes with EIP-4337 wallets was found; treat this as a novel integration point that must be tested end-to-end.

---

## Bond Deposits (NO CRE — Two Paths Depending on Agent Type)

Bonds do not go through CRE. This avoids putting CRE in a latency-sensitive admission path. There are two bond deposit paths:

**Authoritative admission gate (MVP):** DO must reject `JOIN`/`BID` unless escrow shows bond coverage (`bondRecords[auctionId][agentId] >= requiredDeposit`) via read/cache. If transfer is observed but `recordBond` is still pending, return deterministic `BOND_PENDING` (do not assign `seq`, do not append to log).

**Path 1 — EIP-4337 agents (direct USDC transfer via UserOp):**
EIP-4337 agents bypass x402 for bond deposits. Their smart wallet executes a UserOp: `USDC.transfer(escrowAddress, bondAmount)`. The USDC goes directly to the escrow contract, no x402 HTTP layer involved. The join action is separate: the agent sends a signed EIP-712 Join struct to the DO via HTTP/MCP, and the sequencer batches it on-chain via `ingestEventBatch()`. See "Atomicity" section above.

**Path 2 — Non-4337 / EOA agents (x402 HTTP flow):**
1. Agent hits bond endpoint → **server checks ERC-8004 identity first** (read IdentityRegistry on-chain or from cached state). If agent has no valid on-chain identity → return **HTTP 403 Forbidden** (not 402). This prevents ineligible agents from paying before rejection.
2. Identity valid → server returns HTTP 402 with `payTo = escrowContractAddress`
3. Agent signs x402 payment → Facilitator settles USDC directly into escrow contract
4. (Shared step — both paths converge here)

**Bond recording (both paths):** Platform backend calls `AuctionEscrow.recordBond(auctionId, agentId, depositor, amount, x402TxId)` (`onlyAdmin`) to register the deposit. `agentId` is the ERC-8004 NFT token ID (stable across wallet rotations). `depositor` is the wallet that paid — snapshotted for refund entitlement. `x402TxId` is the on-chain tx hash (Path 2: from `SettleResponse.transaction`; Path 1: from the UserOp's execution tx hash). **Important:** x402 core types define `transaction` as a generic `string` (not a typed `bytes32`), and x402 supports multiple protocol families (EVM, Solana, etc.) [14][25]. The platform backend MUST validate the format before casting: (a) confirm the scheme is `exact` and the network is an EVM chain, (b) assert the string is a 0x-prefixed 66-character hex string (`/^0x[0-9a-fA-F]{64}$/`), (c) only then cast to `bytes32`. Non-EVM schemes or malformed strings must be rejected before the `recordBond` call. The contract verifies `agentId` exists via `ownerOf` (reverts for invalid tokens).

If `recordBond` fails (network error), it can be retried — the USDC is already safely in escrow. The tx hash serves as an idempotency key.

**Trust assumption (bond attribution):** The `recordBond` call is operator bookkeeping — the operator decides which USDC deposit maps to which `(auctionId, agent)` pair. The x402 transfer itself is a generic USDC payment to the escrow contract with no embedded auction/agent metadata. This means the operator could theoretically misattribute deposits. For hackathon MVP, this is an acceptable trust assumption (the operator is already trusted for real-time operations). For production (P1), two stronger approaches:
- **Agent-direct deposit:** Agent calls `escrow.deposit(auctionId)` directly as `msg.sender`, providing on-chain attribution. The x402 flow would first transfer USDC to the agent's wallet, then the agent approves + deposits. More steps, but cryptographically bound.
- **x402 memo/nonce binding:** Encode `(auctionId, agentAddress)` in the x402 authorization nonce field. The escrow contract parses this on receipt via `onTokenTransfer` callback. Requires x402 scheme extension.

**Failure handling:** If x402 settles but `recordBond` is never called (platform crash), the agent has a USDC deposit in escrow with no accounting record. Mitigation: a reconciliation cron job reads escrow USDC balances and matches against `recordBond` entries, flagging orphaned deposits for manual resolution. For hackathon MVP, this edge case is documented but not implemented.

---

## CRE Workflow 2: Delivery Verification (HTTP Trigger)

**Separation of concerns:** Workflow 1 (Settlement) is the **only** path to release escrow funds. Workflow 2 writes a delivery proof on-chain but does NOT interact with AuctionEscrow. This is a deliberate design choice:
- AuctionEscrow is configured with a single `expectedWorkflowId` (Settlement). Delivery Verification uses a different workflowId and writes to `AuctionRegistry.recordDeliveryProof()` (a `DeliveryProof` mapping on the registry), not to the escrow.
- If delivery verification were also able to release escrow, we'd need either a multi-workflow allowlist on the escrow (increased attack surface) or a second escrow contract (increased complexity). Neither is justified for MVP.
- In the MVP flow: Settlement returns the winner's bond (security deposit) to their withdrawable balance. Buyer-funded prize payouts are a P1 feature — see Limitation #13 in [06-appendix.md](./06-appendix.md). Delivery verification is a *reputation signal* — its on-chain proof can be consumed by ERC-8004 ReputationRegistry or by future dispute resolution, but it does not gate fund movement.

1. **Trigger:** HTTP Trigger — winning agent submits delivery proof URL
2. **Callback:**
   - Fetch delivery result (HTTPClient) — e.g., CI test results, API output, structured data
   - Multiple DON nodes independently evaluate against **acceptance criteria defined in the AuctionManifest** (`taskDescriptionHash` → pinned spec, `acceptanceCriteria` → machine-readable evaluation rules). Acceptance criteria types: (a) exit-code pass/fail (CI test suite), (b) structured output schema validation (JSON Schema), (c) API response match (expected vs actual), (d) artifact hash match (deterministic build). The workflow's HTTP callback includes the acceptance criteria hash so each DON node evaluates against the same spec.
   - Consensus on pass/fail (BFT — ≥2f+1 nodes must agree)
3. **On-chain recording (two paths):**
   - **MVP path (⚠ split-trust — NOT fully oracle-enforced on-chain):** CRE workflow returns the consensus result to the platform backend (HTTP response). The platform backend calls `AuctionRegistry.recordDeliveryProof(auctionId, passed, proofHash)` via `onlyOwner`. The CRE consensus happens off-chain; the on-chain proof trusts the platform operator to honestly relay the result. An adversarial platform operator could suppress a delivery failure or fabricate a pass. See Limitation #14 in [06-appendix.md](./06-appendix.md) for production mitigation path.
   - **Production path (P1):** A dedicated `DeliveryVerifier` contract inherits `ReceiverTemplate` and receives CRE's `onReport` directly via EVMClient write. The verifier then calls `AuctionRegistry.recordDeliveryProof()`. Trust model: fully CRE-verified on-chain.
   - If delivery failed, emits `DeliveryFailed` event for off-chain dispute handling.
4. **Result:** Machine-verified delivery proof with decentralized consensus. This proof is **informational/reputational**, not fund-gating. The escrow is exclusively controlled by Workflow 1 (Settlement).

---

## Smart Contract Design: AuctionEscrow

**AuctionEscrow.sol** — USDC escrow inheriting CRE's ReceiverTemplate for secure onReport
```solidity
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ReceiverTemplate} from "./ReceiverTemplate.sol";  // Chainlink CRE consumer base [21]

contract AuctionEscrow is ReceiverTemplate, ReentrancyGuard {
    using SafeERC20 for IERC20;

    address public admin;                // Platform admin (bond recording)
    IERC20 public usdc;                  // USDC token contract
    IAuctionRegistry public registry;    // AuctionRegistry reference for state checks
    IERC8004 public identityRegistry;    // ERC-8004 for agent validity + refund auth

    // --- Storage: bond tracking ---
    // bondRecords: auctionId (bytes32) => agentId (ERC-8004 NFT token ID) => bond amount (in USDC atomic units)
    // IMPORTANT: Keyed by agentId, NOT wallet address. This prevents bond stranding when
    // an agent rotates their wallet between bond deposit and settlement. The agentId is
    // the stable identity; the wallet is mutable via setAgentWallet().
    mapping(bytes32 => mapping(uint256 => uint256)) public bondRecords;
    //
    // --- Bond Entitlement Policy: deposit-time beneficiary snapshot ---
    // bondDepositor records the wallet address that PAID the bond at deposit time.
    // Refund authorization uses this snapshot, NOT the current getAgentWallet().
    // Rationale: if an agent NFT is transferred or the wallet is rotated after deposit,
    // the original payer should receive the refund — not the new owner who never paid.
    // This is the "deposit-time snapshot" policy. Alternative ("rights follow NFT") would
    // use getAgentWallet() at claim time, but that creates a theft vector: buy NFT → claim
    // bond → sell NFT back. Deposit-time snapshot is safer for the depositor.
    mapping(bytes32 => mapping(uint256 => address)) public bondDepositor; // auctionId => agentId => depositor wallet
    // x402TxId idempotency: prevents double-recording the same x402 payment.
    // Canonical encoding: x402TxId = SettleResponse.transaction.
    // CAUTION: x402 core types define `transaction` as a generic string, NOT bytes32 [14][25].
    // x402 supports multiple protocol families (EVM, Solana, etc.). The platform backend
    // MUST validate BEFORE calling recordBond:
    //   1. Assert scheme == "exact" AND network is EVM (e.g., "eip155:84532" per CAIP-2 — x402 V2)
    //   2. Assert string matches /^0x[0-9a-fA-F]{64}$/ (66 chars total)
    //   3. Cast to bytes32 only after validation
    // Skipping this validation is a security and correctness risk: a non-EVM transaction
    // string (e.g., a Solana base58 signature) or a malformed/truncated hex value will
    // produce a garbage bytes32 that silently passes the processedTxIds uniqueness check,
    // breaking idempotency (the same real payment could be recorded twice under different
    // garbage keys) and making the bond unauditable via eth_getTransactionReceipt.
    // For EVM exact scheme: the facilitator returns a 0x-prefixed 64-hex-char tx hash
    // which maps to bytes32 natively in Solidity/ethers.js/viem. Do NOT hash-of-string.
    // Globally unique on-chain, verifiable via eth_getTransactionReceipt(txHash). [14]
    mapping(bytes32 => bool) public processedTxIds;

    // --- Storage: solvency accounting ---
    // INVARIANT: usdc.balanceOf(address(this)) >= totalBonded + totalWithdrawable
    // totalBonded: sum of all active (unreleased) bond deposits
    // totalWithdrawable: sum of all credited but not-yet-withdrawn amounts
    // These track every USDC obligation the contract has. If the invariant breaks,
    // the contract is insolvent and withdraw() will revert defensively.
    uint256 public totalBonded;
    uint256 public totalWithdrawable;

    // --- Storage: settlement state ---
    mapping(bytes32 => bool) public settled;             // one-time settlement guard
    mapping(bytes32 => uint256) public settledWinnerAgentId;  // winner agentId for claimRefund exclusion
    mapping(bytes32 => uint256) public lastReportTimestamp;  // stale report protection

    // Pull-pattern withdrawal balances (agents withdraw their own funds)
    mapping(address => uint256) public withdrawable;

    event BondRecorded(bytes32 indexed auctionId, uint256 indexed agentId, uint256 amount, bytes32 x402TxId);
    event AuctionSettled(bytes32 indexed auctionId, uint256 indexed winnerAgentId, address winnerWallet, uint256 amount);
    event RefundClaimed(bytes32 indexed auctionId, uint256 indexed agentId, address recipient, uint256 amount);

    modifier onlyAdmin() { require(msg.sender == admin, "not admin"); _; }

    // Constructor: ReceiverTemplate takes a single parameter — the KeystoneForwarder
    // address — and inherits Ownable(msg.sender). Expected author, workflow name,
    // and workflow ID are configured POST-DEPLOY via onlyOwner setters [21].
    //
    // ReceiverTemplate API (current — verified against x402-cre-price-alerts and
    // cre-bootcamp-2026 repos, Feb 2026):
    //   constructor(address _forwarderAddress) Ownable(msg.sender)
    //   setExpectedAuthor(address _author) external onlyOwner
    //   setExpectedWorkflowName(string calldata _name) external onlyOwner
    //     ⚠ takes plaintext string, internally derives bytes10 as:
    //       sha256(name) -> lowercase hex string -> first 10 ASCII chars -> bytes10
    //   setExpectedWorkflowId(bytes32 _id) external onlyOwner
    //   setForwarderAddress(address _forwarder) external onlyOwner
    //   Setting any expected value to zero DISABLES that validation check.
    //
    // Security model: ReceiverTemplate validates three fields from onReport metadata:
    //   - expectedAuthor: the workflow deployer's address (settable, onlyOwner)
    //   - expectedWorkflowName: the workflow name as bytes10 (settable, onlyOwner)
    //   - expectedWorkflowId: the workflow ID as bytes32 (settable, onlyOwner)
    // The KeystoneForwarder verifies DON signatures before calling onReport.
    // Together: forwarder ensures report authenticity, template ensures report provenance.
    //
    // admin is a SEPARATE role for business operations (recordBond, adminRefund).
    // admin != Ownable owner: owner controls ReceiverTemplate config, admin controls bonds.
    constructor(
        address _forwarderAddress,
        address _admin,
        address _usdc,
        address _registry,
        address _identityRegistry
    ) ReceiverTemplate(_forwarderAddress) {
        require(_admin != address(0), "zero admin");
        admin = _admin;
        usdc = IERC20(_usdc);
        registry = IAuctionRegistry(_registry);
        identityRegistry = IERC8004(_identityRegistry);
    }
    // POST-DEPLOY CONFIGURATION (owner calls these after constructor):
    //   setExpectedAuthor(workflowDeployerAddress);
    //   setExpectedWorkflowName("auctSettle");  // plaintext string, NOT bytes10
    //   setExpectedWorkflowId(workflowIdBytes32);
    //
    // ⚠ SECURITY: Owner can reconfigure expected values post-deploy. This is
    // intentional (enables workflow migration without redeployment) but means
    // the Ownable owner is a critical trust boundary. For production (P1):
    // transfer ownership to a timelocked multisig after initial configuration.
    // For hackathon: single deployer EOA is acceptable.

    // Bond deposits: x402 sends USDC directly to this contract.
    // Platform backend calls recordBond to register the accounting.
    // agentId: ERC-8004 NFT token ID (stable identity, survives wallet rotation).
    // depositor: the wallet address that paid the bond (snapshot for refund entitlement).
    // x402TxId: Ethereum tx hash from SettleResponse.transaction (0x-prefixed hex → bytes32).
    // On-chain validity checks: agentId must exist in ERC-8004, auction must be OPEN.
    function recordBond(bytes32 auctionId, uint256 agentId, address depositor, uint256 amount, bytes32 x402TxId) external onlyAdmin nonReentrant {
        require(!processedTxIds[x402TxId], "duplicate x402TxId");
        require(amount > 0, "zero amount");
        require(depositor != address(0), "zero depositor");
        require(
            registry.getAuction(auctionId).state == IAuctionRegistry.AuctionState.OPEN,
            "auction not open"
        );
        // Verify agentId exists in ERC-8004. ownerOf reverts for non-existent tokens (EIP-721).
        // This prevents recording bonds for fabricated agent IDs.
        identityRegistry.ownerOf(agentId);  // reverts if invalid — no return value needed
        // P1: Verify USDC was actually received. Without this check, admin could record
        // phantom bonds not backed by real USDC deposits, breaking the solvency invariant.
        // For MVP: the admin backend validates the x402 SettleResponse off-chain before calling.
        // For production: verify usdc.balanceOf(address(this)) >= totalBonded + totalWithdrawable + amount
        require(
            usdc.balanceOf(address(this)) >= totalBonded + totalWithdrawable + amount,
            "USDC not received"
        );
        processedTxIds[x402TxId] = true;
        bondRecords[auctionId][agentId] += amount;
        // Snapshot depositor on first bond for this (auction, agent) pair.
        // Subsequent top-ups retain the original depositor (first-payer entitlement).
        if (bondDepositor[auctionId][agentId] == address(0)) {
            bondDepositor[auctionId][agentId] = depositor;
        }
        totalBonded += amount;
        emit BondRecorded(auctionId, agentId, amount, x402TxId);
    }

    // Balance reconciliation: view function for off-chain monitoring.
    // Returns (surplus, deficit) — surplus means unattributed USDC in escrow (orphaned deposits).
    // Called by the reconciliation cron job to detect and flag mismatches.
    function checkSolvency() external view returns (uint256 surplus, uint256 deficit) {
        uint256 balance = usdc.balanceOf(address(this));
        uint256 obligations = totalBonded + totalWithdrawable;
        if (balance >= obligations) {
            return (balance - obligations, 0);
        } else {
            return (0, obligations - balance);
        }
    }

    // =====================================================================
    // CRE SETTLEMENT: Store-and-Process Pattern (Gas Safety)
    // =====================================================================
    //
    // CRITICAL DESIGN DECISION: _processReport does NOT distribute funds to losers.
    //
    // KeystoneForwarder retry semantics (per IReceiver NatSpec + KeystoneForwarder.route()
    // source code): if onReport reverts, the transmission is recorded as FAILED and CAN be
    // retried with higher gas (same transmissionId, same report data). AlreadyAttempted
    // only fires for SUCCEEDED or INVALID_RECEIVER transmissions — NOT for reverts.
    // See: smartcontractkit/chainlink-evm KeystoneForwarder.sol route() function.
    //
    // Even though reverts are recoverable via retry, O(1) gas is still best practice:
    //   (a) Retry latency is non-trivial (DON must re-sign and re-submit)
    //   (b) Gas estimation errors may persist across retries if the cause is data-dependent
    //   (c) Pull pattern for losers is safer than push (no blocked-receiver risk)
    //
    // The consumer contract MUST be idempotent: CRE retries deliver the same data, so
    // settled[auctionId] guard ensures _processReport is one-shot even if retried.
    // Idempotency verification: (1) settled[auctionId] is set to true BEFORE any state
    // changes — reentrancy-safe; (2) second call with same auctionId reverts at
    // require(!settled[auctionId]); (3) processedTxIds[x402TxId] in recordBond prevents
    // double-recording the same payment; (4) claimRefund checks bondRecords > 0 and zeros
    // it before transfer — one-shot per agent per auction.
    //
    // Therefore _processReport is kept lightweight: O(1) gas cost regardless of
    // participant count. It records the settlement result and returns the winner's
    // bond to their withdrawable balance. No phantom credits — only funds already
    // held in the contract (via recordBond) are ever moved.
    // Losing bidders claim their bonds individually via claimRefund() — pure pull pattern.
    //
    // Gas budget: ~80K gas (5 SSTOREs + 1 external call + decode + checks).
    // Recommended gasConfig: { gasLimit: '300000' } (conservative headroom).
    //
    // IReceiver interface: onReport(bytes calldata metadata, bytes calldata report)
    // Report encoding (normative):
    //   report = abi.encode(bytes32 auctionId, uint256 winnerAgentId, address winnerWallet, uint256 amount)
    //   (NOT JSON, NOT abi.encodePacked)
    // The metadata parameter (64 bytes, packed by KeystoneForwarder from rawReport[45:109]):
    //   - bytes32 workflowId     (bytes 0-31)
    //   - bytes10 workflowName   (bytes 32-41)
    //   - address workflowOwner  (bytes 42-61)
    //   - bytes2  reportName     (bytes 62-63)  ← present in bytes but NOT decoded by ReceiverTemplate
    // ReceiverTemplate._decodeMetadata() only decodes the first 3 fields.
    // It validates expectedWorkflowId, expectedWorkflowName, expectedAuthor —
    // all configurable post-deploy via onlyOwner setters. reportName is ignored.
    // If _processReport needs reportName, extract manually: bytes2(metadata[62:64]).
    //
    // Stale report responsibility: per IReceiver NatSpec in smartcontractkit/chainlink-evm
    // IReceiver.sol [21]: "If this function call reverts, it can be retried with a higher
    // gas limit. The receiver is responsible for discarding stale reports."
    // We enforce this via the settled[] one-time guard and auction state checks (CLOSED required).
    // Even if the forwarder retries after a prior success, settled[] prevents double-processing.

    function _processReport(bytes calldata report) internal override nonReentrant {
        (bytes32 auctionId, uint256 winnerAgentId, address winnerWallet, uint256 amount) =
            abi.decode(report, (bytes32, uint256, address, uint256));

        // --- Guard 1: one-time settlement ---
        require(!settled[auctionId], "already settled");

        // --- Guard 2: auction state ---
        IAuctionRegistry.Auction memory auction = registry.getAuction(auctionId);
        require(auction.state == IAuctionRegistry.AuctionState.CLOSED, "auction not closed");

        // --- Guard 3: cross-check report against registry-recorded result ---
        require(auction.winnerAgentId == winnerAgentId, "agentId mismatch vs registry");
        require(auction.winnerWallet == winnerWallet, "wallet mismatch vs registry");
        require(auction.amount == amount, "amount mismatch vs registry");

        // --- Guard 4: stale report ---
        require(lastReportTimestamp[auctionId] == 0, "stale report");
        lastReportTimestamp[auctionId] = block.timestamp;

        // Mark settled and record winner — no second call possible
        settled[auctionId] = true;
        settledWinnerAgentId[auctionId] = winnerAgentId;

        // --- Winner bond return (O(1) — no loops) ---
        // Bond is looked up by agentId (stable identity), NOT by wallet address.
        // This ensures wallet rotation between bond deposit and settlement does not
        // strand the bond. The returned bond is credited to winnerWallet (the current
        // wallet from the CRE-verified settlement report).
        // The `amount` field from the CRE report represents the declared auction
        // settlement amount for cross-check purposes — it is NOT a separate payout.
        // Buyer-funded prize payouts are a P1 feature (see Limitation #13).
        uint256 winnerBond = bondRecords[auctionId][winnerAgentId];
        if (winnerBond > 0) {
            bondRecords[auctionId][winnerAgentId] = 0;
            totalBonded -= winnerBond;
            withdrawable[winnerWallet] += winnerBond;
            totalWithdrawable += winnerBond;
        }

        // NOTE: Loser refunds are NOT processed here — gas safety.
        // Losers call claimRefund(auctionId, agentId) individually. See below.

        // Notify registry — advances state CLOSED -> SETTLED
        registry.markSettled(auctionId);

        emit AuctionSettled(auctionId, winnerAgentId, winnerWallet, amount);
    }

    // =====================================================================
    // PULL-BASED REFUNDS: O(1) per claim, no unbounded loops
    // =====================================================================

    // Self-service refund for non-winners. Works after SETTLED or CANCELLED.
    // Authorization: deposit-time beneficiary snapshot policy.
    // Only the wallet that originally paid the bond (bondDepositor) can claim the refund.
    // This protects depositors from losing funds if the agent NFT is transferred or
    // wallet is rotated after deposit. See "Bond Entitlement Policy" in storage section.
    // - After SETTLED: losers claim back their bonds. Winner is excluded (uses withdraw()).
    // - After CANCELLED: all agents (including would-be winner) claim back their bonds.
    // Gas cost: O(1) per call — no iteration over other participants.
    function claimRefund(bytes32 auctionId, uint256 agentId) external nonReentrant {
        // Authorization: caller must be the original depositor for this bond.
        require(
            bondDepositor[auctionId][agentId] == msg.sender,
            "caller is not bond depositor"
        );

        IAuctionRegistry.Auction memory auction = registry.getAuction(auctionId);
        bool isSettled = auction.state == IAuctionRegistry.AuctionState.SETTLED;
        bool isCancelled = auction.state == IAuctionRegistry.AuctionState.CANCELLED;
        require(isSettled || isCancelled, "auction not settled or cancelled");

        // In settled auctions, winner's bond was already returned via _processReport
        if (isSettled) {
            require(agentId != settledWinnerAgentId[auctionId], "winner: use withdraw()");
        }

        uint256 bond = bondRecords[auctionId][agentId];
        require(bond > 0, "no bond or already claimed");
        bondRecords[auctionId][agentId] = 0;
        totalBonded -= bond;
        withdrawable[msg.sender] += bond;  // credit to caller's verified wallet
        totalWithdrawable += bond;

        emit RefundClaimed(auctionId, agentId, msg.sender, bond);
    }

    // Admin safety valve: refund a specific agent in CANCELLED or SETTLED auctions.
    // For agents that cannot self-serve (lost key, contract agent, etc.).
    // Admin specifies agentId and recipient wallet.
    // P1: Extended to SETTLED state — after settlement, losing agents who cannot claim
    // their own refund (e.g., key loss) need an admin escape hatch. The winner is excluded
    // (winner's bond already processed in _processReport).
    function adminRefund(bytes32 auctionId, uint256 agentId, address recipient) external onlyAdmin nonReentrant {
        IAuctionRegistry.AuctionState state = registry.getAuction(auctionId).state;
        require(
            state == IAuctionRegistry.AuctionState.CANCELLED ||
            state == IAuctionRegistry.AuctionState.SETTLED,
            "auction not cancelled or settled"
        );
        // In SETTLED state, exclude the winner (their bond was handled by _processReport)
        if (state == IAuctionRegistry.AuctionState.SETTLED) {
            require(agentId != settledWinnerAgentId[auctionId], "winner uses claimRefund");
        }
        require(recipient != address(0), "zero recipient");
        uint256 bondAmount = bondRecords[auctionId][agentId];
        require(bondAmount > 0, "no bond");
        bondRecords[auctionId][agentId] = 0;
        totalBonded -= bondAmount;
        withdrawable[recipient] += bondAmount;
        totalWithdrawable += bondAmount;
        emit RefundClaimed(auctionId, agentId, recipient, bondAmount);
    }

    // Pull-pattern: agents withdraw their own refunded/released funds.
    // Uses SafeERC20.safeTransfer to handle non-standard ERC20 return values safely.
    function withdraw() external nonReentrant {
        uint256 amount = withdrawable[msg.sender];
        require(amount > 0, "nothing to withdraw");
        // Defensive solvency check: contract must hold enough USDC to cover this withdrawal.
        // If this fails, the contract is insolvent — a bug in accounting logic.
        require(usdc.balanceOf(address(this)) >= amount, "insufficient contract balance");
        withdrawable[msg.sender] = 0;
        totalWithdrawable -= amount;
        usdc.safeTransfer(msg.sender, amount);
    }
}
```

## Escrow Invariants

**Invariants (enforced by state machine + CRE security layers):**
- **Solvency invariant:** `usdc.balanceOf(address(this)) >= totalBonded + totalWithdrawable` must hold after every state-changing function. `totalBonded` tracks active bond deposits; `totalWithdrawable` tracks credited but not-yet-withdrawn amounts. Every function that moves funds between these pools (`recordBond`, `_processReport`, `claimRefund`, `adminRefund`, `withdraw`) updates both totals atomically. `withdraw()` includes a defensive `require` that reverts if the contract's actual USDC balance is insufficient — this catches accounting bugs before they cause fund loss.
- `_processReport` (via CRE's `onReport`) is the ONLY path to release winner bonds — platform admin cannot bypass CRE
- `onReport` is protected by 4 layers: (1) KeystoneForwarder verifies DON signatures before calling `onReport` (forwarder is the only entity that calls consumer contracts), (2) `expectedAuthor` match (configurable via `setExpectedAuthor`, onlyOwner — verifies workflow deployer from metadata), (3) `expectedWorkflowName` match (configurable via `setExpectedWorkflowName`, onlyOwner — verifies workflow name from metadata), (4) `settled[auctionId]` one-time guard + report fields cross-checked against registry-recorded result (`winnerAgentId`, `winnerWallet`, `amount` must all match). Second call reverts at settled[] guard. **Security note:** since expected values are settable (not immutable), the Ownable owner is a trust boundary. For production: transfer ownership to timelocked multisig after initial configuration.
- **Gas safety (Store-and-Process):** `_processReport` is O(1) regardless of participant count — it records the settlement result and returns the winner's bond to their withdrawable balance. No unbounded loops, no phantom credits. Loser refunds are handled via individual `claimRefund()` calls (pull pattern). **Retry semantics:** per KeystoneForwarder source code (`route()` function), reverted `onReport` calls CAN be retried with higher gas — `AlreadyAttempted` only fires for SUCCEEDED or INVALID_RECEIVER transmissions. O(1) design is still best practice (retry latency is non-trivial, pull pattern avoids blocked-receiver risk) but a gas overrun is recoverable, not catastrophic. Recommended `gasConfig: { gasLimit: '300000' }`.
- **Role separation:** Two authority roles: (1) `owner` (Ownable, inherited from ReceiverTemplate) controls CRE configuration (`setExpectedAuthor`, `setExpectedWorkflowName`, `setExpectedWorkflowId`, `setForwarderAddress`). (2) `admin` controls business operations (`recordBond`, `adminRefund`). These are independent — compromising `admin` cannot reconfigure CRE validation; compromising `owner` cannot record bonds. For production: transfer `owner` to timelocked multisig.
- **Workflow isolation:** Only Workflow 1 (Settlement) can interact with AuctionEscrow. Workflow 2 (Delivery Verification) writes to `AuctionRegistry.recordDeliveryProof()` (struct + events defined in registry), not to escrow. The `expectedWorkflowName` and `expectedAuthor` are configured to Settlement workflow values only (via onlyOwner setters post-deploy) — Delivery Verification reports are rejected by the escrow contract's metadata validation.
- **KeystoneForwarder replay protection (corrected per source code):** The forwarder tracks each `transmissionId` (derived from `keccak256(receiver, workflowExecutionId, reportId)`) with a `TransmissionState` enum: `NOT_ATTEMPTED`, `SUCCEEDED`, `INVALID_RECEIVER`, `FAILED`. `AlreadyAttempted` fires only for `SUCCEEDED` or `INVALID_RECEIVER` states. A `FAILED` transmission (onReport reverted) does NOT trigger `AlreadyAttempted` and CAN be retried with higher gas — same transmissionId, same report data, re-submitted by the DON. The `settled[auctionId]` one-time guard ensures idempotency: even if the forwarder retries after a previous success, the guard prevents double-processing. This is required by the IReceiver NatSpec: "the receiver is responsible for discarding stale reports."
- **Bond keying (wallet-rotation safe):** `bondRecords` is keyed by `(auctionId, agentId)` where `agentId` is the ERC-8004 NFT token ID — NOT by wallet address. This prevents bond stranding when an agent rotates their wallet between deposit and settlement. `_processReport` looks up the winner's bond by `winnerAgentId` and credits the refund to `winnerWallet` (the CRE-verified current wallet). `claimRefund(auctionId, agentId)` is authorized via deposit-time snapshot: `bondDepositor[auctionId][agentId] == msg.sender` — only the wallet that originally paid can claim the refund (see Bond Entitlement Policy).
- **Refund paths (all pull-based, O(1) per claim):**
  - `claimRefund(auctionId, agentId)` — self-service for losers after SETTLED, or all agents after CANCELLED. Authorized by deposit-time beneficiary snapshot (`bondDepositor`); refund goes to msg.sender (which must equal the original depositor). No admin involvement needed.
  - `adminRefund(auctionId, agentId, recipient)` — admin safety valve for CANCELLED or SETTLED auctions (agents that lost keys, contract agents, etc.). In SETTLED state, winner is excluded (handled by `_processReport`). Admin specifies recipient.
  - `claimRefund` requires SETTLED or CANCELLED state — cannot be called during OPEN or CLOSED.
  - Winner (by agentId) is excluded from `claimRefund` after SETTLED (winner's bond was returned via `_processReport`).
- `recordBond` requires auction is OPEN in registry — no bonds accepted after close
- `recordBond` is idempotent on `x402TxId` (via `processedTxIds` mapping) — duplicate calls revert
- Settlement deadlock prevention: `cancelExpiredAuction()` moves CLOSED → CANCELLED after 72-hour timeout, enabling refunds via `claimRefund()` if CRE settlement fails permanently. See Limitation #5 in [06-appendix.md](./06-appendix.md) for the full deadlock recovery procedure.
- All fund-moving functions use `ReentrancyGuard`, pull-over-push withdrawal, and `SafeERC20.safeTransfer` (handles non-standard ERC20 return values)
- **P1: Add `Pausable` (OpenZeppelin) with explicit function policy.** See Limitation #5 in [06-appendix.md](./06-appendix.md) for the full function-level pause policy.
- **Trust gap (bond attribution):** `recordBond` is operator bookkeeping — not verified by CRE. See Limitation #3 in [06-appendix.md](./06-appendix.md) and the Bond Deposits section above for production mitigations.

## Smart Contract Design: X402PaymentGate

**X402PaymentGate.sol** — standalone receipt verifier for x402 HTTP micropayments
```solidity
contract X402PaymentGate {
    IERC20 public immutable usdc;
    mapping(bytes32 => bool) public spentReceipts;  // nullifier pattern — prevents replay

    constructor(address _usdc) {
        usdc = IERC20(_usdc);
    }

    // Verify a payment receipt (called by off-chain middleware before serving the resource).
    // txHash: the Ethereum tx hash from x402 SettleResponse.transaction
    // payer: expected sender address
    // expectedAmount: minimum payment amount
    // Returns true if the payment at txHash transferred >= expectedAmount from payer to treasury.
    // NOTE: On-chain tx receipt verification requires an archive node or event-based approach.
    // For MVP: trust the middleware's off-chain verification via eth_getTransactionReceipt.
    // This contract primarily serves as the nullifier store (spent receipts).
    function markReceiptUsed(bytes32 txHash) external returns (bool) {
        require(!spentReceipts[txHash], "receipt already used");
        spentReceipts[txHash] = true;
        return true;
    }

    function isReceiptUsed(bytes32 txHash) external view returns (bool) {
        return spentReceipts[txHash];
    }
}
```
