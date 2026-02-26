/**
 * Replay bundle serialization for the auction engine (CF Workers compatible).
 *
 * Inlines the canonical ReplayBundleV1 format from @agent-auction/crypto
 * to avoid importing circomlibjs/ffjavascript which are incompatible with CF Workers.
 * Uses Web Crypto API for SHA-256 instead of Node's crypto.createHash.
 */
import { type AuctionEvent } from '../types/engine'
import { toHex } from 'viem'

/** Action type tokens (uppercase, per spec) */
const TOKEN_MAP: Record<string, string> = {
  JOIN: 'JOIN',
  BID: 'BID',
  DELIVER: 'DELIVER',
  CLOSE: 'CLOSE',
  CANCEL: 'CANCEL',
  WITHDRAW: 'WITHDRAW',
}

/** Format a bigint as base-10 ASCII */
function fmtU256(val: bigint): string {
  return val.toString(10)
}

/** Ensure hex is lowercase, 0x-prefixed, and exactly the expected width */
function fmtHex(val: string, hexChars: number): string {
  const stripped = val.startsWith('0x') ? val.slice(2) : val
  return '0x' + stripped.toLowerCase().padStart(hexChars, '0')
}

/**
 * Serialize an auction's event log into ReplayBundleV1 canonical bytes.
 * Adapts engine's AuctionEvent (seq: number) to the canonical format.
 */
export function serializeReplayBundle(auctionId: string, events: AuctionEvent[]): Uint8Array {
  const sorted = [...events].sort((a, b) => a.seq - b.seq)

  // Validate contiguity
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].seq !== sorted[i - 1].seq + 1) {
      throw new Error(`Events must have contiguous seq values: gap between ${sorted[i - 1].seq} and ${sorted[i].seq}`)
    }
  }

  const lines: string[] = []

  // Header
  lines.push('schema:v1')
  lines.push(`auction_id:${fmtHex(auctionId, 64)}`)

  // Events
  for (const e of sorted) {
    const token = TOKEN_MAP[e.actionType] ?? e.actionType
    const line = [
      `event:seq=${fmtU256(BigInt(e.seq))}`,
      `type=${token}`,
      `agent_id=${fmtU256(BigInt(e.agentId))}`,
      `wallet=${fmtHex(e.wallet, 40)}`,
      `amount=${fmtU256(BigInt(e.amount))}`,
      `prev_hash=${fmtHex(e.prevHash, 64)}`,
      `event_hash=${fmtHex(e.eventHash, 64)}`,
      `payload_hash=${fmtHex(e.payloadHash, 64)}`,
    ].join('|')
    lines.push(line)
  }

  const canonical = lines.join('\n')
  return new TextEncoder().encode(canonical)
}

/**
 * Compute SHA-256 content hash of replay bundle bytes using Web Crypto API.
 * Returns Uint8Array (32 bytes).
 */
export async function computeContentHash(bundleBytes: Uint8Array): Promise<Uint8Array> {
  const hash = await crypto.subtle.digest('SHA-256', bundleBytes)
  return new Uint8Array(hash)
}
