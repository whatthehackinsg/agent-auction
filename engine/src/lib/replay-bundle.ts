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
  // Sort by seq and validate contiguity before serialization
  const sorted = [...events].sort((a, b) => a.seq - b.seq)
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].seq !== sorted[i - 1].seq + 1) {
      throw new Error(`Events must have contiguous seq values: gap between ${sorted[i - 1].seq} and ${sorted[i].seq}`)
    }
  }

  const adapted: CryptoAuctionEvent[] = sorted.map((e) => ({
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
