/**
 * Replay bundle re-export from @agent-auction/crypto.
 *
 * Previously inlined to avoid circomlibjs/ffjavascript (CF Workers incompatible).
 * Now safe to import directly — circomlibjs replaced by poseidon-lite (zero-dep).
 * SHA-256 uses Web Crypto API (universal: CF Workers + Node).
 */
import {
  serializeReplayBundle as sharedSerialize,
  computeContentHashBytes,
  type AuctionEvent as SharedAuctionEvent,
} from '@agent-auction/crypto/replay-bundle'
import { type AuctionEvent } from '../types/engine'

/**
 * Serialize engine AuctionEvents into ReplayBundleV1 canonical bytes.
 * Adapts engine's types (seq: number, agentId: string) to shared package types.
 * Validates contiguous seq values before serializing.
 */
export function serializeReplayBundle(auctionId: string, events: AuctionEvent[]): Uint8Array {
  // Validate contiguity (engine invariant)
  const sorted = [...events].sort((a, b) => a.seq - b.seq)
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].seq !== sorted[i - 1].seq + 1) {
      throw new Error(
        `Events must have contiguous seq values: gap between ${sorted[i - 1].seq} and ${sorted[i].seq}`,
      )
    }
  }

  const adapted: SharedAuctionEvent[] = sorted.map((e) => ({
    seq: BigInt(e.seq),
    actionType: e.actionType,
    agentId: BigInt(e.agentId),
    wallet: e.wallet,
    amount: BigInt(e.amount),
    prevHash: e.prevHash,
    eventHash: e.eventHash,
    payloadHash: e.payloadHash,
  }))
  return sharedSerialize(auctionId, adapted)
}

/**
 * Compute SHA-256 content hash of replay bundle bytes.
 * Returns Uint8Array (32 bytes).
 */
export async function computeContentHash(bundleBytes: Uint8Array): Promise<Uint8Array> {
  return computeContentHashBytes(bundleBytes)
}
