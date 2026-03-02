/**
 * Action validation handlers for the auction sequencer.
 *
 * Validates agent actions (join, bid, deliver) before they are
 * ingested by the sequencer. Implements nonce tracking and
 * nullifier checking using DO storage.
 *
 * These handlers are called BEFORE ingestAction — they gate
 * whether an action is allowed into the append-only event log.
 */

import {
  verifyActionSignature,
  verifyMembershipProof,
  verifyBidRangeProof,
  deriveNullifier,
  type AuctionSpeechActType,
  type VerifyMembershipOptions,
  type VerifyBidRangeOptions,
} from '../lib/crypto'
import { ActionType } from '../types/engine'
import type { ActionRequest, ValidatedAction } from '../types/engine'
import { toBytes, toHex } from 'viem'

export interface ValidationContext {
  /** When true, null/missing ZK proof is rejected. */
  requireProofs?: boolean
  /** On-chain registry root for cross-checking proof's registryRoot. */
  expectedRegistryRoot?: string
  /** When true, verify wallet matches ERC-8004 ownerOf(agentId) on JOIN. */
  verifyWallet?: boolean
}

export interface ValidationMutation {
  agentId: string
  actionType: ActionType
  nonce: number
  nullifierHash?: string
  /** ZK-proven Poseidon nullifier (from proof publicSignals[2]). */
  zkNullifier?: string
  /** ZK-proven bid commitment from BidRange proof publicSignals[BID_RANGE_SIGNALS.BID_COMMITMENT]. */
  bidCommitment?: string
}

export interface ValidationResult {
  action: ValidatedAction
  mutation: ValidationMutation
}

// ─── Storage Key Helpers ──────────────────────────────────────────────

/** Storage key for an agent's last accepted nonce for a given action type */
function nonceKey(agentId: string, actionType: ActionType): string {
  return `nonce:${agentId}:${actionType}`
}

/** Storage key for a spent nullifier */
function nullifierKey(hash: string): string {
  return `nullifier:${hash}`
}

// ─── Nonce Validation ─────────────────────────────────────────────────

/**
 * Check that the action nonce is sequential for this agent+actionType.
 * First action must have nonce 0; subsequent must be lastSeen + 1.
 */
export async function checkNonce(
  agentId: string,
  actionType: ActionType,
  nonce: number,
  storage: DurableObjectStorage,
): Promise<void> {
  const key = nonceKey(agentId, actionType)
  const lastSeen = await storage.get<number>(key)

  if (lastSeen === undefined) {
    // First action for this agent+type: nonce must be 0
    if (nonce !== 0) {
      throw new Error(
        `Invalid nonce: expected 0 for first ${actionType} action from agent ${agentId}, got ${nonce}`,
      )
    }
  } else {
    // Subsequent: nonce must be lastSeen + 1
    const expected = lastSeen + 1
    if (nonce !== expected) {
      throw new Error(
        `Invalid nonce: expected ${expected} for ${actionType} action from agent ${agentId}, got ${nonce}`,
      )
    }
  }

}

// ─── Nullifier Validation ─────────────────────────────────────────────

/**
 * Check that a nullifier hash has not been spent.
 * Used for JOIN actions to prevent double-joining.
 */
export async function checkNullifier(
  nullifierHash: string,
  storage: DurableObjectStorage,
): Promise<void> {
  const key = nullifierKey(nullifierHash)
  const spent = await storage.get<boolean>(key)

  if (spent) {
    throw new Error(`Nullifier already spent: ${nullifierHash}`)
  }

}

export async function commitValidationMutation(
  mutation: ValidationMutation,
  storage: DurableObjectStorage,
): Promise<void> {
  await storage.put(nonceKey(mutation.agentId, mutation.actionType), mutation.nonce)
  if (mutation.nullifierHash) {
    await storage.put(nullifierKey(mutation.nullifierHash), true)
  }
}

// ─── EIP-712 Signature Verification ─────────────────────────────────

/** Map engine ActionType to EIP-712 primaryType */
const ACTION_TO_PRIMARY_TYPE: Record<string, AuctionSpeechActType> = {
  [ActionType.JOIN]: 'Join',
  [ActionType.BID]: 'Bid',
  [ActionType.DELIVER]: 'Deliver',
}

/**
 * Verify the EIP-712 signature on an action.
 * Constructs the proper typed data message for each action type
 * and verifies the signature recovers to the agent's wallet address.
 */
async function verifySignature(
  action: ActionRequest,
  auctionId: string,
  extra?: { nullifier?: bigint },
): Promise<void> {
  const primaryType = ACTION_TO_PRIMARY_TYPE[action.type]
  if (!primaryType) {
    throw new Error(`No EIP-712 type defined for action: ${action.type}`)
  }

  const auctionIdUint = BigInt(auctionId)
  const deadline = BigInt(action.deadline ?? 0)

  // Check deadline hasn't expired (skip if 0 = no expiry)
  if (deadline > 0n) {
    const now = BigInt(Math.floor(Date.now() / 1000))
    if (deadline < now) {
      throw new Error(`Action signature expired (deadline: ${action.deadline})`)
    }
  }

  let message: Record<string, unknown>

  switch (action.type) {
    case ActionType.JOIN:
      message = {
        auctionId: auctionIdUint,
        nullifier: extra?.nullifier ?? 0n,
        depositAmount: BigInt(action.amount),
        nonce: BigInt(action.nonce),
        deadline,
      }
      break
    case ActionType.BID:
      message = {
        auctionId: auctionIdUint,
        amount: BigInt(action.amount),
        nonce: BigInt(action.nonce),
        deadline,
      }
      break
    case ActionType.DELIVER:
      message = {
        auctionId: auctionIdUint,
        milestoneId: 0n,
        deliveryHash: '0x' + '00'.repeat(32),
        executionLogHash: '0x' + '00'.repeat(32),
        nonce: BigInt(action.nonce),
        deadline,
      }
      break
    default:
      throw new Error(`Unsupported action type for signature verification: ${action.type}`)
  }

  const valid = await verifyActionSignature({
    address: action.wallet as `0x${string}`,
    primaryType,
    message,
    signature: action.signature as `0x${string}`,
  })

  if (!valid) {
    throw new Error(`Invalid EIP-712 signature for agent ${action.agentId}`)
  }
}

async function verifyMembership(
  action: ActionRequest,
  ctx?: ValidationContext,
): Promise<{ registryRoot: string; nullifier: string }> {
  const options: VerifyMembershipOptions = {
    requireProof: ctx?.requireProofs,
    expectedRegistryRoot: ctx?.expectedRegistryRoot,
  }
  const result = await verifyMembershipProof(action.proof ?? null, options)
  if (!result.valid) {
    throw new Error(`Invalid membership proof for agent ${action.agentId}`)
  }
  return { registryRoot: result.registryRoot, nullifier: result.nullifier }
}

// ─── Per-Action Handlers ──────────────────────────────────────────────

/**
 * Handle JOIN action: verify membership proof (get ZK nullifier if available),
 * derive fallback nullifier if needed, verify signature, check nullifier not spent,
 * check nonce.
 */
export async function handleJoin(
  action: ActionRequest,
  storage: DurableObjectStorage,
  auctionId: string,
  ctx?: ValidationContext,
): Promise<ValidationResult> {
  // 0. Verify wallet matches ERC-8004 on-chain identity (if enabled)
  if (ctx?.verifyWallet) {
    const cached = await storage.get<boolean>(`walletVerified:${action.agentId}`)
    if (!cached) {
      const { verifyAgentWallet } = await import('../lib/identity')
      const { verified } = await verifyAgentWallet(action.agentId, action.wallet)
      if (!verified) {
        throw new Error(
          `Wallet ${action.wallet} does not match on-chain owner for agentId ${action.agentId}`,
        )
      }
      await storage.put(`walletVerified:${action.agentId}`, true)
    }
  }

  // 1. Verify membership proof — get ZK nullifier from publicSignals[2] if proof exists
  const membership = await verifyMembership(action, ctx)

  // 2. Determine which nullifier to use:
  //    - If proof provided a valid ZK nullifier (Poseidon), use it
  //    - Otherwise fall back to keccak nullifier (legacy)
  const hasZkNullifier = membership.nullifier !== '0x00'
  let nullifierHash: string
  let nullifierBigInt: bigint
  let zkNullifier: string | undefined

  if (hasZkNullifier) {
    // ZK-proven Poseidon nullifier from proof's publicSignals[2]
    zkNullifier = membership.nullifier
    nullifierHash = membership.nullifier
    nullifierBigInt = BigInt(membership.nullifier)
  } else {
    // Legacy keccak fallback (no proof or proof was optional and missing)
    const fallback = await deriveNullifier(
      toBytes(action.wallet as `0x${string}`, { size: 32 }),
      toBytes(auctionId as `0x${string}`, { size: 32 }),
      0, // ActionType.JOIN = 0
    )
    nullifierHash = toHex(fallback)
    nullifierBigInt = BigInt(nullifierHash)
  }

  // 3. Verify EIP-712 signature (Join message includes nullifier)
  await verifySignature(action, auctionId, { nullifier: nullifierBigInt })

  // 4. Check nullifier not spent (double-join prevention)
  await checkNullifier(nullifierHash, storage)

  // 5. Check nonce
  await checkNonce(action.agentId, ActionType.JOIN, action.nonce, storage)

  return {
    action: {
      type: action.type,
      agentId: action.agentId,
      wallet: action.wallet,
      amount: action.amount,
      nonce: action.nonce,
      signature: action.signature,
      proof: action.proof,
    },
    mutation: {
      agentId: action.agentId,
      actionType: ActionType.JOIN,
      nonce: action.nonce,
      nullifierHash,
      zkNullifier,
    },
  }
}

/**
 * Handle BID action: verify BidRange proof (if present), verify signature,
 * check nonce sequential, validate amount > 0 and amount > highestBid.
 */
export async function handleBid(
  action: ActionRequest,
  storage: DurableObjectStorage,
  auctionId: string,
  highestBid: string,
  maxBid: string,
  ctx?: ValidationContext,
): Promise<ValidationResult> {
  // 1. Verify BidRange proof (optional unless ENGINE_REQUIRE_PROOFS=true)
  const bidRangeOptions: VerifyBidRangeOptions = {
    requireProof: ctx?.requireProofs,
  }
  const bidRangeResult = await verifyBidRangeProof(action.proof ?? null, bidRangeOptions)
  if (!bidRangeResult.valid) {
    throw new Error(`Invalid bid range proof for agent ${action.agentId}`)
  }

  // 2. If proof was provided, cross-check that the proven reservePrice and maxBudget
  //    are consistent with the auction's constraints
  if (action.proof != null && bidRangeResult.bidCommitment !== '0') {
    // The proof's reservePrice must not exceed the bid amount
    // and the bid amount must not exceed the proof's maxBudget.
    // (The circuit already enforces reservePrice <= bid <= maxBudget,
    //  so we trust the proof — but we verify the proven range bounds
    //  are compatible with the auction's maxBid cap if set.)
    if (BigInt(maxBid) > 0n && BigInt(bidRangeResult.maxBudget) > BigInt(maxBid)) {
      throw new Error(
        `Bid range proof maxBudget ${bidRangeResult.maxBudget} exceeds auction max bid cap ${maxBid}`,
      )
    }
  }

  // 3. Verify EIP-712 signature
  await verifySignature(action, auctionId)

  // 4. Check nonce
  await checkNonce(action.agentId, ActionType.BID, action.nonce, storage)

  // 5. Validate bid amount
  const amount = BigInt(action.amount)
  if (amount <= 0n) {
    throw new Error(`Bid amount must be greater than 0, got ${action.amount}`)
  }
  if (amount <= BigInt(highestBid)) {
    throw new Error(
      `Bid amount ${action.amount} must exceed current highest bid ${highestBid}`,
    )
  }
  if (BigInt(maxBid) > 0n && amount > BigInt(maxBid)) {
    throw new Error(
      `Bid amount ${action.amount} exceeds max bid cap ${maxBid}`,
    )
  }

  return {
    action: {
      type: action.type,
      agentId: action.agentId,
      wallet: action.wallet,
      amount: action.amount,
      nonce: action.nonce,
      signature: action.signature,
      proof: action.proof,
    },
    mutation: {
      agentId: action.agentId,
      actionType: ActionType.BID,
      nonce: action.nonce,
      ...(bidRangeResult.bidCommitment !== '0' ? { bidCommitment: bidRangeResult.bidCommitment } : {}),
    },
  }
}

/**
 * Handle DELIVER action: verify signature, check nonce sequential.
 */
export async function handleDeliver(
  action: ActionRequest,
  storage: DurableObjectStorage,
  auctionId: string,
): Promise<ValidationResult> {
  await verifySignature(action, auctionId)

  // Check nonce
  await checkNonce(action.agentId, ActionType.DELIVER, action.nonce, storage)

  return {
    action: {
      type: action.type,
      agentId: action.agentId,
      wallet: action.wallet,
      amount: action.amount,
      nonce: action.nonce,
      signature: action.signature,
      proof: action.proof,
    },
    mutation: {
      agentId: action.agentId,
      actionType: ActionType.DELIVER,
      nonce: action.nonce,
    },
  }
}

// ─── Dispatcher ───────────────────────────────────────────────────────

/**
 * Validate an incoming action request by routing to the correct handler.
 * Throws descriptive errors on validation failure (caller catches and returns 400).
 */
export async function validateAction(
  action: ActionRequest,
  storage: DurableObjectStorage,
  auctionId: string,
  highestBid: string,
  maxBid: string,
  ctx?: ValidationContext,
): Promise<ValidationResult> {
  switch (action.type) {
    case ActionType.JOIN:
      return handleJoin(action, storage, auctionId, ctx)
    case ActionType.BID:
      return handleBid(action, storage, auctionId, highestBid, maxBid, ctx)
    case ActionType.DELIVER:
      return handleDeliver(action, storage, auctionId)
    default:
      throw new Error(`Unsupported action type: ${action.type}`)
  }
}
