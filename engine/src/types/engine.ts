/**
 * Engine-specific types for the sequencer and auction lifecycle.
 * These types are used by the Durable Object auction rooms,
 * the HTTP/MCP API layer, and agent clients.
 */

// ─── Action Types ────────────────────────────────────────────────────

/** Action types supported by the sequencer */
export enum ActionType {
  JOIN = 'JOIN',
  BID = 'BID',
  DELIVER = 'DELIVER',
  WITHDRAW = 'WITHDRAW',
}

// ─── Append-only Event Log ───────────────────────────────────────────

/**
 * An event in the auction's append-only log.
 * Each event is hash-chained: eventHash = hash(seq, prevHash, payloadHash).
 * The log is the single source of truth for auction state.
 */
export interface AuctionEvent {
  seq: number;                    // Monotonic sequence number (gap-free)
  prevHash: string;               // 0x-prefixed hex — previous event's hash (0x00..00 for seq=0)
  eventHash: string;              // 0x-prefixed hex — this event's hash
  payloadHash: string;            // 0x-prefixed hex — hash of the action payload
  actionType: ActionType;
  agentId: string;                // uint256 as string — ERC-8004 agent ID
  wallet: string;                 // 0x-prefixed address
  amount: string;                 // uint256 as string — USDC base units (6 decimals)
  createdAt: number;              // Unix timestamp (seconds)
}

// ─── Agent Actions ───────────────────────────────────────────────────

/**
 * Validated action received from an agent.
 * The sequencer verifies the EIP-712 signature before sequencing.
 */
export interface ValidatedAction {
  type: ActionType;
  agentId: string;                // uint256 as string
  wallet: string;                 // 0x-prefixed address
  amount: string;                 // uint256 as string
  nonce: number;
  signature: string;              // 0x-prefixed hex (EIP-712 signature)
  proof?: unknown;                // ZK membership proof (optional, P1 scope)
}

/**
 * Action request from agent to engine (raw input before validation).
 * This is the shape of the JSON body in POST /actions.
 */
export interface ActionRequest {
  type: ActionType;
  agentId: string;
  wallet: string;
  amount: string;
  nonce: number;
  signature: string;
  deadline?: number;            // Unix timestamp — signature expiry
  proof?: unknown;
}

// ─── Inclusion Receipts ──────────────────────────────────────────────

/**
 * Inclusion receipt returned after an action is sequenced.
 * Agents keep receipts as proof their action was included.
 * If the sequencer omits an included action, the receipt proves censorship.
 */
export interface InclusionReceipt {
  auctionId: string;              // bytes32 as 0x-prefixed hex
  seq: number;                    // Assigned sequence number
  eventHash: string;              // 0x-prefixed hex — hash of the sequenced event
  prevHash: string;               // 0x-prefixed hex — previous event's hash
  actionType: ActionType;
  receivedAt: number;             // Unix timestamp (seconds)
  sequencerSig: string;           // 0x-prefixed hex — sequencer's signature over the receipt
}

// ─── Room State ──────────────────────────────────────────────────────

/**
 * Snapshot of a room's current state, returned by GET /rooms/:id.
 */
export interface RoomSnapshot {
  auctionId: string;              // bytes32 as 0x-prefixed hex
  currentSeq: number;             // Latest sequence number
  headHash: string;               // 0x-prefixed hex — current chain head
  participantCount: number;
  highestBid: string;             // uint256 as string — current highest bid
  highestBidder: string;          // uint256 as string — agentId of highest bidder
  startedAt: number;              // Unix timestamp
  deadline: number;               // Unix timestamp
}