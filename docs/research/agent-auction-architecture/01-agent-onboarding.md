# Module 0: Agent Onboarding (Identity + Smart Wallet)

> Split from [research_report_20260219_agent_auction_architecture.md](../research_report_20260219_agent_auction_architecture.md). Citations reference the shared [Bibliography](./06-appendix.md#bibliography).

---

### Module 0: Agent Onboarding (Identity + Smart Wallet)

**Current Design Assessment:** The 3-layer identity model (Root Controller → Runtime Key → Session Token) is well-architected. The three onboarding flows (off-chain Flow A, on-chain Flow B via ERC-8004, hybrid Flow C) provide coverage. **Enhancement:** EIP-4337 smart wallets + an ERC-8004-compatible privacy sidecar elevate the identity model from transparent on-chain identity to privacy-preserving, gas-abstracted agent accounts.

**Source of truth (normative):** ERC-8004 `IdentityRegistry` for `agentId` ownership and wallet mapping; EIP-4337 `EntryPoint` for UserOp signature validation; `AuctionRegistry` for on-chain auction lifecycle and settlement-critical fields.

**Trust boundaries (normative):** the operator-run sequencer (Durable Object) is trusted for admission decisions, ordering, and inclusion (and can censor); CRE verifies settlement against on-chain commitments but does not protect against a compromised sequencer; the privacy sidecar is advisory and must never replace the official identity registry.

**4-Step Agent Onboarding (Full Participation Path):**

**Step 1 — Deploy Agent Smart Wallet (EIP-4337).** Every participating agent gets a smart contract wallet before any auction interaction. `AgentAccountFactory.createAccount(agentPubkey, salt)` deploys an `AgentAccount` via CREATE2 at a deterministic address. The agent knows its wallet address *before* deployment (via `getAddress()`). **Lazy deployment:** the wallet is only deployed when the agent sends its first UserOperation — the `initCode` field triggers factory deployment. EntryPoint v0.7 is deployed on **Base Sepolia** at `0x0000000071727De22E5E9d8BAf0edAc6f37da032` (verify the EntryPoint deployment/address on any other target chain; do not assume universal availability). Gas is sponsored by `AgentPaymaster` — agents never hold ETH.

**Step 2 — Register identity in official ERC-8004 + enroll privacy sidecar.**
- Identity source-of-truth: agent is registered in the official ERC-8004 `IdentityRegistry` (ERC-721 token semantics, wallet mapping, rotation via `setAgentWallet`).
- Privacy sidecar (optional but recommended): agent generates `agentSecret` (256-bit random, local, never leaves agent), computes `capabilityMerkleRoot`, and registers a commitment in `AgentPrivacyRegistry` keyed by `agentId`.
- Settlement and refund authorization always read the official `IdentityRegistry`; the sidecar is used only for privacy-preserving capability proofs.
- To prove "I am a registered agent with capability C," the agent generates a Groth16 ZK proof off-chain (RegistryMembership circuit, ~12K constraints, ~400ms proving time) against `AgentPrivacyRegistry.getRoot()`. **MVP path:** submit proof bytes with the signed HTTP/MCP action to the DO sequencer for verification before sequencing. **Optional P1 path:** verify proof on-chain in a direct UserOp admission flow.

**Step 3 — EIP-712 Domain Binding.** Agent signs the auction system's EIP-712 domain separator with its runtime key during onboarding:
```
AuctionDomain = {
  name: "AgentAuction",
  version: "1",
  chainId: <Base Sepolia chainId>,
  verifyingContract: AuctionFactory.address
}
```
This ties all future EIP-712 speech acts (Join, Bid, Deliver, Dispute, Withdraw) to this specific deployment. A mismatched domain separator is a phishing/replay attack vector.

**Step 4 — ZK Keypair Initialization.** Separate from wallet key — used only for bid privacy in sealed-bid auctions:
- Generate: `zkPrivKey` (BabyJubJub curve [ERC-2494], ZK-native)
- Derive: `zkPubKey` (used in ElGamal bid commitments for sealed-bid MPC)
- Store: `zkPrivKey` in isolated secret manager / KMS — never in hot memory, never logged

**Identity Tiers (updated with ZK privacy):**
- **Flow A (off-chain only):** Spectator/read-only access. No smart wallet, no bonds, no bidding.
- **Flow B (ERC-8004 + ZK sidecar + EIP-4337):** Full participation. Official on-chain identity, optional privacy sidecar for capability proofs, smart wallet, gas sponsorship, sealed-bid capable. This is the primary flow.
- **Flow C (hybrid):** Full participation. Off-chain runtime key for signing, official ERC-8004 identity for settlement, privacy sidecar optional. Smart wallet optional (can use EOA with higher friction).

**Critical Constraint — Identity Tier for Settlement:** The CRE Settlement Workflow reads ERC-8004 IdentityRegistry to verify the winner's identity (Phase C). Agents that want to post bonds and win auctions MUST have an on-chain ERC-8004 identity (Flow B or Flow C). Flow A agents cannot post bonds or be declared winners — the settlement workflow would fail identity verification. This is deliberate: if money is at stake, on-chain identity is required for CRE to verify the counterparty.

**Research Findings:**

The ERC-8004 contracts repository publishes deployed registry addresses across multiple networks [24]. Ethereum Mainnet addresses: IdentityRegistry `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`, ReputationRegistry `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63` [24]. Base Sepolia addresses: IdentityRegistry `0x8004A818BFB912233c491871b3d84c89A494BD9e`, ReputationRegistry `0x8004B663056A597Dffe9eCcC1965A193B7388713` [24]. The Identity Registry is an ERC-721 with URIStorage extension — each agent gets a token whose `agentURI` points to an off-chain registration file containing endpoints, capabilities, and metadata [1].

The `setAgentWallet(agentId, newWallet, deadline, signature)` function requires EIP-712 signatures to change the agent wallet, and when an agent NFT is transferred, the wallet is automatically cleared and must be re-verified by the new owner [1][24]. These behaviors are defined in the EIP-8004 specification [1] and implemented in the official contracts repository [24]. This aligns perfectly with the design's key rotation and revocation model.

For the hackathon, comparison with alternatives reveals:
- **SPIFFE/SPIRE** (enterprise workload identity) provides short-lived SVIDs but treats all replicas as identical — fundamentally incompatible with agents' non-deterministic behavior [4].
- **Microsoft Entra Agent ID** uses OAuth 2.0/OIDC-based authentication with on-behalf-of flows for human-to-agent delegation — enterprise-grade but centralized [5].
- **ERC-8004** is the only standard that provides both on-chain identity AND decentralized reputation — making it the strongest choice for an open auction platform.

**CRE Integration Point:** A CRE workflow using EVMClient can read the ERC-8004 IdentityRegistry to verify an agent's identity and reputation before granting auction access, providing BFT-consensus-verified identity checks.

**Gap (resolved):** The design didn't specify how to verify agent identity within CRE workflows or what happens when off-chain-only agents win. Resolution: identity is enforced at two gates:
1. **Pre-payment gate (bond endpoint):** Before returning HTTP 402, the platform checks ERC-8004 IdentityRegistry. Agents without valid on-chain identity receive 403, never 402 — so they never pay into escrow. This eliminates orphaned deposits from ineligible agents.
2. **Settlement gate (CRE):** CRE Settlement Workflow reads `ownerOf(winnerAgentId)` and `getAgentWallet(winnerAgentId)` via EVMClient, verifying that: (a) the `ownerOf` call succeeds without reverting (per EIP-721, `ownerOf` reverts for non-existent or burned tokens — a revert means the agent NFT is invalid, and the CRE TypeScript handler catches this via try-catch to reject settlement), and (b) the registered wallet matches `winnerWallet` from the `AuctionEnded` event. This cross-check prevents fund release to an unregistered address.

---

## Smart Contract Design: Account Abstraction Layer (EIP-4337)

**AgentAccountFactory.sol** — deterministic wallet deployment via CREATE2
```solidity
import {IEntryPoint} from "@account-abstraction/contracts/interfaces/IEntryPoint.sol";

contract AgentAccountFactory {
    AgentAccount public immutable accountImplementation;
    IEntryPoint public immutable entryPoint;

    constructor(IEntryPoint _entryPoint) {
        entryPoint = _entryPoint;
        accountImplementation = new AgentAccount(_entryPoint);
    }

    // Deterministic address derivation — agent knows address before deployment
    function getAddress(bytes32 agentPubkey, uint256 salt) public view returns (address);

    // Lazy deployment: only called when agent sends first UserOp (via initCode)
    function createAccount(bytes32 agentPubkey, uint256 salt) external returns (AgentAccount);
}
```

**AgentAccount.sol** — smart contract wallet with UserOp signature/nonce validation
```solidity
import {BaseAccount} from "@account-abstraction/contracts/core/BaseAccount.sol";
import {IEntryPoint} from "@account-abstraction/contracts/interfaces/IEntryPoint.sol";
import {PackedUserOperation} from "@account-abstraction/contracts/interfaces/PackedUserOperation.sol";

// Inherits BaseAccount (not raw IAccount) — provides EntryPoint access control,
// nonce management, and prefund payment. We only override _validateSignature().
contract AgentAccount is BaseAccount {
    IEntryPoint private immutable _entryPoint;
    bytes32 public agentPubkey;

    function entryPoint() public view override returns (IEntryPoint) { return _entryPoint; }

    // Core EIP-4337 validation — called by EntryPoint via BaseAccount.validateUserOp().
    // MVP scope: validates wallet-level signature/nonce for direct wallet operations.
    // Join/Bid actions in MVP are sequenced via HTTP/MCP (DO path), not direct UserOps.
    // Optional P1 mode can add on-chain ZK admission checks for direct-chain flows.
    function _validateSignature(
        PackedUserOperation calldata userOp,
        bytes32 userOpHash
    ) internal view override returns (uint256 validationData) {
        // Decode wallet operation type from calldata
        // Verify EIP-712 signature on wallet operation struct
        // Return SIG_VALIDATION_SUCCESS or SIG_VALIDATION_FAILED
    }

    // After validation, EntryPoint calls execute() with the actual action
    function execute(address target, uint256 value, bytes calldata data) external {
        _requireFromEntryPoint();  // inherited from BaseAccount
        (bool success,) = target.call{value: value}(data);
        require(success, "execution failed");
    }

    // Batch execution — for multi-target atomic operations (e.g., approve + deposit; recordBond is separate admin call)
    function executeBatch(
        address[] calldata targets,
        uint256[] calldata values,
        bytes[] calldata datas
    ) external {
        _requireFromEntryPoint();
        for (uint256 i = 0; i < targets.length; i++) {
            (bool success,) = targets[i].call{value: values[i]}(datas[i]);
            require(success, "batch execution failed");
        }
    }
}
```

**AgentPaymaster.sol** — gas sponsorship with escrow-backed anti-spam
```solidity
import {IPaymaster} from "@account-abstraction/contracts/interfaces/IPaymaster.sol";

contract AgentPaymaster is IPaymaster {
    IEntryPoint public immutable entryPoint;
    IAuctionEscrow public escrow;

    // Validates: does agent have sufficient locked deposit in escrow?
    // If yes → sponsor gas. If no → reject (anti-spam gate).
    function validatePaymasterUserOp(
        PackedUserOperation calldata userOp,
        bytes32 userOpHash,
        uint256 maxCost
    ) external returns (bytes memory context, uint256 validationData);

    // MVP: logs gas cost for analytics only. P1: records gas cost against
    // agent's escrow balance via gasDebtLedger, deducted at settlement.
    function postOp(
        PostOpMode mode,
        bytes calldata context,
        uint256 actualGasCost,
        uint256 actualUserOpFeePerGas
    ) external;
}
```

## Smart Contract Design: Identity & Privacy Layer (official ERC-8004 + ZK sidecar)

**AgentPrivacyRegistry.sol** — privacy sidecar keyed by official ERC-8004 `agentId` (NOT settlement source-of-truth)
```solidity
contract AgentPrivacyRegistry {
    struct Agent {
        bytes32 registrationCommit;  // keccak256(agentSecret, capabilityMerkleRoot, salt)
        uint256 registeredAt;
        address controller;           // can update commitment (key rotation)
        bytes32 nullifierRoot;        // Merkle root of spent nullifiers
    }

    mapping(uint256 => Agent) public agents;  // agentId => Agent
    bytes32 public registryRoot;              // Merkle root of all agent commitments
    INullifierSet public nullifierSet;

    // Identity ownership and wallet binding come from official IdentityRegistry.
    // This sidecar stores privacy commitments only and MUST NOT mint agent IDs.
    // Caller provides the official ERC-8004 agentId; implementation verifies ownership/controller rights.
    function register(uint256 agentId, bytes32 commit) external;

    // Controller can rotate commitment if agentSecret is compromised.
    // agentId stays the same — only the commitment changes.
    function updateCommitment(uint256 agentId, bytes32 newCommit) external;

    // Returns current Merkle root for ZK proof public input
    function getRoot() external view returns (bytes32);
}
```

**Source-of-truth rule:** CRE settlement checks and refund authorization MUST read the official ERC-8004 `IdentityRegistry` (`ownerOf`, `getAgentWallet`, wallet rotation via `setAgentWallet`). `AgentPrivacyRegistry` is only for ZK capability/privacy proofs.

**NullifierSet.sol** — prevents double-joining (and one-time commit actions in P1)
```solidity
contract NullifierSet {
    // nullifier = Poseidon(agentSecret, auctionId, action_type) via PoseidonT4 (3 inputs)
    // All inputs converted via to_fr() — see "Poseidon field encoding (normative)" in 03-room-broadcast.md
    // Deterministic: same agent + same auction + same action = same nullifier
    // One-way: observer cannot link nullifiers across different auctions
    //
    // MVP scope: nullifiers are consumed for JOIN only. English auctions allow
    // multiple BID actions from the same agent, so BID does NOT consume a nullifier.
    // Sealed-bid / commit-reveal flows (P1) MAY define a COMMIT action type whose
    // nullifier prevents an agent from submitting more than one sealed commitment.
    mapping(bytes32 => bool) public nullifiers;

    // Access control: only authorized contracts (AgentPrivacyRegistry, AuctionRoom, verifiers)
    // can consume nullifiers. Without this, any EOA could front-run a nullifier
    // and permanently block an agent from joining/bidding.
    mapping(address => bool) public authorizedCallers;
    address public owner;

    modifier onlyAuthorized() {
        require(authorizedCallers[msg.sender], "not authorized");
        _;
    }
    modifier onlyOwner() { require(msg.sender == owner, "not owner"); _; }

    constructor() { owner = msg.sender; }

    function setAuthorizedCaller(address caller, bool authorized) external onlyOwner {
        authorizedCallers[caller] = authorized;
    }

    function checkAndSet(bytes32 nullifier) external onlyAuthorized returns (bool) {
        require(!nullifiers[nullifier], "already spent");
        nullifiers[nullifier] = true;
        return true;
    }
}
```

## Smart Contract Design: ZK Verification Layer (Groth16)

**Execution scope:** MVP join/bid admission verifies proof bytes in the DO sequencer path. On-chain Groth16 verifiers are used for sealed-bid flows and optional direct-chain admission modes.

**RegistryMemberVerifier.sol** — proves capability membership without revealing private witness data. Groth16 on-chain verification (~200K gas execution on L2 — ecPairing precompile ~181K + 6.15K per public input [28], ~$0.01-0.05 USD on Base). **Scope note:** this proof does not hide `agent_id`/`wallet` once events are included in ReplayBundleV1.

Public inputs after verification:
- `registryRoot`: must match `AgentPrivacyRegistry.getRoot()` (proves agent commitment is in current privacy tree)
- `capabilityCommitment`: proves the agent has the required capability
- `nullifier`: unique spend marker for this join action

**BidCommitVerifier.sol** — proves `reservePrice ≤ bid ≤ maxBudget` without revealing bid. Verifies that `bidCommitment = Poseidon(bid, salt)` (PoseidonT3, 2 inputs; see "Poseidon field encoding" in [03-room-broadcast.md](./03-room-broadcast.md)) corresponds to a valid bid.

**DepositRangeVerifier.sol (P1 optional)** — proves "my escrow balance ≥ required deposit" without revealing the actual balance. **Not used for MVP admission gating.** MVP uses explicit on-chain checks (`recordBond` + paymaster policy) for correctness and solvency.

Circuit: `DepositRange.circom` (~3K constraints). Private inputs: `balance` (agent's actual escrow balance), `salt` (per-proof randomness). Public inputs: `balanceCommitment = Poseidon(balance, salt)` (PoseidonT3, 2 inputs), `requiredDeposit` (from auction manifest), `depositOk` (1 if `balance ≥ requiredDeposit`), `blockHash` (L2 block hash at proof generation time — prevents stale-balance replay). The circuit decomposes `balance - requiredDeposit` into 64-bit limbs (Circom has no native range check) and asserts non-negativity. **Production requirement before enabling this verifier:** bind `balanceCommitment` to an on-chain commitment source; otherwise it remains advisory only.

`RegistryMemberVerifier` and `BidCommitVerifier` are generated by `snarkjs zkey export solidityverifier` from Circom 2.x circuits (v2.2.3 + snarkjs v0.7.5). Verification keys baked into bytecode at deploy time. `DepositRangeVerifier` is P1 optional and should not be wired into MVP admission checks. **Trusted setup:** Hermez Powers of Tau ceremony (BN254, `powersOfTau28_hez_final_16.ptau` — supports up to 2^16 = 65K constraints). Hosted at `https://storage.googleapis.com/zkevm/ptau/powersOfTau28_hez_final_16.ptau`.

---

**Contract Deployment Order (steps 1-9, identity/wallet related):**
```
1.  EntryPoint v0.7             (Base Sepolia: 0x00...032; verify deployment/address on any other chain)
2.  NullifierSet.sol            (no dependencies)
3.  AgentPrivacyRegistry.sol    (privacy sidecar, depends: NullifierSet)
    + use official ERC-8004 IdentityRegistry/ReputationRegistry addresses as source-of-truth
4.  BidCommitVerifier.sol       (Groth16 verifier, verification key baked in)
5.  RegistryMemberVerifier.sol  (depends: AgentPrivacyRegistry for root check)
6.  DepositRangeVerifier.sol    (P1 optional research verifier, not in MVP validation path)
7.  AgentAccount.sol            (implementation contract)
8.  AgentAccountFactory.sol     (depends: EntryPoint, AgentAccount impl)
9.  AgentPaymaster.sol          (depends: EntryPoint) → stake ETH after deploy
```

See [06-appendix.md](./06-appendix.md) for the full 15-step deployment order.
