# Module 2: Room Broadcast (Event Ordering)

> Split from [research_report_20260219_agent_auction_architecture.md](../research_report_20260219_agent_auction_architecture.md). Citations reference the shared [Bibliography](./06-appendix.md#bibliography).

---

### Module 2: Room Broadcast (Event Ordering)

**Current Design Assessment:** Using Cloudflare Durable Objects as the Room Core with append-only log and seq-based ordering is the optimal choice for the MVP.

**Source of truth (normative):** DO storage log is authoritative for real-time auction mechanics; on-chain anchors in `AuctionRegistry` are authoritative for settlement integrity; CRE is authoritative for settlement execution (escrow release) once it verifies both integrity and rule replay.

**Trust boundaries (normative):** the sequencer/operator can censor events before inclusion; anchors prevent post-hoc rewrite of included events but do not prevent omission; `AuctionEnded` and escrow release MUST wait for `FINALIZED` confidence to avoid reorg-triggered fund loss.

**Research Findings:**

Cloudflare Durable Objects are explicitly designed for this use case. Each DO is a WebSocket server and client, providing single-threaded execution (natural sequencer), transactional storage, and hibernatable WebSockets for cost reduction [9]. The "Rules of Durable Objects" guide (published Dec 2025) confirms that event sourcing with periodic flushing to a persistent store is a recommended pattern [10].

The key pattern is:
1. DO receives action → validates → assigns seq → writes to DO Storage → broadcasts via WebSocket
2. Periodically flush events to PostgreSQL for persistence and query
3. Change Data Capture: DO emits events for downstream consumers (CRE workflows, search index, etc.)

For auction-specific concerns, the single-threaded nature of DOs eliminates race conditions in bid ordering. This is a critical advantage over distributed approaches where determining "who bid first" requires consensus.

**Hybrid Event Log: Off-chain DO + On-chain Poseidon Chain.** The system uses a hybrid model for event handling:
- **Real-time path (off-chain):** DO sequencer processes events in ~ms, broadcasts via WebSocket/SSE. This handles the high-frequency bid flow.
- **Settlement-critical path (on-chain):** `AuctionRoom.sol` maintains a **Poseidon hash chain** on-chain. Settlement-critical events (MVP: join + bid commitment; reserve close/cancel for future) are batched and ingested on-chain via `ingestEventBatch()`. The function validates the chain in memory and persists only the final `chainHead` (single SSTORE).

**Why Poseidon (not keccak256) for the on-chain hash chain:** Poseidon is ZK-friendly — inside a Groth16 circuit, it costs ~240 constraints vs ~90,000 for keccak256. When CRE replays auction rules in the settlement workflow, it may need to verify hash chain segments inside ZK proofs (for sealed-bid verification). On-chain Poseidon costs more (~38K gas for PoseidonT4 / 3-input event hash via `poseidon-solidity` [30]) vs keccak256 (~42 gas), but the ZK circuit savings are 375x. Bid commitments use PoseidonT3 (2-input, ~21K gas). See "Poseidon field encoding (normative)" below for variant mapping and encoding rules. **Design rule: use Poseidon in the on-chain hash chain; use keccak256 everywhere else (event hashing, content addressing, etc.).**

**Event Batch Ingestion (Base Sepolia supports EIP-1153 since Ecotone, Feb 2024):**
```solidity
function ingestEventBatch(Event[] calldata events) external onlySequencer {
  bytes32 cursor = chainHead; // one cold SLOAD (~2,100 gas)
  for (uint i = 0; i < events.length; i++) {
    require(events[i].prevHash == cursor, "chain broken");
    cursor = events[i].hash;
    // cursor is a memory variable — no storage writes needed per iteration.
    // The hash chain is validated in-memory; only the final result is persisted.
  }
  chainHead = cursor; // one cold SSTORE (~20,000 gas)
}
// Gas: 1 SLOAD + N hash comparisons + 1 SSTORE ≈ 22,100 + N × ~200 gas
// For 20 events: ~26K gas total (dominated by the single SSTORE).
//
// EIP-1153 transient storage is available on Base Sepolia but is NOT needed
// for this specific pattern (loop-local variable in memory suffices).
// EIP-1153 is useful elsewhere in the system: e.g., cross-function scratch
// space within a single transaction, or transient reentrancy locks.
// Solidity requirement if using EIP-1153: >= 0.8.24 with evm_version = "cancun".
// ⚠ Toolchain note: Solidity's native `transient` keyword has had regressions in
// some compiler versions. If you adopt EIP-1153, pin a known-good compiler and
// prefer assembly TSTORE/TLOAD unless you've verified the exact Solidity version
// against current release notes.
```

**Periodic On-Chain Anchoring (Critical for Trust):** The hash chain is only useful if anchored independently of the operator. The DO must publish hash checkpoints to the AuctionRegistry contract at regular intervals during the auction (e.g., every N events or every M seconds). This creates an on-chain trail that:
1. Prevents the operator from rewriting history before auction close
2. Gives CRE an independent data source to verify the final result against
3. Allows any third party to detect log tampering by comparing off-chain replay against on-chain anchors

Without periodic anchoring, the operator could rewrite the entire event log before publishing the final hash — making the hash chain a self-attestation rather than a verifiable commitment.

**CRE Integration Point:** When an auction ends, the DO writes an `AuctionEnded` event to the chain (via a simple contract call) including the winner identity (`winnerAgentId`, `winnerWallet`), settlement amount, and content hashes (`finalLogHash`, `replayContentHash`). A CRE EVM Log Trigger listens for this event and kicks off the Settlement Workflow. CRE (1) verifies the final hash against the on-chain anchor trail (EVMClient reads from AuctionRegistry), then (2) fetches the event log and replays auction rules to independently derive the winner. If both checks pass, escrow is released. This creates a clean boundary: off-chain auction engine (DO) → on-chain anchored log → CRE-verified settlement with rule replay.

---

## CRE Workflow 1: Auction Settlement (EVM Log Trigger)

This is the highest-value CRE integration. When the auction engine writes an `AuctionEnded` event on-chain:

1. **Trigger:** EVM Log Trigger listens for `AuctionEnded(bytes32 indexed auctionId, uint256 winnerAgentId, address winnerWallet, uint256 amount, bytes32 finalLogHash, bytes32 replayContentHash)` on AuctionRegistry contract. **Confidence: `CONFIDENCE_LEVEL_FINALIZED`** — settlement is irreversible fund release, so the trigger must wait for block finality to eliminate reorg risk. CRE defaults to `SAFE`; we explicitly override to `FINALIZED` [26] because a reorged `AuctionEnded` event that triggers escrow release would be catastrophic (funds released for an auction that was rolled back). The latency cost (waiting for finality, ~15 min on Ethereum, ~2 min on L2s) is acceptable for settlement.

   **Reorg policy for anchor writes (mid-auction `anchorHash` calls):** Anchor writes use `SAFE` confidence (not `FINALIZED`) because anchors are non-financial operations — a reorged anchor simply means the next anchor overwrites it, and CRE settlement re-reads the entire anchor trail at finality. **If an anchor tx is reorged:** (a) the Durable Object detects the missing anchor via tx receipt polling (3 retries, 15s interval), (b) re-submits the `anchorHash` call with the same hash (idempotent — the hash chain is deterministic from the event log), (c) if re-submission also fails after 3 attempts, the DO logs a `ANCHOR_REORG_FAILED` alert and continues the auction — CRE settlement will still work because it verifies the `finalLogHash` against whatever anchors ARE on-chain at settlement time. Worst case: fewer intermediate anchors = larger window of unverified history (weaker integrity, not broken integrity). **The `AuctionEnded` event (which triggers settlement) always waits for FINALIZED confidence — this is the hard safety boundary.**
2. **Callback (two-phase verification):**
   - **Phase A — Log Integrity:** Read the auction's anchor hash trail from AuctionRegistry (EVMClient read — on-chain data, NOT platform API). Verify the `finalLogHash` is consistent with previously anchored checkpoints. This proves the event log was not rewritten after anchoring.
   - **Phase B — Winner Derivation (Rule Replay):** Fetch the replay bundle from a **configured base URL** (e.g., `https://api.platform.com/replay/{auctionId}` — hardcoded in CRE workflow config, NOT from the event). Serialize using `ReplayBundleV1` (deterministic text format, defined below), hash with SHA-256, and verify it matches `replayContentHash` from the on-chain event. This ensures: (a) no SSRF risk (URL allowlisted in workflow config), (b) all DON nodes hash identical bytes, (c) operator cannot serve different data after posting the hash. Then replay the auction rules: for English auctions, iterate events to find the highest valid bid. Compare the CRE-derived `winnerAgentId` against the `winnerAgentId` field in the `AuctionEnded` event. If they don't match, **reject settlement**.
   - **Phase C — Identity Check:** Read agent identity from ERC-8004 IdentityRegistry using `winnerAgentId` from the event (EVMClient read). Verify: (1) `ownerOf(winnerAgentId)` succeeds without reverting — per EIP-721 specification, `ownerOf` **reverts** (does NOT return `address(0)`) for non-existent or burned tokens ("NFTs assigned to zero address are considered invalid, and queries about them do throw"). The CRE TypeScript handler wraps this EVMClient read in a try-catch: if the call reverts, the agent NFT is invalid and settlement is rejected. (2) `getAgentWallet(winnerAgentId)` returns an address matching the `winnerWallet` from the event. This two-field check ensures the `agentId ↔ wallet` binding is consistent — the operator cannot claim a valid agentId but redirect funds to an unrelated wallet. See "Identity Key Mapping" below for how the platform maintains this binding.
   - **Phase D — Escrow Release:** Call `AuctionEscrow.onReport(metadata, report)` via EVMClient write. The `KeystoneForwarder` contract verifies DON signatures and calls `onReport`. The escrow contract (inheriting `ReceiverTemplate`) validates: (1) `msg.sender == KeystoneForwarder`, (2) `workflowId` matches expected Settlement workflow, (3) `workflowOwner` matches expected deployer address. **Report encoding (normative):** `report = abi.encode(bytes32 auctionId, uint256 winnerAgentId, address winnerWallet, uint256 amount)` (NOT JSON, NOT `abi.encodePacked`). Only after all checks pass does `_processReport` execute the one-time fund release.
3. **Result:** Funds released with BFT consensus verification after both log integrity AND rule correctness are verified. The operator cannot fabricate a winner **from the included bids** because (a) the final hash must be consistent with intermediate anchors committed on-chain during the auction, and (b) CRE independently re-derives the winner from the event log. **Remaining trust boundary — bid censorship:** the operator can silently drop (censor) bids before they enter the log. CRE replays the declared log, which may be missing censored bids. Hash integrity and rule replay cannot detect omissions. See "Inclusion Receipts" below for mitigation.

**Why rule replay matters:** Without Phase B, a malicious operator could consistently hash a log where they declared the second-highest bidder as winner. Hash integrity would pass (the log is self-consistent), but the auction rules would be violated. Rule replay closes this gap for deterministic auction types (English, Dutch, first-price sealed-bid). For subjective auction types (scoring auctions), rule replay is not feasible — those remain operator-attested only.

**Scope of rule replay for MVP:** English auction only. The CRE callback contains a simple loop: parse `BID` events from ReplayBundleV1, track highest valid bid, compare against declared winner. This is ~50 lines of TypeScript in the CRE workflow. Extending to other auction types is a P1 item.

---

## ReplayBundleV1 Canonical Serialization (Normative)

- Encoding: UTF-8 bytes, line separator `\n` (LF), no trailing newline.
- Numeric encoding: `<u64>` and `<u256>` are base-10 ASCII with no leading `+` and no leading zero padding (except the literal `0` if ever applicable).
- Hex encoding: all `<0x..-hex>` fields MUST be lowercase hex with `0x` prefix and fixed width (wallet: 40 hex chars; all hashes and `auction_id`: 64 hex chars). Left-pad with `0` to the required width.
- Header lines (exact order):
  - `schema:v1`
  - `auction_id:<0x64-hex>`
- Hash derivation rules (exact):
  - Define the per-event payload for hashing as a versioned ABI encoding:
    - `ActionPayloadV1 = abi.encode(uint8 action_type, uint256 agent_id, address wallet, uint256 amount)`
    - `action_type` mapping (MVP): `JOIN=1`, `BID=2` (reserve `CLOSE=3`, `CANCEL=4` for future)
    - `action_type` is derived from the text field `type` in the event line (case-sensitive): `JOIN -> 1`, `BID -> 2`; unknown tokens MUST be rejected.
    - `amount` semantics (MVP): for `JOIN`, `amount` MUST be `0`; for `BID`, `amount` is the bid amount (smallest units of the auction currency). Note: the `depositAmount` field in the signed Join typed data (Module 1) is a snapshot of the manifest's deposit requirement (bond requirement), not a record of actual fund movement; actual bond deposits are tracked separately in escrow. This field is separate from the ReplayBundle `amount` field. JOIN amount remains `0` here because the replay bundle records auction *actions*, not fund movements.
  - `payload_hash = keccak256(ActionPayloadV1)`
  - `event_hash = Poseidon(seq, prev_hash, payload_hash)` — 3 inputs → `PoseidonT4.hash(uint256[3])` from `poseidon-solidity` (see Poseidon field encoding below)
  - `prev_hash` for `seq=1` is `0x0000...0000` (32 zero bytes); for `seq>1`, `prev_hash` equals previous event's `event_hash`
  - Replay validator MUST recompute `payload_hash` (from `ActionPayloadV1`) and recompute `event_hash` (from `seq`, `prev_hash`, `payload_hash`) and reject bundle on any mismatch.

### Poseidon Field Encoding (Normative)

This section defines the canonical bytes-to-field-element conversion used by ALL Poseidon call-sites in this spec: event hash chain, nullifier, and bidCommitment. On-chain and off-chain implementations MUST produce identical outputs for the same inputs.

- **Field modulus (BN254 scalar field):** `F = 21888242871839275222246405745257275088548364400416034343698204186575808495617`
- **Conversion rule `to_fr(x)`:** interpret `x` as a big-endian unsigned 256-bit integer, then reduce: `to_fr(x) = uint256(x) % F`. This applies to every Poseidon input regardless of source type (`uint64 seq`, `bytes32 prev_hash`, `bytes32 payload_hash`, `uint256 bid`, `bytes32 salt`, `bytes32 agentSecret`, `bytes32 auctionId`, `uint8 action_type`).
- **Output encoding:** Poseidon outputs are BN254 field elements (< F). Encode as 32-byte big-endian left-padded hex for logs, bundles, and on-chain storage (e.g., `0x002a...`). This matches Solidity's native `uint256` representation.
- **Implementation mapping (`poseidon-solidity` npm [30]):**
  - 2-input Poseidon: `PoseidonT3.hash(uint256[2])` — ~21,124 gas
  - 3-input Poseidon: `PoseidonT4.hash(uint256[3])` — ~37,617 gas
  - The "T" number = arity + 1 (Poseidon convention: T = width of the internal state, which is inputs + 1 capacity element).
- **Cross-language test requirement:** before deployment, verify that the off-chain Poseidon implementation (circomlibjs / poseidon-lite) and the on-chain implementation (`poseidon-solidity`) produce identical hashes for at least 3 test vectors covering: (a) inputs < F, (b) inputs > F requiring reduction, (c) zero inputs.

### ReplayBundleV1 Event Lines

- Event lines (sorted by `seq`, contiguous, no gaps):
  - `event:seq=<u64>|type=<UPPERCASE_TOKEN>|agent_id=<u256>|wallet=<0x40-hex>|amount=<u256>|prev_hash=<0x64-hex>|event_hash=<0x64-hex>|payload_hash=<0x64-hex>`
- `replayContentHash = sha256(canonical_bytes)` stored in `AuctionEnded`.

### ReplayBundleV1 Test Vectors (SHA-256)

These vectors validate canonical byte serialization for `replayContentHash` only. The `payload_hash` and `event_hash` values in these examples are fixed placeholders; real bundles MUST satisfy the recomputation rules above.

- Vector A: canonical bytes =
  - `schema:v1`
  - `auction_id:0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`
  - `event:seq=1|type=JOIN|agent_id=101|wallet=0x1111111111111111111111111111111111111111|amount=0|prev_hash=0x0000000000000000000000000000000000000000000000000000000000000000|event_hash=0x2222222222222222222222222222222222222222222222222222222222222222|payload_hash=0x3333333333333333333333333333333333333333333333333333333333333333`
  - expected hash: `0xab8971d7ea24703e893bde6d94080df82dd1906e43fae580f5857ee8d93a62df`
- Vector B: canonical bytes =
  - `schema:v1`
  - `auction_id:0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb`
  - `event:seq=1|type=JOIN|agent_id=201|wallet=0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa|amount=0|prev_hash=0x0000000000000000000000000000000000000000000000000000000000000000|event_hash=0x4444444444444444444444444444444444444444444444444444444444444444|payload_hash=0x5555555555555555555555555555555555555555555555555555555555555555`
  - `event:seq=2|type=BID|agent_id=201|wallet=0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa|amount=7000000|prev_hash=0x4444444444444444444444444444444444444444444444444444444444444444|event_hash=0x6666666666666666666666666666666666666666666666666666666666666666|payload_hash=0x7777777777777777777777777777777777777777777777777777777777777777`
  - expected hash: `0x4f695aa5b8a96673ca6e7e67ccc863de0e62c0782eaeab86c49a2fb41126979a`

### Replay Data Availability and Liveness Policy

- Replay bundle must be published to at least 2 independent stores (e.g., primary API + object storage mirror) before emitting `AuctionEnded`.
- Enforcement point (required): the sequencer must run `verifyReplayAvailability(replayContentHash, pointerVersion)` before `recordResult`/`AuctionEnded`; if availability check fails, abort emission.
- `AuctionEnded` should carry a replay pointer version and content hash only; workflow resolves the URL from local allowlisted config.
- Replay bundle endpoint readership: it MAY be public read-only (recommended for auditability). If access-controlled, use a single shared credential for all DON nodes and ensure responses are byte-for-byte deterministic (no user/session personalization, no geo-variant payloads).
- CRE workflow retry policy: retry fetch from mirror endpoints with deterministic backoff; if all mirrors fail, emit `SETTLEMENT_DATA_UNAVAILABLE` alert and do not settle.
- If unresolved before `SETTLEMENT_DEADLINE`, `cancelExpiredAuction()` path must remain available to prevent deadlock.

---

## Inclusion Receipts (Anti-Censorship)

When the DO sequencer accepts a bid, it returns a signed inclusion receipt to the bidder: `{auctionId, seq, eventHash, sequencerSignature}`. The agent stores this receipt locally. If the agent's bid does not appear in the final event log, the receipt is cryptographic proof of censorship — the sequencer signed acceptance but the bid is missing from the declared log. **Limitation:** receipts can only prove censorship *after* the sequencer has accepted and signed the event. If the sequencer silently drops a bid before issuing any receipt (pre-inclusion censorship), the bidder has no cryptographic evidence of the omission. This enables:
- **Post-auction dispute:** Agent publishes receipt + final log showing omission. Any verifier can confirm the signature is valid and the event is missing.
- **On-chain challenge (P1):** An `AuctionChallenge` contract accepts receipts and compares against the anchored log. If the receipt's `seq` falls within an anchored range but the corresponding event hash doesn't match, the challenge succeeds and settlement is blocked.
- **MVP scope:** The DO already computes event hashes for the hash chain. Returning the hash + sequencer signature to the bidder is minimal additional work (~10 lines). The challenge contract is P1; for MVP, receipts serve as auditable evidence.

---

## Identity Key Mapping (agentId ↔ wallet)

The `AuctionEnded` event emits both `winnerAgentId` (ERC-8004 NFT token ID) and `winnerWallet` (the agent's registered wallet address). The platform maintains this binding as follows:
- **Registration:** When an agent joins an auction, the platform reads `getAgentWallet(agentId)` from ERC-8004 IdentityRegistry and caches the `(agentId, wallet)` pair. All subsequent bid events in the append-only log include both `agentId` and `wallet`.
- **Rule replay:** CRE replays the event log using `agentId` as the primary key (since agentId is the stable identity). The `winnerAgentId` derived from replay is compared against the event's `winnerAgentId`.
- **Cross-check:** CRE reads `getAgentWallet(winnerAgentId)` on-chain and verifies it matches `winnerWallet` from the event. If the operator emits a valid `agentId` but substitutes a different wallet address, this check fails and settlement is rejected.
- **Wallet rotation edge case:** If an agent rotates their wallet (via `setAgentWallet`) between joining and settlement, the on-chain wallet will differ from the event's `winnerWallet`. CRE Phase C will detect the mismatch and **reject settlement** (not pause — rejected settlements have a defined recovery path). Recovery flow:
  1. CRE rejects: `_processReport` never executes. Auction remains in CLOSED state (not SETTLED, not CANCELLED).
  2. The agent signs an EIP-712 `WalletUpdate` message with their *new* wallet (proving control of the rotated key). The typed data includes `{auctionId, agentId, newWallet, nonce, deadline}` bound to AuctionRegistry's domain (`chainId`, `verifyingContract`). The nonce is per-agent monotonic (prevents replay); the deadline prevents stale signatures.
  3. The sequencer calls `AuctionRegistry.updateWinnerWallet(auctionId, newWallet, deadline, agentSignature)`. The contract verifies the EIP-712 signature via `ECDSA.recover`, confirms `signer == newWallet`, updates the auction record, and re-emits `AuctionEnded` with the corrected wallet.
  4. CRE re-triggers on the new `AuctionEnded` event. Phase C now reads the current on-chain wallet, which matches → settlement proceeds.
  5. Timeout: if no `updateWinnerWallet` is called within `SETTLEMENT_DEADLINE` (72 hours after CLOSED), anyone can call `cancelExpiredAuction(auctionId)` → state moves to CANCELLED → all bonds are refundable via `claimRefund()`.
  This ensures no settlement gets permanently stuck. See `updateWinnerWallet` in AuctionRegistry for the full EIP-712 implementation.

---

## CRE Deployment Notes (Implementation Gotchas)

**Trigger encoding (simulation ≠ production):** The CRE simulator accepts raw hex strings for trigger configuration, but **deployed workflows require base64 encoding** [26]. Contract addresses in the `addresses` list and indexed topic values in `topics[1..3]` must use `hexToBase64()` from `@chainlink/cre-sdk`. A workflow that passes `cre workflow simulate` can fail silently in production if hex-encoded trigger config is not converted.

**Address and topic encoding [26]:** The `addresses` list and `topics` array have different padding requirements:
- **`addresses` list (contract addresses):** base64-encode the raw 20-byte address. No 32-byte padding needed.
- **`topics[1..3]` (indexed parameter values):** these are EVM log topic slots, which are always 32 bytes. Values shorter than 32 bytes (e.g., an `address` used as an indexed event parameter) MUST be **left-padded to 32 bytes** before base64 encoding.
- **`topics[0]` (event signature):** the `keccak256` hash of the event signature, already 32 bytes. Base64-encode directly.

```typescript
import { hexToBase64 } from "@chainlink/cre-sdk"
import { padHex } from "viem"  // padHex is a viem utility, NOT from cre-sdk

// addresses list: raw 20-byte contract address, no padding
const base64Contract = hexToBase64(registryAddress)

// topics[1]: indexed auctionId (bytes32) — already 32 bytes, encode directly
const base64AuctionId = hexToBase64(auctionId)

// topics[2]: indexed address param — must be padded to 32 bytes first
const paddedAddrTopic = padHex(someAddress, { size: 32 })
const base64AddrTopic = hexToBase64(paddedAddrTopic)
```
Unpadded topic values will not match indexed filters and the trigger will never fire.

**Topic semantics:** `addresses` use OR logic (any listed contract), `topics` use AND between positions (all must match), OR within a single topic (any value). Topic[0] is always the event signature hash.

**KeystoneForwarder address is network-specific:** The forwarder address differs per network. Look up the correct address from the [Forwarder Directory](https://docs.chain.link/cre/guides/workflow/using-evm-client/forwarder-directory) before deploying. Wrong forwarder = all reports rejected.

**ERC165 requirement:** The consumer contract must implement `supportsInterface` returning true for `IReceiver`. The simulator does NOT check this; the forwarder does. `ReceiverTemplate` handles this automatically.

**Gas budget:** DON does not estimate gas on your behalf. Test with maximum expected payload. Recommended allocation: 300K-500K gas for settlement reports. **Retry semantics:** if `onReport` reverts (e.g., out-of-gas), the forwarder records the transmission as `FAILED` and the DON CAN retry the same report with a higher gas limit. `AlreadyAttempted` only fires for transmissions that already SUCCEEDED or had INVALID_RECEIVER — not for reverts. However, the consumer contract must be idempotent (discard stale/duplicate reports) because retries deliver the exact same data.

**Workflow registration:** `cre workflow deploy` registers the workflow on-chain to the **Workflow Registry** on Ethereum Mainnet (`0x4Ac54353FA4Fa961AfcC5ec4B118596d3305E7e5` per official docs). This is separate from where the workflow *executes* (e.g., Base Sepolia) — registration is always on Mainnet. Requires real ETH in the deployer wallet + `ethereum-mainnet` RPC in `project.yaml`. **Note:** The Chainlink MCP developer assistant reports Sepolia for registration, but the [official deploying workflows documentation](https://docs.chain.link/cre/guides/operations/deploying-workflows) specifies Mainnet. Verify the current registry address at [Supported Networks](https://docs.chain.link/cre/supported-networks-ts) before deployment (addresses may change during Early Access).

**Metadata encoding (version-pinned, Feb 2026):** The KeystoneForwarder slices `rawReport[45:109]` (64 bytes) and passes it as the `metadata` parameter to `IReceiver.onReport(bytes calldata metadata, bytes calldata report)`. The 64 bytes contain 4 fields:

| Field | Type | Byte offset | Size |
|-------|------|-------------|------|
| workflowId (workflow_cid) | bytes32 | 0-31 | 32 |
| workflowName (workflow_name) | bytes10 | 32-41 | 10 |
| workflowOwner (workflow_owner) | address | 42-61 | 20 |
| reportName (report_id) | bytes2 | 62-63 | 2 |

**ReceiverTemplate decodes only 3 of these 4 fields.** The official `ReceiverTemplate._decodeMetadata()` (source: [smartcontractkit/documentation ReceiverTemplate.sol](https://github.com/smartcontractkit/documentation/blob/main/public/samples/CRE/ReceiverTemplate.sol), identical in [x402-cre-price-alerts](https://github.com/smartcontractkit/x402-cre-price-alerts/blob/main/contracts/interfaces/ReceiverTemplate.sol)) returns `(bytes32 workflowId, bytes10 workflowName, address workflowOwner)` — it reads up to payload byte 62 (32+10+20) and **ignores the last 2 bytes** (`reportName`). Note: in assembly, `mload(add(metadata, 74))` appears because `metadata` is a `bytes memory` pointer whose first 32 bytes are the ABI length prefix; the actual payload starts at offset 32, so assembly offset 74 = 32 (length prefix) + 42 (payload byte where `workflowOwner` begins, i.e., after 32-byte `workflowId` + 10-byte `workflowName`). The `cre_x402_smartcon_demo` [MessageVault.sol](https://github.com/smartcontractkit/cre_x402_smartcon_demo/blob/main/cre_workflow/contracts/evm/src/MessageVault.sol) documents all 4 fields in comments but also only extracts 2 (workflowName, workflowOwner). **Our `_processReport` can read `reportName` from the raw metadata bytes if needed** (e.g., to distinguish settlement vs. other report types), but ReceiverTemplate's built-in validation ignores it.

**Version pinning:** This metadata layout is defined by `KeystoneForwarder` constants `METADATA_LENGTH = 109` and `FORWARDER_METADATA_LENGTH = 45` (source: [KeystoneForwarder.sol](https://github.com/smartcontractkit/chainlink-evm/blob/develop/contracts/cre/src/v1/KeystoneForwarder.sol)). If these constants change in a future forwarder version, the byte offsets will shift. **Pin to the deployed KeystoneForwarder address** on your target network (look up in [Forwarder Directory](https://docs.chain.link/cre/guides/workflow/using-evm-client/forwarder-directory)) and verify with a Foundry test before production deployment.

**Canonical Foundry test vector (verify metadata decode):**
```solidity
// In your test file — verifies your _decodeMetadata matches the forwarder's layout
bytes memory metadata = abi.encodePacked(
    bytes32(0x1111111111111111111111111111111111111111111111111111111111111111), // workflowId
    bytes10(0x22222222222222222222),                                            // workflowName
    address(0x3333333333333333333333333333333333333333),                         // workflowOwner
    bytes2(0x4444)                                                              // reportName
);
assertEq(metadata.length, 64);
(bytes32 wfId, bytes10 wfName, address wfOwner) = _decodeMetadata(metadata);
assertEq(wfId, bytes32(0x1111...));
assertEq(wfName, bytes10(0x2222...));
assertEq(wfOwner, address(0x3333...));
```

**⚠ WARNING:** the Chainlink MCP developer assistant returns a STALE byte order (`workflowOwner` before `workflowName`) — do NOT rely on it for metadata layout. Always verify against the actual KeystoneForwarder source or deployed contract. Workflow names are unique per owner but NOT globally unique — always validate both `workflowName` AND `workflowOwner`.

**Simulation metadata caveat (critical for development workflow):** `cre workflow simulate` uses a `MockKeystoneForwarder` that does NOT populate workflow metadata (`workflowId`, `workflowName`, `workflowOwner`). ReceiverTemplate's expected values are configurable via `onlyOwner` setters — setting any expected value to zero (or not calling the setter) DISABLES that validation check. **Development workflow:**
1. For simulation: deploy consumer and do NOT call `setExpectedAuthor` / `setExpectedWorkflowName` / `setExpectedWorkflowId`. Default values are zero, which disables validation — simulated reports with zero metadata will pass.
2. Run `cre workflow simulate` — validation checks pass because expected values are zero (disabled).
3. For production: call the setters with real values: `setExpectedAuthor(workflowDeployerAddress)`, `setExpectedWorkflowName("auctSettle")` (plaintext string, not bytes10), `setExpectedWorkflowId(workflowIdBytes32)`. Use the production `KeystoneForwarder` address from the [Forwarder Directory](https://docs.chain.link/cre/guides/workflow/using-evm-client/forwarder-directory). **No redeployment needed** — just call the setters on the existing contract.
4. To test metadata validation before production, use Foundry/Hardhat test harness calling `onReport` directly with `abi.encodePacked` metadata (correct order: workflowId + workflowName + workflowOwner + reportName) — bypassing the MockForwarder.
5. After production configuration: transfer Ownable ownership to a timelocked multisig to prevent unauthorized reconfiguration.

**CRE Early Access:** As of Feb 2026, deployment is in Early Access. Pin SDK versions (`@chainlink/cre-sdk` — check npm for latest version; the SDK is in rapid iteration during Early Access, version may differ from documentation examples). Always run `npm info @chainlink/cre-sdk version` before pinning. Test after any upgrade.

---

## Smart Contract Design: Auction Logic Layer

**AuctionFactory.sol** — deploys AuctionRoom instances, holds EIP-712 domain separator
```solidity
contract AuctionFactory {
    // EIP-712 domain for all speech acts (fetched by agents at onboarding)
    bytes32 public DOMAIN_SEPARATOR;  // EIP712Domain("AgentAuction", "1", chainId, this)

    struct AuctionManifest {
        // Derived field: MUST equal manifestHash (see AuctionManifest hashing below).
        // For API responses, include it for convenience; for hashing, EXCLUDE it.
        bytes32 auctionId;
        bytes32 taskDescriptionHash;
        bytes32 requiredCapability;
        uint256 reservePrice;
        uint256 depositAmount;
        uint256 commitDeadline;
        uint256 revealDeadline;
        uint256 deliveryDeadline;
    }

    // manifestHash = keccak256(abi.encode(manifest_without_auctionId)) stored on-chain.
    // auctionId MUST equal manifestHash.
    // Agents verify fetched manifest matches hash before participating.
    function createAuction(AuctionManifest calldata manifest) external returns (address room);

    mapping(bytes32 => address) public auctionRooms;  // auctionId => AuctionRoom address
}
```

### AuctionManifest hashing (normative)

This section defines the exact hash preimage and JSON-to-ABI rules to avoid cross-language forks.

- **ABI tuple and types (MUST match exactly):**
  - `manifest_preimage = abi.encode(bytes32 taskDescriptionHash, bytes32 requiredCapability, uint256 reservePrice, uint256 depositAmount, uint256 commitDeadline, uint256 revealDeadline, uint256 deliveryDeadline)`
  - `manifestHash = keccak256(manifest_preimage)`
  - `auctionId = manifestHash`
- **Exclusion rule:** `auctionId` MUST NOT be included in `manifest_preimage`.
- **Contract rule:** `AuctionFactory.createAuction()` MUST enforce `manifest.auctionId == manifestHash` (reject otherwise).
- **API JSON canonicalization (MUST):**
  - `uint256` values MUST be base-10 ASCII strings in JSON (parse using BigInt; do not rely on IEEE-754 numbers)
  - `bytes32` MUST be lowercase `0x` + 64 hex chars
  - `address` MUST be lowercase `0x` + 40 hex chars
  - No optional fields: missing fields MUST be rejected before hashing

**AuctionRoom.sol** — per-auction state machine with on-chain Poseidon hash chain
```solidity
contract AuctionRoom {
    // Off-chain phases (DO state) — NOT the same as AuctionRegistry's on-chain states.
    // Mapping: OPEN/COMMIT/REVEAL/MPC_CLOSE → AuctionRegistry.OPEN (auction running)
    //          CLOSED → AuctionRegistry.CLOSED (recordResult triggers transition)
    //          SETTLED → AuctionRegistry.SETTLED (markSettled after CRE)
    // Source of truth: AuctionRegistry (on-chain) for settlement/escrow.
    //                  AuctionRoom (off-chain DO) for real-time auction mechanics.
    enum Phase { OPEN, COMMIT, REVEAL, MPC_CLOSE, CLOSED, SETTLED }
    Phase public currentPhase;

    // On-chain Poseidon hash chain (settlement-critical events)
    // Payload encoding (MVP, versioned):
    //   ActionPayloadV1 = abi.encode(uint8 action_type, uint256 agent_id, address wallet, uint256 amount)
    //   action_type mapping (MVP): JOIN=1, BID=2
    struct Event {
        uint64  seq;
        bytes32 prevHash;      // previous event's `hash` (or 0x00.. for seq=1)
        bytes   payload;       // ActionPayloadV1 bytes
        bytes32 hash;          // PoseidonT4.hash([to_fr(seq), to_fr(prevHash), to_fr(keccak256(payload))])
        bytes   agentSig;      // EIP-712 signature from acting agent
    }
    bytes32 public chainHead;  // latest event hash

    // Batch ingestion: validates hash chain in memory, persists only chainHead.
    // EIP-1153 available on Base Sepolia (Ecotone, Feb 2024) but not needed here
    // (loop-local cursor is a memory variable, not storage).
    // Requires Solidity >= 0.8.24 with evm_version = "cancun" if using EIP-1153 elsewhere.
    // ⚠ Toolchain note: Solidity's native `transient` keyword has had regressions in
    // some compiler versions. If you adopt EIP-1153, pin a known-good compiler and
    // prefer assembly TSTORE/TLOAD unless you've verified the exact Solidity version.
    function ingestEventBatch(Event[] calldata events) external onlySequencer;

    // Any third party can pull events from L2 calldata, replay the Poseidon chain,
    // and verify chainHead matches — a prerequisite for independent rule replay.
}
```

---

**AuctionRegistry.sol** — auction lifecycle + hash anchoring + state machine
```solidity
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

contract AuctionRegistry is EIP712 {
    // ⚠ AUCTIONID TYPE: bytes32 everywhere. AuctionFactory derives auctionId from
    // manifestHash (keccak256 of the manifest ABI preimage) and uses it as CREATE2 salt.
    // All contracts (AuctionFactory, AuctionRegistry, AuctionEscrow, AuctionRoom) MUST
    // use bytes32 for auctionId. Using uint256 would require casting and risks truncation.
    //
    // EIP-712 typed data hash for wallet rotation recovery (updateWinnerWallet).
    // Struct fields: auctionId (bytes32), agentId, newWallet, nonce, deadline.
    // ⚠ TWO-DOMAIN DESIGN: AuctionRegistry uses EIP712("AuctionRegistry", "1", chainId, this)
    // which is DIFFERENT from AuctionFactory's EIP712("AgentAuction", "1", chainId, factory).
    // Agents MUST sign WalletUpdate structs with AuctionRegistry's domain, NOT AuctionFactory's.
    // Using the wrong domain will cause ecrecover to return wrong address → signature verification fails.
    // Agent SDK must select domain automatically based on target contract.
    bytes32 private constant WALLET_UPDATE_TYPEHASH = keccak256(
        "WalletUpdate(bytes32 auctionId,uint256 agentId,address newWallet,uint256 nonce,uint256 deadline)"
    );

    address public owner;            // Platform operator
    address public sequencer;        // Authorized DO backend address

    enum AuctionState { NONE, OPEN, CLOSED, SETTLED, CANCELLED }

    struct Auction {
        AuctionState state;
        bytes32 objectHash;
        uint256 winnerAgentId;       // ERC-8004 agentId (NFT token ID)
        address winnerWallet;        // Agent's registered wallet (from ERC-8004 getAgentWallet)
        uint256 amount;
        bytes32 finalLogHash;
        bytes32 replayContentHash;   // SHA-256 of ReplayBundleV1 canonical bytes (deterministic, language-agnostic)
        uint256 closedAt;            // Timestamp when state moved to CLOSED (for settlement deadline)
    }

    mapping(bytes32 => Auction) internal auctions;  // auctionId (bytes32) => Auction

    // Explicit getter returns full struct (Solidity auto-generated getter for public mappings
    // returns a flat tuple, which breaks struct-based interface consumption in other contracts).
    function getAuction(bytes32 auctionId) external view returns (Auction memory) {
        return auctions[auctionId];
    }

    event AuctionCreated(bytes32 indexed auctionId, address creator, bytes32 objectHash);
    event HashAnchored(bytes32 indexed auctionId, uint256 seq, bytes32 logHash);
    // Both agentId and wallet are emitted so CRE can cross-check the binding via IdentityRegistry
    event AuctionEnded(bytes32 indexed auctionId, uint256 winnerAgentId, address winnerWallet, uint256 amount, bytes32 finalLogHash, bytes32 replayContentHash);
    // State transition events for off-chain indexers and Spectator UI
    event AuctionSettledOnChain(bytes32 indexed auctionId, uint256 indexed winnerAgentId);  // CLOSED → SETTLED
    event AuctionCancelled(bytes32 indexed auctionId, uint256 closedAt, uint256 cancelledAt);  // CLOSED → CANCELLED (72h timeout)

    modifier onlySequencer() { require(msg.sender == sequencer, "not sequencer"); _; }
    modifier onlyOwner() { require(msg.sender == owner, "not owner"); _; }
    modifier inState(bytes32 auctionId, AuctionState expected) {
        require(auctions[auctionId].state == expected, "invalid auction state");
        _;
    }

    // EIP712("AuctionRegistry", "1") initializes the domain separator:
    //   { name: "AuctionRegistry", version: "1", chainId: <auto>, verifyingContract: <this> }
    // Used by updateWinnerWallet for wallet rotation recovery signatures.
    constructor(address _sequencer) EIP712("AuctionRegistry", "1") {
        owner = msg.sender;
        sequencer = _sequencer;
    }

    function createAuction(bytes32 auctionId, bytes32 objectHash) external onlySequencer;
    // State: NONE -> OPEN

    // Called periodically during auction to anchor hash chain.
    // Enforces: seq > lastAnchoredSeq[auctionId] (strict monotonicity).
    // Appends to anchorTrails[auctionId]. Cannot be modified after creation.
    function anchorHash(bytes32 auctionId, uint256 seq, bytes32 logHash) external onlySequencer inState(auctionId, AuctionState.OPEN);

    // Called once at auction close — emits the event that triggers CRE
    // replayContentHash: SHA-256 of ReplayBundleV1 canonical bytes.
    // CRE fetches replay data from a configured base URL (not from the event),
    // normalizes to ReplayBundleV1, hashes, and compares.
    function recordResult(bytes32 auctionId, uint256 winnerAgentId, address winnerWallet, uint256 amount, bytes32 finalLogHash, bytes32 replayContentHash) external onlySequencer inState(auctionId, AuctionState.OPEN);
    // State: OPEN -> CLOSED

    // Called by AuctionEscrow after successful CRE settlement — marks auction as settled.
    // Access: only the escrow contract can call this (prevents unauthorized state advancement).
    modifier onlyEscrow() { require(msg.sender == address(escrow), "not escrow"); _; }
    address public escrow;  // Set once after AuctionEscrow deployment — immutable after first set
    function setEscrow(address _escrow) external onlyOwner {
        require(escrow == address(0), "escrow already set");  // one-time only
        require(_escrow != address(0), "zero address");
        escrow = _escrow;
    }
    function markSettled(bytes32 auctionId) external onlyEscrow inState(auctionId, AuctionState.CLOSED);
    // State: CLOSED -> SETTLED

    // Wallet rotation recovery: re-emit AuctionEnded with updated wallet, re-triggering CRE.
    // Requires: auction is CLOSED (CRE rejected due to wallet mismatch), EIP-712 agent signature.
    //
    // EIP-712 Typed Data Specification:
    //   Domain: { name: "AuctionRegistry", version: "1", chainId: <Base Sepolia>, verifyingContract: <this> }
    //   Type:   WalletUpdate { bytes32 auctionId, uint256 agentId, address newWallet, uint256 nonce, uint256 deadline }
    //   - nonce: per-agent monotonic counter (prevents replay of old signatures)
    //   - deadline: block.timestamp upper bound (prevents stale signatures)
    //   - chainId + verifyingContract: bound to this specific chain + contract (prevents cross-chain replay)
    //   Signer: the agent's NEW wallet address (proves control of the rotated key)
    //   Sequencer: calls the function (onlySequencer), providing authorization that the platform
    //              has verified the rotation off-band. The sequencer does NOT co-sign the EIP-712 —
    //              its authorization is implicit via msg.sender == sequencer.
    //
    mapping(uint256 => uint256) public walletUpdateNonces;  // agentId => nonce
    // P1: Rate-limit wallet updates to prevent AuctionEnded event spam.
    // Each updateWinnerWallet re-emits AuctionEnded, re-triggering CRE. Without a cap,
    // a compromised sequencer could flood CRE with re-triggers.
    uint256 public constant MAX_WALLET_UPDATES_PER_AUCTION = 3;
    mapping(bytes32 => uint256) public walletUpdateCount;  // auctionId => count

    function updateWinnerWallet(
        bytes32 auctionId,
        address newWallet,
        uint256 deadline,
        bytes calldata agentSignature  // EIP-712 signed by newWallet
    ) external onlySequencer inState(auctionId, AuctionState.CLOSED) {
        require(block.timestamp <= deadline, "signature expired");
        require(walletUpdateCount[auctionId] < MAX_WALLET_UPDATES_PER_AUCTION, "update limit reached");
        uint256 agentId = auctions[auctionId].winnerAgentId;
        uint256 nonce = walletUpdateNonces[agentId]++;
        // Recover signer from EIP-712 signature, verify == newWallet
        bytes32 structHash = keccak256(abi.encode(
            WALLET_UPDATE_TYPEHASH, auctionId, agentId, newWallet, nonce, deadline
        ));
        address signer = ECDSA.recover(_hashTypedDataV4(structHash), agentSignature);
        require(signer == newWallet, "invalid agent signature");
        // Update and re-trigger
        walletUpdateCount[auctionId]++;
        auctions[auctionId].winnerWallet = newWallet;
        emit AuctionEnded(auctionId, agentId, newWallet,
            auctions[auctionId].amount, auctions[auctionId].finalLogHash,
            auctions[auctionId].replayContentHash);
        // CRE re-triggers on the new AuctionEnded event
    }

    // Timeout cancellation: if CLOSED auction is not settled within deadline, cancel and enable refunds.
    uint256 public constant SETTLEMENT_DEADLINE = 72 hours;
    function cancelExpiredAuction(bytes32 auctionId) external inState(auctionId, AuctionState.CLOSED);
    // Requires: block.timestamp > auctions[auctionId].closedAt + SETTLEMENT_DEADLINE
    // State: CLOSED -> CANCELLED

    // --- Anchor Storage & Verification ---
    //
    // Anchor storage schema: each auction maintains an ordered list of (seq, logHash) checkpoints.
    // The DO sequencer calls anchorHash() periodically during the auction to commit hash-chain
    // checkpoints on-chain. These create an immutable, append-only trail that CRE reads to verify
    // the final log hash was derived from a consistent history.
    //
    // Invariants enforced by anchorHash():
    //   1. Seq monotonicity: each new anchor's seq must be strictly greater than the previous.
    //      This prevents out-of-order or duplicate anchors.
    //   2. Uniqueness: each (auctionId, seq) pair can only be anchored once.
    //   3. Append-only: anchors cannot be modified or deleted after creation.
    //
    // Checkpoint cadence (configurable per auction, recommended defaults):
    //   - Every 50 events OR every 30 seconds, whichever comes first
    //   - Always anchor after the first event (seq=1) and at close (seq=max, final hash)
    //   - There is no seq=0 event. The hash chain starts at seq=1 with prev_hash = 0x00..00 (32 zero bytes).
    //     The "genesis" state is implicit: before any events, chainHead = 0x00..00.
    //   - Minimum: 2 anchors (first + end) — WARNING: reduces trust model to final-hash attestation
    //
    // Reconstruction rules (for CRE Settlement Workflow Phase A):
    //   1. Read all anchors via getAnchors(auctionId) → (seqs[], hashes[])
    //   2. Fetch the event log as ReplayBundleV1 (from configured base URL)
    //   3. For each event line, compute payloadBytes = ActionPayloadV1
    //      and payloadHash = keccak256(payloadBytes)
    //   4. Replay hash chain: hash = PoseidonT4([to_fr(seq), to_fr(prevHash), to_fr(payloadHash)])
    //      (prevHash for seq=1 is 0x00..00; see "Poseidon field encoding" above)
    //   5. At each anchor seq, compare computed hash against anchored hash
    //   6. If ANY mismatch → log was tampered → reject settlement
    //   7. Final computed hash must equal finalLogHash from AuctionEnded event
    //
    struct Anchor {
        uint256 seq;
        bytes32 logHash;
    }
    mapping(bytes32 => Anchor[]) internal anchorTrails;  // auctionId => ordered anchors
    mapping(bytes32 => uint256) internal lastAnchoredSeq; // auctionId => last anchored seq (for monotonicity)

    // Read anchor trail (used by CRE Settlement Workflow via EVMClient)
    function getAnchors(bytes32 auctionId) external view returns (uint256[] memory seqs, bytes32[] memory hashes) {
        Anchor[] storage trail = anchorTrails[auctionId];
        uint256 len = trail.length;
        seqs = new uint256[](len);
        hashes = new bytes32[](len);
        for (uint256 i = 0; i < len; i++) {
            seqs[i] = trail[i].seq;
            hashes[i] = trail[i].logHash;
        }
    }

    // --- Delivery Verification (Workflow 2 write target) ---
    // Proof-only: no fund movement. Consumed by ERC-8004 ReputationRegistry or future dispute resolution.
    struct DeliveryProof {
        bool passed;         // true = delivery accepted, false = delivery failed
        bytes32 proofHash;   // Hash of the delivery verification data (for audit)
        uint256 timestamp;   // Block timestamp when proof was recorded
    }
    mapping(bytes32 => DeliveryProof) public deliveryProofs;

    event DeliveryProofRecorded(bytes32 indexed auctionId, bool passed, bytes32 proofHash);
    event DeliveryFailed(bytes32 indexed auctionId, bytes32 proofHash);

    // Called by a separate CRE consumer contract (Workflow 2's ReceiverTemplate instance).
    // For MVP: restricted to onlyOwner (platform records proof after CRE verification off-chain).
    // For production: a dedicated DeliveryVerifier contract inherits ReceiverTemplate and calls this.
    function recordDeliveryProof(bytes32 auctionId, bool passed, bytes32 proofHash) external onlyOwner inState(auctionId, AuctionState.SETTLED) {
        require(deliveryProofs[auctionId].timestamp == 0, "proof already recorded");
        deliveryProofs[auctionId] = DeliveryProof(passed, proofHash, block.timestamp);
        emit DeliveryProofRecorded(auctionId, passed, proofHash);
        if (!passed) {
            emit DeliveryFailed(auctionId, proofHash);
        }
    }

    // Governance: setSequencer is the single most security-critical admin function.
    // If the sequencer key is compromised, the attacker can write fake anchors and
    // trigger CRE settlement with fabricated data that CRE would validate.
    // Production mitigations (P1): Ownable2Step (prevents typo transfers), timelock
    // on setSequencer (gives monitoring time to detect), multisig owner.
    // For hackathon MVP: single EOA owner is acceptable.
    function setSequencer(address _sequencer) external onlyOwner;
}
```

**Post-deploy wiring:** Call `AuctionRegistry.setEscrow(AuctionEscrow.address)` — one-time binding.
