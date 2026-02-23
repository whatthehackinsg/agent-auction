import { ActionType, type AuctionEvent } from '../types/engine'
import { sha256, toBytes } from 'viem'

const MAX_U64 = (1n << 64n) - 1n

function normalizeUint(value: string | number, field: string): string {
  const n = BigInt(value)
  if (n < 0n) {
    throw new Error(`${field} must be non-negative`)
  }
  return n.toString(10)
}

function normalizeFixedHex(input: string, bytes: number, field: string): `0x${string}` {
  let hex = input.trim().toLowerCase()
  if (hex.startsWith('0x')) {
    hex = hex.slice(2)
  }
  if (hex.length === 0) {
    throw new Error(`${field} must be non-empty hex`)
  }
  if (!/^[0-9a-f]+$/.test(hex)) {
    throw new Error(`${field} must be hex`) 
  }
  const targetLen = bytes * 2
  if (hex.length > targetLen) {
    throw new Error(`${field} exceeds ${bytes} bytes`)
  }
  return `0x${hex.padStart(targetLen, '0')}`
}

function normalizeActionType(type: ActionType): 'JOIN' | 'BID' {
  if (type === ActionType.JOIN) return 'JOIN'
  if (type === ActionType.BID) return 'BID'
  throw new Error(`unsupported action type for ReplayBundleV1: ${type}`)
}

export function serializeReplayBundle(auctionId: string, events: AuctionEvent[]): Uint8Array {
  const canonicalAuctionId = normalizeFixedHex(auctionId, 32, 'auction_id')
  const sorted = [...events].sort((a, b) => a.seq - b.seq)

  const lines: string[] = ['schema:v1', `auction_id:${canonicalAuctionId}`]

  for (let i = 0; i < sorted.length; i++) {
    const e = sorted[i]
    const seq = BigInt(e.seq)
    if (seq <= 0n || seq > MAX_U64) {
      throw new Error(`seq out of u64 range: ${e.seq}`)
    }

    const expectedSeq = BigInt(i + 1)
    if (seq !== expectedSeq) {
      throw new Error(`events must be contiguous and start at seq=1 (got seq=${e.seq}, expected ${expectedSeq})`)
    }

    const type = normalizeActionType(e.actionType)
    const agentId = normalizeUint(e.agentId, 'agent_id')
    const amount = normalizeUint(e.amount, 'amount')
    const wallet = normalizeFixedHex(e.wallet, 20, 'wallet')
    const prevHash = normalizeFixedHex(e.prevHash, 32, 'prev_hash')
    const eventHash = normalizeFixedHex(e.eventHash, 32, 'event_hash')
    const payloadHash = normalizeFixedHex(e.payloadHash, 32, 'payload_hash')

    lines.push(
      `event:seq=${seq.toString(10)}|type=${type}|agent_id=${agentId}|wallet=${wallet}|amount=${amount}|prev_hash=${prevHash}|event_hash=${eventHash}|payload_hash=${payloadHash}`,
    )
  }

  // Canonical bytes: UTF-8, LF separators, no trailing newline.
  return new TextEncoder().encode(lines.join('\n'))
}

export function computeContentHash(bundleBytes: Uint8Array): Uint8Array {
  return toBytes(sha256(bundleBytes))
}
