# Architecture

**Analysis Date:** 2026-03-02

## Pattern Overview

**Overall:** Three-layer hybrid system with off-chain sequencing and on-chain settlement via Chainlink CRE.

**Key Characteristics:**
- Agent-initiated actions flow through sequencer to append-only event log
- Cryptographic verification at each layer (EIP-712 signatures, ZK proofs, Poseidon hash chain)
- Settlement mediated exclusively by CRE workflow, never direct platform payout
- Real-time event streaming via two-tier WebSocket (masked public, full participant)
- Optional micropayment gating (x402) on discovery routes

## Layers

**Agent Layer (MCP / HTTP REST):**
- Purpose: AI agents discover auctions, join, submit bids, receive orders via MCP server or HTTP REST
- Location: `mcp-server/` (MCP tools), `agent-client/` (demo TypeScript client)
- Contains: Tool registration (discover, details, join, bid, bond), action marshalling, nonce tracking
- Depends on: Engine API (`ENGINE_URL`), Crypto library for EIP-712 signing
- Used by: AI agents, human frontends (via engine HTTP API)

**Auction Engine (Cloudflare Workers + Durable Objects):**
- Purpose: Centralized sequencer that maintains verifiable, append-only event log per auction
- Location: `engine/src/index.ts` (Hono HTTP router), `engine/src/auction-room.ts` (Durable Object)
- Contains: Action validation, sequencing, event log persistence, WebSocket streaming, D1 metadata
- Depends on: Blockchain (for identity checks, bond verification), crypto libraries (Poseidon, snarkjs)
- Used by: MCP server, agent clients, frontend, settlement workflow

**Blockchain Layer (Base Sepolia):**
- Purpose: Immutable identity registry, bond escrow, auction state machine, on-chain settlement receipts
- Location: `contracts/src/` (Solidity contracts)
- Contains: AuctionRegistry (state machine), AuctionEscrow (USDC bonds), AgentPrivacyRegistry (ZK membership), NftEscrow (custody)
- Depends on: ERC-8004 identity, Chainlink KeystoneForwarder (for CRE reports)
- Used by: Engine (state checks, bond verification), CRE (settlement trigger), agents (bonds, identity)

**CRE Workflow (Chainlink Runtime Environment):**
- Purpose: Off-chain computation that verifies settlement conditions and triggers on-chain payout via `onReport()`
- Location: `cre/workflows/settlement/` (CRE workflow definition)
- Contains: Event log verification, winner cross-check, replay bundle fetch, DON signing, report encoding
- Depends on: Blockchain (event triggering, state reads), Engine API (replay bundle)
- Used by: Blockchain settlement (triggered by AuctionEnded event)

**Crypto / Privacy Layer:**
- Purpose: Shared cryptographic primitives for ZK proofs, signing, hash chains
- Location: `packages/crypto/src/` (Poseidon, EIP-712, snarkjs), `circuits/` (Circom Groth16 circuits)
- Contains: Poseidon hash chain, EIP-712 domain separator, ZK proof generation/verification, nullifier tracking
- Depends on: snarkjs, viem, circom artifacts
- Used by: Engine (action validation), contracts (on-chain verification), agents (proof generation)

## Data Flow

**Auction Discovery:**
1. Agent calls `GET /auctions` or MCP `discover()` tool (optional x402 gating)
2. Engine queries D1 database for auction metadata
3. Response includes snapshot of current highest bid, participant count, time remaining
4. Agent evaluates if worth joining (business logic)

**Join Flow:**
1. Agent signs JOIN action with EIP-712 (`agentId`, `nonce`, `deadline`)
2. Agent calls `POST /auctions/:id/action` with signature + ZK membership proof (if required)
3. Engine validates:
   - Signature verification (EIP-712 recovery vs sequencer domain)
   - Nonce check (must be sequential per agent+actionType)
   - Nullifier check (ZK join-only-once via Poseidon hash)
   - Wallet verification (optional: ERC-8004 `ownerOf(agentId)`)
   - Bond observation (cross-check on-chain AuctionEscrow for matching deposit)
4. Engine assigns monotonic `seq` number, computes hash chain: `eventHash = hash(seq, prevHash, payloadHash)`
5. Event persisted to D1, included in append-only log
6. Engine returns `InclusionReceipt` signed by sequencer (proof of inclusion)
7. All participants receive ordered JOIN event via WebSocket (masked: no agentId/wallet unless participant)

**Bid Flow:**
1. Agent signs BID action with EIP-712 (agentId, amount, nonce)
2. Agent submits signed bid + optional sealed-bid ZK range proof
3. Engine validates bid:
   - Signature verification
   - Nonce check
   - Amount >= current highest bid (reject if lower)
   - Auction still OPEN (deadline not passed, not in snipe window if extension applies)
4. Engine sequences, hashes, stores in D1
5. Updates in-memory `highestBid` + `highestBidder`
6. Broadcasts BID event to all WebSocket subscribers
7. If within `snipeWindowSec` of deadline, trigger auto-extension (if `maxExtensions` remaining)

**Auction Close:**
1. Admin calls `POST /auctions/:id/close` (or deadline passes, auto-closed)
2. Engine:
   - Marks auction CLOSED on-chain via AuctionRegistry
   - Computes final `finalLogHash` (hash of all events)
   - Serializes replay bundle (all events, binary format with hash chain proofs)
   - Pins replay to IPFS, computes replay content hash
   - Emits AuctionEnded event on-chain (triggers CRE)

**Settlement (CRE Workflow):**
1. AuctionEnded event detected by CRE listener
2. CRE Phase A: Verify auction is CLOSED on-chain (finalized read)
3. CRE Phase B: Cross-check winner (agentId, wallet, finalPrice) against event
4. CRE Phase C: Fetch replay bundle from engine, verify non-empty (presence check)
5. CRE Phase D: DON signs settlement report
6. CRE Phase E: `writeReport` → KeystoneForwarder → `AuctionEscrow.onReport()`
7. AuctionEscrow:
   - Deducts platform commission (global `commissionBps`, capped 10%)
   - Marks `auctionSettled`
   - Credits winner's bond as withdrawable balance
   - Non-winners can self-claim refunds via `claimRefund()`

**Event Streaming (WebSocket):**
1. Client connects to `GET /auctions/:id/stream` with optional `participantToken`
2. If `participantToken` provided and matches JOIN event for that agentId, marked as participant
3. Public subscribers receive masked events (no agentId, wallet, amount fields)
4. Participant subscribers receive full event data (enables decision-making)
5. Real-time delivery via Hibernatable WebSocket + Durable Object event buffer

**State Management:**
- Off-chain (in-memory): AuctionRoom maintains `seqCounter`, `chainHead`, `highestBid`, `deadline`, `extensionCount`
- Off-chain (persistent): D1 stores auctions metadata, events table (seq-ordered), bond observations
- On-chain: AuctionRegistry holds auction state machine, AuctionEscrow holds bond balances + settlement flags
- Cross-chain verification: CRE reads on-chain state to gate settlement

## Key Abstractions

**Sequencer (AuctionRoom):**
- Purpose: Assign monotonic, gap-free sequence numbers and maintain hash chain
- Examples: `engine/src/auction-room.ts` (Durable Object), `ingestAction()` method
- Pattern: Append-only; once a seq is assigned, it cannot be revoked or reordered. Replay-safe.

**Append-only Event Log:**
- Purpose: Single source of truth for auction ordering; third parties can independently verify
- Examples: D1 `events` table, in-memory event buffer in AuctionRoom
- Pattern: Each event includes `seq` (monotonic), `prevHash` (link to prior event), `eventHash` (self-identifying hash)

**Hash Chain (Poseidon):**
- Purpose: Cryptographically link events; detecting tampering or reordering requires recomputing chain
- Examples: `engine/src/lib/crypto.ts` - `computeEventHash()`, `ZERO_HASH` as genesis
- Pattern: `eventHash = keccak256(abi.encode(seq, prevHash, payloadHash))`

**Two-tier WebSocket Masking:**
- Purpose: Public spectators see aggregate state (bid count, competition level) but not agent identities; participants see full details
- Examples: `engine/src/auction-room.ts` - `toPublicEvent()` vs `toFullEvent()`
- Pattern: Participants verified via `participantToken` (derived from JOIN event agentId)

**Inclusion Receipt:**
- Purpose: Proof that sequencer included an action; if sequencer omits an included action, receipt proves censorship
- Examples: `engine/src/lib/inclusion-receipt.ts` - `signInclusionReceipt()`
- Pattern: Signed by sequencer over (auctionId, seq, eventHash, receivedAt); agent keeps as proof

**ZK Membership Proof (Groth16):**
- Purpose: Agent proves membership in privacy registry without revealing identity
- Examples: `circuits/RegistryMembership_js/` (compiled circuit), `engine/src/lib/crypto.ts` - `verifyMembershipProof()`
- Pattern: Public signal (registryRoot, nullifier); private witness (leaf, proof path); on-chain verification optional (P1)

**x402 Micropayment Gate:**
- Purpose: Optional revenue stream; agents pay per-request for auction discovery
- Examples: `engine/src/middleware/x402.ts`, `createX402Middleware()`
- Pattern: 402 Payment Required challenge-response; `ENGINE_X402_DISCOVERY=true` enables gate; admin key bypasses

## Entry Points

**HTTP API (Engine):**
- Location: `engine/src/index.ts` - Hono app
- Triggers: POST `/auctions/:id/action`, GET `/auctions`, POST `/auctions/:id/close`
- Responsibilities: Route requests to Durable Object, validate auth, apply x402 gating

**Durable Object (AuctionRoom):**
- Location: `engine/src/auction-room.ts` - `AuctionRoom` class
- Triggers: Requests forwarded from Hono router or D1 metadata initialization
- Responsibilities: Sequence actions, maintain hash chain, persist events, stream WebSocket

**Smart Contracts (Blockchain):**
- Location: `contracts/src/AuctionRegistry.sol` - `recordResult()` (called by sequencer), emits AuctionEnded
- Triggers: Engine at auction close, CRE on settlement, agents on bond deposit
- Responsibilities: State transitions, event logging, escrow balance tracking

**CRE Workflow (Settlement):**
- Location: `cre/workflows/settlement/` - DecentralizedOnChainReporting task
- Triggers: AuctionEnded event on-chain (finalized)
- Responsibilities: Verify event, fetch replay, sign report, forward to escrow

**MCP Server (Agent Tools):**
- Location: `mcp-server/src/index.ts` - `createServer()`
- Triggers: AI agent framework calls registered tools
- Responsibilities: Marshal tool inputs, call engine API, return formatted results to agent

## Error Handling

**Strategy:** Fail-closed with detailed error messages. Invalid signatures reject immediately. Network failures on optional paths (e.g., on-chain registration, IPFS pinning) log but don't block auction.

**Patterns:**
- Signature verification: throw immediately on mismatch (no fallback)
- Nonce validation: reject if out of sequence (prevents replay)
- Nullifier check: reject if already spent (prevents double-join)
- Bond verification: cross-check against on-chain escrow; if unconfirmed, request block timeout
- x402 duplicate detection: reject if receipt hash already processed (prevent double-charge)

## Cross-Cutting Concerns

**Logging:** Engine uses structured JSON logging (`console.info()` with component tags). CRE logs to stderr. Contracts emit events. MCP server logs tool invocations.

**Validation:** Multi-stage: crypto signature → nonce → nullifier → business rules (bid amount, deadline). Early exit on crypto failure.

**Authentication:** Agents prove identity via secp256k1 signatures (EIP-712) over action packets. Engine maintains nonce per agent+actionType to prevent replay. Wallet optional (if `ENGINE_VERIFY_WALLET=true`).

**Privacy:** Poseidon hash chain for off-chain nullifiers; ZK proofs for membership without identity revelation; two-tier WebSocket masking for public vs participant events. On-chain: only auction state and settlement results visible, not intermediate bids from losing agents.

---

*Architecture analysis: 2026-03-02*
