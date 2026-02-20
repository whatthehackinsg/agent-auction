# Module 1: Agent Voice (Signing & Delivery)

> Split from [research_report_20260219_agent_auction_architecture.md](../research_report_20260219_agent_auction_architecture.md). Citations reference the shared [Bibliography](./06-appendix.md#bibliography).

---

### Module 1: Agent Voice (Signing & Delivery)

**Current Design Assessment:** The dual-entry model (MCP Gateway + Web HTTP) is correct. The 10 "building blocks" framework (identity, signer, client, outbox, policy guard + ingest, sequencer, log, broadcast, receipt) is comprehensive. **Signing key correction:** The original design specified Ed25519 for runtime signing. However, on-chain EIP-712 verification uses `ECDSA.recover()` (secp256k1 ecrecover precompile). Ed25519 signatures cannot be verified on-chain without a custom precompile (none exists on EVM). **Decision: all runtime keys that sign on-chain-verifiable actions MUST be secp256k1.** Ed25519 may be used for off-chain-only operations (API session auth, internal messaging) where on-chain verification is not needed.

**Source of truth (normative):** for join/bid admission and ordering, the Durable Object sequencer is authoritative; for settlement, `AuctionRegistry` events + anchors are authoritative; for identity binding, ERC-8004 `IdentityRegistry` is authoritative.

**Trust boundaries (normative):** the sequencer can censor and must be treated as a potential adversary; signatures constrain what the sequencer can attribute to an agent, but do not force inclusion; CRE validates settlement correctness against committed data, but does not validate every off-chain request unless its effects are committed on-chain.

**Research Findings:**

MCP Streamable HTTP transport (spec version 2025-03-26, as of report date; verify for updates before implementation) deprecated the older SSE-based transport in favor of a single HTTP endpoint that dynamically upgrades to SSE when needed for streaming [6]. This is significant: the design's MCP Gateway should use Streamable HTTP, not separate SSE endpoints. A single endpoint handles both requests (POST) and streaming responses (SSE upgrade), simplifying infrastructure.

Cloudflare's Agent Gateway now provides native Streamable HTTP transport support for MCP servers [7], which means the MCP Gateway could run as a Cloudflare Worker with native MCP transport.

**Architecture Decision Confirmed:** The design correctly separates "voice" (agent actions) from "broadcast" (event distribution). The Gateway pattern where MCP normalizes to the same Room Core API as direct HTTP is the right abstraction.

**EIP-712 Typed Data for All Speech Acts:** Every action an agent takes is an EIP-712 typed data struct signed with the AuctionDomain (bound to AuctionFactory). This gives: human-readable signing and domain separation (bid for auction A cannot be replayed in auction B). **Verification boundary (authoritative):** MVP join/bid signatures are verified in the HTTP/MCP sequencer path before `seq` assignment; UserOp signatures are verified by `AgentAccount._validateSignature()` through EntryPoint `validateUserOp`.

```solidity
struct Join {
  bytes32 auctionId;
  bytes32 nullifier;          // Poseidon(agentSecret, auctionId, JOIN) via PoseidonT4 (3 inputs, see "Poseidon field encoding" in 03-room-broadcast.md) — prevents double-join
  uint256 depositAmount;      // snapshot of manifest's deposit requirement; NOT hashed into ReplayBundleV1 JOIN (JOIN amount stays 0 in replay)
  uint256 nonce;              // off-chain action nonce (sequencer-scoped; NOT EIP-4337 account nonce). See "Nonce policy (normative)" below.
  uint256 deadline;           // unix timestamp, tx reverts if past
}

// MVP English auction — cleartext bid amount, signed and sequenced
struct Bid {
  bytes32 auctionId;
  uint256 amount;             // cleartext bid value (wei / token units); matches ReplayBundleV1 BID.amount
  uint256 nonce;
  uint256 deadline;
}

// Sealed-bid / commit-reveal auctions only (not used in MVP)
struct BidCommit {
  bytes32 auctionId;
  bytes32 bidCommitment;      // Poseidon(bid, salt) via PoseidonT3 (2 inputs, see "Poseidon field encoding" in 03-room-broadcast.md)
  bytes32 encryptedBidHash;   // keccak256(ElGamal ciphertext bytes) — sealed-bid MPC only
  bytes32 zkRangeProofHash;   // keccak256(Groth16 proof bytes). Full proof bytes travel in HTTP/MCP payload and must hash-match this field.
  uint256 nonce;
  uint256 deadline;
}

struct Reveal {               // only for commit-reveal auctions (not sealed-bid MPC)
  bytes32 auctionId;
  uint256 bid;                // actual bid amount
  bytes32 salt;               // reveals the commitment
  uint256 nonce;
}

struct Deliver {
  bytes32 auctionId;
  uint256 milestoneId;
  bytes32 deliveryHash;       // keccak256(output bytes)
  bytes32 executionLogHash;   // keccak256(execution log)
  uint256 nonce;
  uint256 deadline;
}

struct Dispute {
  bytes32 auctionId;
  bytes32 evidencePackageHash;
  address respondent;
  uint256 nonce;
}

struct Withdraw {
  bytes32 auctionId;
  string  reason;              // logged on-chain for transparency
  uint256 nonce;
  uint256 deadline;
}
```

**Signing in practice:**
- **MVP join/bid path (HTTP/MCP):** agent signs the EIP-712 action payload and sends `{typedData, signature, optionalProofBytes}` to the DO sequencer. The sequencer verifies `ECDSA.recover`, nonce/deadline, and replay rules before assigning `seq`.
- **UserOp wallet path:** for direct wallet operations (for example, bond transfer), the UserOperation `signature` is verified by `AgentAccount._validateSignature()` via EntryPoint `validateUserOp`.
- Nonce policy must be monotonic per actor and action scope to prevent replay.

### Nonce policy (normative)

The `nonce` field in Join/Bid typed data is an **off-chain action nonce** used by the HTTP/MCP sequencer. It MUST NOT reuse the EIP-4337 smart-wallet nonce (`AgentAccount.getNonce()`), because off-chain actions do not advance that nonce.

- **Scope:** `nonce` is scoped to `(auctionId, signerWallet, actionType)` where `signerWallet` is the address recovered from the EIP-712 signature.
- **Monotonic rule:** sequencer MUST require `nonce == lastNonce + 1` for that scope.
- **Idempotency:** if the sequencer receives a duplicate request with the same `(auctionId, signerWallet, actionType, nonce)` it MUST NOT assign a new `seq`. It MUST either (a) return the original `seq` + inclusion receipt, or (b) reject with an explicit `ALREADY_ACCEPTED` error that includes the original `seq`.
- **Persistence:** `lastNonce` and the `(scope, nonce) -> seq` map MUST be persisted in Durable Object storage so failover/restart does not re-accept old nonces.
- **Derivation rule:** the sequencer MUST derive the settlement-critical `ActionPayloadV1`/ReplayBundle fields from the signed typed data fields (same types/order), not from any unsigned HTTP fields.

**CRE Integration Point:** The MCP Gateway (or direct HTTP endpoint) can serve as the entry point for x402-gated actions. When an agent wants to place a bid, the endpoint returns 402 → agent pays → payment verified → bid forwarded to Room Core. This is the exact pattern in the x402-cre-price-alerts reference app [8]. **x402 and UserOp are separate transport layers and cannot be batched together.** x402 settles via HTTP headers (`PAYMENT-REQUIRED` / `PAYMENT-SIGNATURE` / `PAYMENT-RESPONSE`): the facilitator submits the on-chain transfer independently, and the server returns a `PAYMENT-RESPONSE` header containing the settlement `transaction` hash [14]. The agent's subsequent bid submission is an HTTP/MCP signed action in MVP (separate from UserOp). For EIP-4337 agents, bond deposits bypass x402 entirely (direct USDC transfer inside an atomic `executeBatch` UserOp). x402 is used only for HTTP-layer micropayments (room access, manifest fetching) and EOA fallback deposits.

---

## Smart Contract Design: Sealed-Bid MPC (ElGamal + FROST)

**SealedBidMPC.sol** — manages encrypted bids for sealed-bid auctions
```solidity
contract SealedBidMPC {
    bytes32 public mpcPubKey;  // Committee's joint public key from DKG

    // Agent encrypts bid to committee pubkey: ElGamal on BabyJubJub (ERC-2494).
    // Encryption is off-chain (BabyJubJub arithmetic too expensive in Solidity).
    // On-chain: store ciphertext + verify ZK range proof.
    function submitEncryptedBid(
        bytes32 auctionId,
        bytes calldata ciphertext,      // ElGamal(bid, mpcPubKey, random_r)
        bytes32 bidCommitment,           // Poseidon(bid, salt) — PoseidonT3 (2 inputs)
        bytes calldata zkRangeProof      // Groth16 proof from BidRange.circom
    ) external;

    // After auction close: committee decrypts off-chain, produces FROST signature.
    // FROST verification: <6K gas on EVM (constant regardless of threshold size).
    function finalizeSealed(
        bytes32 auctionId,
        uint256[] calldata decryptedBids,
        bytes calldata thresholdSignature  // FROST 3-of-5 signature
    ) external;

    // MPC committee setup (one-time per auction series):
    // 1. 5 nodes run DKG → each gets key share, no node knows full key
    // 2. Joint pubkey published via setCommitteeKey()
    // 3. At close: partial decryptions shared P2P → FROST signature produced
    // 4. Losing bids' ciphertexts remain encrypted forever
    function setCommitteeKey(bytes32 pubKey) external;
}
```

**Tiebreaker (no oracle needed):** When bids are equal, winner selected using `prevrandao` (EIP-4399, post-Merge). **L2 caveat:** On L2s like Base, `block.prevrandao` returns the L2 sequencer's value, which has weaker randomness guarantees than L1's RANDAO (the L2 sequencer could influence it). For hackathon MVP this is acceptable. For production: use Chainlink VRF or commit-reveal with L1 RANDAO as the seed source.
```solidity
// Two-block commit prevents last-block validator manipulation
Block N:   r1 = block.prevrandao   (recorded at close)
Block N+1: r2 = block.prevrandao   (recorded one block later)
seed = keccak256(abi.encodePacked(r1, r2, auctionId))
winner = tiedBidders[seed % tiedBidders.length]
```
