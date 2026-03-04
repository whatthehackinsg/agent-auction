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
  BID_COMMIT = 'BID_COMMIT',  // Sealed-bid: commit phase (no plaintext amount)
  REVEAL = 'REVEAL',           // Sealed-bid: reveal phase (plaintext bid + salt)
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
  zkNullifier?: string;           // ZK-proven Poseidon nullifier (Layer 2 privacy-ready)
  bidCommitment?: string;         // ZK-proven bid commitment from BidRange proof (Poseidon hash)
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
  revealSalt?: string;          // For REVEAL action: the salt used to compute the bid commitment
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

// ─── Item Metadata ──────────────────────────────────────────────────

/** NFT / item metadata attached to an auction */
export interface ItemMetadata {
  imageCid?: string | null
  nftContract?: string | null
  nftTokenId?: string | null
  nftChainId?: number | null
  nftName?: string | null
  nftDescription?: string | null
  nftImageUrl?: string | null
  nftTokenUri?: string | null
}

// ─── Room State ──────────────────────────────────────────────────────

export interface RoomConfigEnvelope {
  engine: Record<string, unknown>;
  future: Record<string, unknown>;
}

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
  status: number;                 // Mirrors D1 auctions.status
  serverNow: number;              // Server timestamp to avoid client clock skew
  timeRemainingSec: number;       // max(deadline - serverNow, 0)
  snipeWindowSec: number;         // Anti-sniping trigger window
  extensionSec: number;           // Seconds added per extension
  maxExtensions: number;          // Extension cap
  extensionCount: number;         // Number of used extensions
  roomConfig: RoomConfigEnvelope;
  terminalType: 'NONE' | 'CLOSE' | 'CANCEL';
  winnerAgentId: string;          // Final winner agentId if terminal CLOSE
  winnerWallet: string;           // Final winner wallet if terminal CLOSE
  winningBidAmount: string;       // Final winning amount if terminal CLOSE

  // Aggregate bidding activity
  bidCount: number;                    // total BID events
  uniqueBidders: number;               // distinct agents who bid
  lastActivitySec: number;             // seconds since last event
  competitionLevel: 'low' | 'medium' | 'high';

  // Price movement
  priceIncreasePct: number;            // % above reserve price (0 if no reserve known)

  // Snipe window intel
  snipeWindowActive: boolean;          // currently in snipe window?
  extensionsRemaining: number;         // maxExtensions - extensionCount
}
