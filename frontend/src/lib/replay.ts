import { poseidon3 } from 'poseidon-lite'
import { toBytes, toHex } from 'viem'

const F_MODULUS = BigInt('21888242871839275222246405745257275088548364400416034343698204186575808495617')

export interface ReplayEvent {
  seq: number
  type: 'JOIN' | 'BID'
  agentId: string
  wallet: string
  amount: string
  prevHash: `0x${string}`
  eventHash: `0x${string}`
  payloadHash: `0x${string}`
}

export interface ReplayBundle {
  schema: 'v1'
  auctionId: `0x${string}`
  events: ReplayEvent[]
}

export function parseReplayBundle(text: string): ReplayBundle {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  if (lines[0] !== 'schema:v1') {
    throw new Error('invalid replay schema')
  }

  const auctionLine = lines.find((line) => line.startsWith('auction_id:'))
  if (!auctionLine) {
    throw new Error('missing auction_id line')
  }

  const auctionId = auctionLine.slice('auction_id:'.length) as `0x${string}`
  const eventLines = lines.filter((line) => line.startsWith('event:'))

  const events: ReplayEvent[] = eventLines.map((line) => {
    const payload = line.slice('event:'.length)
    const fields = payload.split('|')
    const data = new Map<string, string>()
    for (const field of fields) {
      const [k, v] = field.split('=')
      if (!k || v === undefined) continue
      data.set(k, v)
    }

    return {
      seq: Number(data.get('seq') ?? 0),
      type: (data.get('type') ?? 'JOIN') as 'JOIN' | 'BID',
      agentId: data.get('agent_id') ?? '0',
      wallet: data.get('wallet') ?? ('0x' + '00'.repeat(20)),
      amount: data.get('amount') ?? '0',
      prevHash: (data.get('prev_hash') ?? ('0x' + '00'.repeat(32))) as `0x${string}`,
      eventHash: (data.get('event_hash') ?? ('0x' + '00'.repeat(32))) as `0x${string}`,
      payloadHash: (data.get('payload_hash') ?? ('0x' + '00'.repeat(32))) as `0x${string}`,
    }
  })

  return {
    schema: 'v1',
    auctionId,
    events: events.sort((a, b) => a.seq - b.seq),
  }
}

export function computeReplayEventHash(
  seq: number,
  prevHash: `0x${string}`,
  payloadHash: `0x${string}`,
): `0x${string}` {
  const hash = poseidon3([
    toFr(BigInt(seq)),
    bytesToFr(toBytes(prevHash)),
    bytesToFr(toBytes(payloadHash)),
  ])

  return toHex(frToBytes(toFr(hash)))
}

function toFr(x: bigint): bigint {
  return ((x % F_MODULUS) + F_MODULUS) % F_MODULUS
}

function bytesToFr(bytes: Uint8Array): bigint {
  let value = BigInt(0)
  for (const byte of bytes) {
    value = (value << BigInt(8)) | BigInt(byte)
  }
  return toFr(value)
}

function frToBytes(value: bigint): Uint8Array {
  const hex = value.toString(16).padStart(64, '0')
  return new Uint8Array(hex.match(/.{2}/g)!.map((part) => Number.parseInt(part, 16)))
}
