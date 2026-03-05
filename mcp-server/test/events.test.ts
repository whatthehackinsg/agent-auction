/**
 * Tests for get_auction_events tool.
 *
 * Covers: event log retrieval, participant token passing, limit, 403 error,
 * privacy-masked responses (zkNullifier instead of agentId, no wallet).
 */

import { describe, it, expect } from 'vitest'
import { makeCapturingMcpServer, makeMockEngine, parseToolResponse, TEST_AUCTION_ID } from './helpers.js'
import { registerEventsTool } from '../src/tools/events.js'

// ── Fixtures ──────────────────────────────────────────────────────────────────

const now = Math.floor(Date.now() / 1000)

function makeEvent(seq: number, overrides: Record<string, unknown> = {}) {
  return {
    seq,
    auction_id: TEST_AUCTION_ID,
    action_type: seq === 1 ? 'JOIN' : 'BID',
    agent_id: '0xabc123',  // After privacy masking, agent_id contains zkNullifier
    // wallet intentionally omitted — privacy-masked responses don't include it
    amount: seq === 1 ? '50000000' : String(100_000_000 + seq * 10_000_000),
    event_hash: `0x${seq.toString(16).padStart(64, '0')}`,
    prev_hash: seq === 1 ? '0x' + '00'.repeat(32) : `0x${(seq - 1).toString(16).padStart(64, '0')}`,
    payload_hash: `0xpayload${seq}`,
    created_at: now - (10 - seq) * 60,
    ...overrides,
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('get_auction_events', () => {
  it('returns event log with zkNullifier field', async () => {
    const { mockServer, getHandler } = makeCapturingMcpServer()
    const { mockEngine } = makeMockEngine({
      getImpl: async () => ({
        events: [makeEvent(1), makeEvent(2), makeEvent(3)],
      }),
    })

    registerEventsTool(mockServer, mockEngine)
    const handler = getHandler()

    const result = await handler({ auctionId: TEST_AUCTION_ID, agentId: '1' })
    const body = parseToolResponse(result)

    expect(body.count).toBe(3)
    const events = body.events as Array<{ seq: number; actionType: string; zkNullifier: string; amount: string }>
    expect(events[0].seq).toBe(1)
    expect(events[0].actionType).toBe('JOIN')
    expect(events[0].zkNullifier).toBe('0xabc123')
    expect(events[1].actionType).toBe('BID')
    expect(events[2].seq).toBe(3)
  })

  it('maps agent_id field as zkNullifier (not agentId) in output', async () => {
    const { mockServer, getHandler } = makeCapturingMcpServer()
    const { mockEngine } = makeMockEngine({
      getImpl: async () => ({
        events: [makeEvent(1, { agent_id: '0xnullifier789' })],
      }),
    })

    registerEventsTool(mockServer, mockEngine)
    const handler = getHandler()

    const result = await handler({ auctionId: TEST_AUCTION_ID, agentId: '1' })
    const body = parseToolResponse(result)

    const events = body.events as Array<Record<string, unknown>>
    expect(events[0].zkNullifier).toBe('0xnullifier789')
    // agentId should NOT be present in the output
    expect(events[0]).not.toHaveProperty('agentId')
  })

  it('does not include wallet field in mapped event output', async () => {
    const { mockServer, getHandler } = makeCapturingMcpServer()
    const { mockEngine } = makeMockEngine({
      getImpl: async () => ({
        // Even if engine somehow returns wallet, it should not be mapped through
        events: [makeEvent(1, { wallet: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' })],
      }),
    })

    registerEventsTool(mockServer, mockEngine)
    const handler = getHandler()

    const result = await handler({ auctionId: TEST_AUCTION_ID, agentId: '1' })
    const body = parseToolResponse(result)

    const events = body.events as Array<Record<string, unknown>>
    expect(events[0]).not.toHaveProperty('wallet')
  })

  it('uses agentId as participantToken in engine GET URL', async () => {
    const { mockServer, getHandler } = makeCapturingMcpServer()
    const { mockEngine, capturedGetPaths } = makeMockEngine({
      getImpl: async () => ({ events: [] }),
    })

    registerEventsTool(mockServer, mockEngine)
    const handler = getHandler()

    await handler({ auctionId: TEST_AUCTION_ID, agentId: '1' })

    expect(capturedGetPaths).toHaveLength(1)
    expect(capturedGetPaths[0]).toContain('participantToken=1')
  })

  it('applies limit to events', async () => {
    const { mockServer, getHandler } = makeCapturingMcpServer()
    const { mockEngine } = makeMockEngine({
      getImpl: async () => ({
        events: [makeEvent(1), makeEvent(2), makeEvent(3), makeEvent(4), makeEvent(5)],
      }),
    })

    registerEventsTool(mockServer, mockEngine)
    const handler = getHandler()

    const result = await handler({ auctionId: TEST_AUCTION_ID, agentId: '1', limit: 2 })
    const body = parseToolResponse(result)

    expect(body.count).toBe(2)
    // Should return the last 2 events (seq 4 and 5)
    const events = body.events as Array<{ seq: number }>
    expect(events[0].seq).toBe(4)
    expect(events[1].seq).toBe(5)
  })

  it('returns PARTICIPANT_REQUIRED on 403', async () => {
    const { mockServer, getHandler } = makeCapturingMcpServer()
    const { mockEngine } = makeMockEngine({
      getImpl: async () => {
        throw new Error('Engine GET failed (403): Not a participant')
      },
    })

    registerEventsTool(mockServer, mockEngine)
    const handler = getHandler()

    const result = await handler({ auctionId: TEST_AUCTION_ID, agentId: '99' })
    const body = parseToolResponse(result)

    expect(body.success).toBe(false)
    const error = body.error as { code: string; suggestion: string }
    expect(error.code).toBe('PARTICIPANT_REQUIRED')
    expect(error.suggestion).toContain('join')
  })
})
