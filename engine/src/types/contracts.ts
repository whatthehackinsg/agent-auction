/**
 * TypeScript types matching on-chain Solidity structs.
 * Source: contracts/src/interfaces/IAuctionTypes.sol
 *
 * Local copies for the engine package — avoids cross-package imports.
 */

// ─── Enums ───────────────────────────────────────────────────────────

/** Maps to IAuctionTypes.AuctionState enum */
export enum AuctionState {
  NONE = 0,
  OPEN = 1,
  CLOSED = 2,
  SETTLED = 3,
  CANCELLED = 4,
}

// ─── Structs ─────────────────────────────────────────────────────────

/**
 * Settlement packet built by the DO sequencer at auction close,
 * signed by the sequencer, and submitted to AuctionRegistry.recordResult().
 *
 * Maps to IAuctionTypes.AuctionSettlementPacket (Solidity).
 */
// Must match deployed contract's struct (includes replayContentHash)
export interface AuctionSettlementPacket {
  auctionId: `0x${string}`;       // bytes32 — unique auction identifier
  manifestHash: `0x${string}`;    // bytes32 — hash of the auction manifest (task description)
  finalLogHash: `0x${string}`;    // bytes32 — Poseidon chain head at close (verifiable)
  replayContentHash: `0x${string}`; // bytes32 — SHA-256 hash of canonical ReplayBundleV1 bytes
  winnerAgentId: bigint;           // uint256 — ERC-8004 agentId of the winner
  winnerWallet: `0x${string}`;    // address — winner's payout address
  winningBidAmount: bigint;        // uint256 — final winning bid in USDC base units (6 decimals)
  closeTimestamp: bigint;          // uint64  — block.timestamp when auction was closed
}

/**
 * Bond record for a single agent in a single auction.
 * Maps to IAuctionTypes.BondRecord (Solidity).
 */
export interface BondRecord {
  depositor: `0x${string}`;       // address — who deposited the bond
  amount: bigint;                  // uint256 — bond amount in USDC base units
  refunded: boolean;               // bool   — whether the bond has been refunded
}

// ─── AuctionData (AuctionRegistry storage) ───────────────────────────

/**
 * Full auction data as stored in AuctionRegistry.auctions mapping.
 * This is the on-chain view — read via AuctionRegistry.auctions(auctionId).
 */
export interface AuctionData {
  state: AuctionState;
  manifestHash: `0x${string}`;
  roomConfigHash: `0x${string}`;
  reservePrice: bigint;
  depositAmount: bigint;
  deadline: bigint;
  // Populated at close (recordResult):
  finalLogHash: `0x${string}`;
  replayContentHash: `0x${string}`;
  winnerAgentId: bigint;
  winnerWallet: `0x${string}`;
  finalPrice: bigint;
  closeTimestamp: bigint;
}

// ─── Event types (for parsing logs) ──────────────────────────────────

/**
 * AuctionEnded event — emitted by AuctionRegistry.recordResult().
 * This is the CRE EVM Log Trigger source.
 */
export interface AuctionEndedEvent {
  auctionId: `0x${string}`;
  winnerAgentId: bigint;
  winnerWallet: `0x${string}`;
  finalPrice: bigint;
  finalLogHash: `0x${string}`;
  replayContentHash: `0x${string}`;
}

/**
 * CRE settlement report — abi.encode'd payload sent via KeystoneForwarder
 * to AuctionEscrow.onReport().
 */
export interface CRESettlementReport {
  auctionId: `0x${string}`;
  winnerAgentId: bigint;
  winnerWallet: `0x${string}`;
  amount: bigint;
}
