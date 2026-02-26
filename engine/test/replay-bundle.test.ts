import { describe, it, expect } from 'vitest'
import { ActionType, type AuctionEvent } from '../src/types/engine'
import { computeContentHash, serializeReplayBundle } from '../src/lib/replay-bundle'
import { toHex } from 'viem'

describe('ReplayBundleV1 serialization', () => {
  it('matches canonical format and known SHA-256 vector A', async () => {
    const events: AuctionEvent[] = [
      {
        seq: 1,
        actionType: ActionType.JOIN,
        agentId: '101',
        wallet: '0x1111111111111111111111111111111111111111',
        amount: '0',
        prevHash: '0x' + '00'.repeat(32),
        eventHash: '0x' + '22'.repeat(32),
        payloadHash: '0x' + '33'.repeat(32),
        createdAt: 0,
      },
    ]

    const bytes = serializeReplayBundle('0x' + 'aa'.repeat(32), events)
    const text = new TextDecoder().decode(bytes)

    expect(text).toBe(
      [
        'schema:v1',
        'auction_id:0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        'event:seq=1|type=JOIN|agent_id=101|wallet=0x1111111111111111111111111111111111111111|amount=0|prev_hash=0x0000000000000000000000000000000000000000000000000000000000000000|event_hash=0x2222222222222222222222222222222222222222222222222222222222222222|payload_hash=0x3333333333333333333333333333333333333333333333333333333333333333',
      ].join('\n'),
    )

    const hash = await computeContentHash(bytes)
    expect(toHex(hash)).toBe('0xab8971d7ea24703e893bde6d94080df82dd1906e43fae580f5857ee8d93a62df')
  })

  it('is deterministic for same events regardless of input order', () => {
    const e1: AuctionEvent = {
      seq: 1,
      actionType: ActionType.JOIN,
      agentId: '1',
      wallet: '0x' + '11'.repeat(20),
      amount: '0',
      prevHash: '0x' + '00'.repeat(32),
      eventHash: '0x' + '22'.repeat(32),
      payloadHash: '0x' + '33'.repeat(32),
      createdAt: 0,
    }
    const e2: AuctionEvent = {
      seq: 2,
      actionType: ActionType.BID,
      agentId: '1',
      wallet: '0x' + '11'.repeat(20),
      amount: '5',
      prevHash: '0x' + '22'.repeat(32),
      eventHash: '0x' + '44'.repeat(32),
      payloadHash: '0x' + '55'.repeat(32),
      createdAt: 0,
    }

    const a = serializeReplayBundle('0x' + 'aa'.repeat(32), [e1, e2])
    const b = serializeReplayBundle('0x' + 'aa'.repeat(32), [e2, e1])
    expect(new TextDecoder().decode(a)).toBe(new TextDecoder().decode(b))
  })

  it('rejects non-contiguous seq values', () => {
    const events: AuctionEvent[] = [
      {
        seq: 1,
        actionType: ActionType.JOIN,
        agentId: '1',
        wallet: '0x' + '11'.repeat(20),
        amount: '0',
        prevHash: '0x' + '00'.repeat(32),
        eventHash: '0x' + '22'.repeat(32),
        payloadHash: '0x' + '33'.repeat(32),
        createdAt: 0,
      },
      {
        seq: 3,
        actionType: ActionType.BID,
        agentId: '2',
        wallet: '0x' + '22'.repeat(20),
        amount: '9',
        prevHash: '0x' + '22'.repeat(32),
        eventHash: '0x' + '44'.repeat(32),
        payloadHash: '0x' + '55'.repeat(32),
        createdAt: 0,
      },
    ]

    expect(() => serializeReplayBundle('0x' + 'aa'.repeat(32), events)).toThrow('contiguous')
  })
})
