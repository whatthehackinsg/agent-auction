/**
 * TypeScript types matching on-chain Solidity structs.
 * Source: contracts/src/interfaces/IAuctionTypes.sol
 *
 * Used by WS-3 (engine, agent client, frontend) to interact with deployed contracts.
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
export interface AuctionSettlementPacket {
  auctionId: `0x${string}`;       // bytes32 — unique auction identifier
  manifestHash: `0x${string}`;    // bytes32 — hash of the auction manifest (task description)
  finalLogHash: `0x${string}`;    // bytes32 — Poseidon chain head at close (verifiable)
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
 *
 * Event signature:
 *   AuctionEnded(bytes32 indexed auctionId, uint256 indexed winnerAgentId,
 *                address winnerWallet, uint256 finalPrice,
 *                bytes32 finalLogHash, bytes32 replayContentHash)
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
 * to AuctionEscrow.onReport(). This is what the CRE workflow produces.
 *
 * report = abi.encode(bytes32 auctionId, uint256 winnerAgentId, address winnerWallet, uint256 amount)
 */
export interface CRESettlementReport {
  auctionId: `0x${string}`;
  winnerAgentId: bigint;
  winnerWallet: `0x${string}`;
  amount: bigint;
}

// ─── EIP-712 types (for sequencer signing) ───────────────────────────

/** EIP-712 domain for AuctionRegistry signature verification */
export const EIP712_DOMAIN = {
  name: "AgentAuction",
  version: "1",
  chainId: 84532,
  verifyingContract: "0x81c015F6189da183Bf19a5Bb8ca7FDd7995B35F9" as `0x${string}`,
} as const;

/** EIP-712 type definition for AuctionSettlementPacket signing */
export const SETTLEMENT_PACKET_TYPES = {
  AuctionSettlementPacket: [
    { name: "auctionId", type: "bytes32" },
    { name: "manifestHash", type: "bytes32" },
    { name: "finalLogHash", type: "bytes32" },
    { name: "winnerAgentId", type: "uint256" },
    { name: "winnerWallet", type: "address" },
    { name: "winningBidAmount", type: "uint256" },
    { name: "closeTimestamp", type: "uint64" },
  ],
} as const;

// ─── Contract addresses (Base Sepolia) ───────────────────────────────

export const DEPLOYED_ADDRESSES = {
  chainId: 84532,
  entryPoint: "0x0000000071727De22E5E9d8BAf0edAc6f37da032" as `0x${string}`,
  mockUSDC: "0xfEE786495d165b16dc8e68B6F8281193e041737d" as `0x${string}`,
  mockIdentityRegistry: "0x68E06c33D4957102362ACffC2BFF9E6b38199318" as `0x${string}`,
  mockKeystoneForwarder: "0x846ae85403D1BBd3B343F1b214D297969b39Ce23" as `0x${string}`,
  agentAccountFactory: "0x076d3C6c50b72D78be0C5190c392e6e5Ac7FD8aD" as `0x${string}`,
  agentPaymaster: "0xd71a4b73737d4E1a9A73662Cf93690AB5A4fE32d" as `0x${string}`,
  auctionRegistry: "0x81c015F6189da183Bf19a5Bb8ca7FDd7995B35F9" as `0x${string}`,
  auctionEscrow: "0x211086a6D1c08aB2082154829472FC24f8C40358" as `0x${string}`,
  sequencer: "0x633ec0e633AA4d8BbCCEa280331A935747416737" as `0x${string}`,
} as const;
