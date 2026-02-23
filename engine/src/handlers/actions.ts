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

import { verifyEIP712Signature, verifyMembershipProof, deriveNullifier } from '../lib/crypto'
import { ActionType } from '../types/engine'
import type { ActionRequest, ValidatedAction } from '../types/engine'
import { toBytes, toHex } from 'viem'

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
 * On success, stores the new nonce.
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

  // Store accepted nonce
  await storage.put(key, nonce)
}

// ─── Nullifier Validation ─────────────────────────────────────────────

/**
 * Check that a nullifier hash has not been spent. If valid, marks it as spent.
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

  await storage.put(key, true)
}

// ─── Signature Verification (stub) ───────────────────────────────────

/**
 * Verify the EIP-712 signature on an action.
 * STUB: Uses the always-true stub from crypto.ts.
 */
function verifySignature(action: ActionRequest): void {
  const valid = verifyEIP712Signature(
    new Uint8Array(32), // stub hash
    toBytes(action.signature as `0x${string}`),
    action.wallet,
  )
  if (!valid) {
    throw new Error(`Invalid EIP-712 signature for agent ${action.agentId}`)
  }
}

// ─── Per-Action Handlers ──────────────────────────────────────────────

/**
 * Handle JOIN action: verify signature, check nullifier not spent,
 * check nonce sequential (first join nonce must be 0).
 */
export async function handleJoin(
  action: ActionRequest,
  storage: DurableObjectStorage,
  auctionId: string,
): Promise<ValidatedAction> {
  verifySignature(action)

  // Derive and check nullifier for join uniqueness
  const nullifier = deriveNullifier(
    toBytes(action.wallet as `0x${string}`, { size: 32 }),
    toBytes(auctionId as `0x${string}`, { size: 32 }),
    0, // ActionType.JOIN = 0
  )
  const nullifierHash = toHex(nullifier)
  await checkNullifier(nullifierHash, storage)

  // Check nonce
  await checkNonce(action.agentId, ActionType.JOIN, action.nonce, storage)

  return {
    type: action.type,
    agentId: action.agentId,
    wallet: action.wallet,
    amount: action.amount,
    nonce: action.nonce,
    signature: action.signature,
    proof: action.proof,
  }
}

/**
 * Handle BID action: verify signature, check nonce sequential,
 * validate amount > 0 and amount > highestBid.
 */
export async function handleBid(
  action: ActionRequest,
  storage: DurableObjectStorage,
  auctionId: string,
  highestBid: string,
): Promise<ValidatedAction> {
  verifySignature(action)

  // Check nonce
  await checkNonce(action.agentId, ActionType.BID, action.nonce, storage)

  // Validate bid amount
  const amount = BigInt(action.amount)
  if (amount <= 0n) {
    throw new Error(`Bid amount must be greater than 0, got ${action.amount}`)
  }
  if (amount <= BigInt(highestBid)) {
    throw new Error(
      `Bid amount ${action.amount} must exceed current highest bid ${highestBid}`,
    )
  }

  return {
    type: action.type,
    agentId: action.agentId,
    wallet: action.wallet,
    amount: action.amount,
    nonce: action.nonce,
    signature: action.signature,
    proof: action.proof,
  }
}

/**
 * Handle DELIVER action: verify signature, check nonce sequential.
 */
export async function handleDeliver(
  action: ActionRequest,
  storage: DurableObjectStorage,
  auctionId: string,
): Promise<ValidatedAction> {
  verifySignature(action)

  // Check nonce
  await checkNonce(action.agentId, ActionType.DELIVER, action.nonce, storage)

  return {
    type: action.type,
    agentId: action.agentId,
    wallet: action.wallet,
    amount: action.amount,
    nonce: action.nonce,
    signature: action.signature,
    proof: action.proof,
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
): Promise<ValidatedAction> {
  switch (action.type) {
    case ActionType.JOIN:
      return handleJoin(action, storage, auctionId)
    case ActionType.BID:
      return handleBid(action, storage, auctionId, highestBid)
    case ActionType.DELIVER:
      return handleDeliver(action, storage, auctionId)
    default:
      throw new Error(`Unsupported action type: ${action.type}`)
  }
}
