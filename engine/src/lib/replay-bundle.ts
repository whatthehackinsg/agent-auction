/**
 * Replay bundle serialization for the auction engine.
 * Delegates to @agent-auction/crypto for canonical serialization.
 */
import {
  serializeReplayBundle as _serializeReplayBundle,
  computeContentHashBytes,
  type AuctionEvent as CryptoAuctionEvent,
} from '@agent-auction/crypto'
import { type AuctionEvent } from '../types/engine'

/**
 * Serialize an auction's event log into ReplayBundleV1 canonical bytes.
 * Adapts engine's AuctionEvent (seq: number) to crypto's (seq: bigint).
 */
export function serializeReplayBundle(auctionId: string, events: AuctionEvent[]): Uint8Array {
  const adapted: CryptoAuctionEvent[] = events.map((e) => ({
    seq: BigInt(e.seq),
    actionType: e.actionType as string,
    agentId: BigInt(e.agentId),
    wallet: e.wallet,
    amount: BigInt(e.amount),
    prevHash: e.prevHash,
    eventHash: e.eventHash,
    payloadHash: e.payloadHash,
  }))
  return _serializeReplayBundle(auctionId, adapted)
}

/**
 * Compute SHA-256 content hash of replay bundle bytes.
 * Returns Uint8Array (engine convention).
 */
export function computeContentHash(bundleBytes: Uint8Array): Uint8Array {
  return computeContentHashBytes(bundleBytes)
}
