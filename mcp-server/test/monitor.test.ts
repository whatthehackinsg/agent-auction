/**
 * Tests for monitor_auction tool.
 *
 * Covers: REST polling, self-recognition via nullifier match,
 * graceful degradation without agent state, sinceSeq filtering,
 * missing config error.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  makeCapturingMcpServer,
  makeMockEngine,
  makeConfig,
  parseToolResponse,
  TEST_AUCTION_ID,
  TEST_AGENT_ID,
} from './helpers.js'

// ── Mock @agent-auction/crypto ───────────────────────────────────────────────

// Deterministic nullifier values for testing
const MOCK_JOIN_NULLIFIER = BigInt('0xabc123')
const MOCK_BID_NULLIFIER = BigInt('0xdef456')

vi.mock('@agent-auction/crypto', () => ({
  deriveNullifierBigInt: vi.fn().mockImplementation(
    async (_secret: bigint, _auctionId: bigint, actionType: number) => {
      if (actionType === 1) return MOCK_JOIN_NULLIFIER // JOIN
      if (actionType === 2) return MOCK_BID_NULLIFIER  // BID
      return BigInt('0x999')
    },
  ),
  ActionType: { JOIN: 1, BID: 2, REVEAL: 3 },
}))

// ── Mock proof-generator ─────────────────────────────────────────────────────

vi.mock('../src/lib/proof-generator.js', () => ({
  loadAgentState: vi.fn().mockReturnValue({
    agentId: BigInt(1),
    agentSecret: BigInt('0x1234567890'),
    capabilities: [{ capabilityId: BigInt(1) }],
    leafHashes: [BigInt(1)],
    capabilityMerkleRoot: BigInt(1),
  }),
}))

// ── Lazy import (after mocks) ────────────────────────────────────────────────

const { registerMonitorTool } = await import('../src/tools/monitor.js')

// ── Fixtures ─────────────────────────────────────────────────────────────────

const now = Math.floor(Date.now() / 1000)

const JOIN_NULLIFIER_HEX = '0x' + MOCK_JOIN_NULLIFIER.toString(16)
const BID_NULLIFIER_HEX = '0x' + MOCK_BID_NULLIFIER.toString(16)

function makeSnapshot(overrides: Record<string, unknown> = {}) {
  return {
    auctionId: TEST_AUCTION_ID,
    status: 'OPEN',
    highestBid: '150000000',
    highestBidder: BID_NULLIFIER_HEX,
    currentSeq: 4,
    bidCount: 3,
    uniqueBidders: 2,
    ...overrides,
  }
}

function makeEvent(seq: number, overrides: Record<string, unknown> = {}) {
  return {
    seq,
    action_type: seq === 1 ? 'JOIN' : 'BID',
    agent_id: seq === 1 ? JOIN_NULLIFIER_HEX : '0xother999',
    amount: seq === 1 ? '50000000' : String(100_000_000 + seq * 10_000_000),
    event_hash: `0x${seq.toString(16).padStart(64, '0')}`,
    prev_hash: seq === 1 ? '0x' + '00'.repeat(32) : `0x${(seq - 1).toString(16).padStart(64, '0')}`,
    payload_hash: `0xpayload${seq}`,
    created_at: now - (10 - seq) * 60,
    ...overrides,
  }
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('monitor_auction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns snapshot + recent events from REST endpoints', async () => {
    const { mockServer, getHandler } = makeCapturingMcpServer()
    const snapshot = makeSnapshot()
    const events = [makeEvent(1), makeEvent(2), makeEvent(3)]
    const { mockEngine, capturedGetPaths } = makeMockEngine({
      getImpl: async (path: string) => {
        if (path.includes('/snapshot')) return snapshot
        if (path.includes('/events')) return { events }
        return {}
      },
    })
    const config = makeConfig({ agentStateFile: '/tmp/agent-1.json' })

    registerMonitorTool(mockServer, mockEngine, config)
    const handler = getHandler()

    const result = await handler({ auctionId: TEST_AUCTION_ID })
    const body = parseToolResponse(result)

    expect(body.success).toBe(true)
    expect(body.auctionId).toBe(TEST_AUCTION_ID)
    expect(body.snapshot).toBeDefined()
    expect(body.eventCount).toBe(3)
    expect(body.latestSeq).toBe(4)

    // Verify participantToken is used in GET URLs
    expect(capturedGetPaths.some((p: string) => p.includes('participantToken='))).toBe(true)
  })

  it('annotates events matching agent nullifier with isOwn: true', async () => {
    const { mockServer, getHandler } = makeCapturingMcpServer()
    const snapshot = makeSnapshot()
    // Event 1: agent_id matches JOIN nullifier
    const events = [
      makeEvent(1, { agent_id: JOIN_NULLIFIER_HEX, action_type: 'JOIN' }),
      makeEvent(2, { agent_id: '0xother999', action_type: 'BID' }),
    ]
    const { mockEngine } = makeMockEngine({
      getImpl: async (path: string) => {
        if (path.includes('/snapshot')) return snapshot
        if (path.includes('/events')) return { events }
        return {}
      },
    })
    const config = makeConfig({ agentStateFile: '/tmp/agent-1.json' })

    registerMonitorTool(mockServer, mockEngine, config)
    const handler = getHandler()

    const result = await handler({ auctionId: TEST_AUCTION_ID })
    const body = parseToolResponse(result)

    const resultEvents = body.events as Array<{ isOwn: boolean; zkNullifier: string }>
    expect(resultEvents[0].isOwn).toBe(true)
    expect(resultEvents[0].zkNullifier).toBe(JOIN_NULLIFIER_HEX)
    expect(resultEvents[1].isOwn).toBe(false)
  })

  it('annotates non-matching events with isOwn: false', async () => {
    const { mockServer, getHandler } = makeCapturingMcpServer()
    const snapshot = makeSnapshot()
    const events = [
      makeEvent(1, { agent_id: '0xunknown111' }),
      makeEvent(2, { agent_id: '0xunknown222' }),
    ]
    const { mockEngine } = makeMockEngine({
      getImpl: async (path: string) => {
        if (path.includes('/snapshot')) return snapshot
        if (path.includes('/events')) return { events }
        return {}
      },
    })
    const config = makeConfig({ agentStateFile: '/tmp/agent-1.json' })

    registerMonitorTool(mockServer, mockEngine, config)
    const handler = getHandler()

    const result = await handler({ auctionId: TEST_AUCTION_ID })
    const body = parseToolResponse(result)

    const resultEvents = body.events as Array<{ isOwn: boolean }>
    expect(resultEvents[0].isOwn).toBe(false)
    expect(resultEvents[1].isOwn).toBe(false)
  })

  it('omits isOwn when AGENT_STATE_FILE is not configured', async () => {
    const { mockServer, getHandler } = makeCapturingMcpServer()
    const snapshot = makeSnapshot()
    const events = [makeEvent(1)]
    const { mockEngine } = makeMockEngine({
      getImpl: async (path: string) => {
        if (path.includes('/snapshot')) return snapshot
        if (path.includes('/events')) return { events }
        return {}
      },
    })
    // No agentStateFile
    const config = makeConfig({ agentStateFile: null })

    registerMonitorTool(mockServer, mockEngine, config)
    const handler = getHandler()

    const result = await handler({ auctionId: TEST_AUCTION_ID })
    const body = parseToolResponse(result)

    const resultEvents = body.events as Array<Record<string, unknown>>
    expect(resultEvents[0]).not.toHaveProperty('isOwn')
  })

  it('filters events by sinceSeq parameter', async () => {
    const { mockServer, getHandler } = makeCapturingMcpServer()
    const snapshot = makeSnapshot({ currentSeq: 5 })
    const events = [makeEvent(1), makeEvent(2), makeEvent(3), makeEvent(4), makeEvent(5)]
    const { mockEngine } = makeMockEngine({
      getImpl: async (path: string) => {
        if (path.includes('/snapshot')) return snapshot
        if (path.includes('/events')) return { events }
        return {}
      },
    })
    const config = makeConfig({ agentStateFile: '/tmp/agent-1.json' })

    registerMonitorTool(mockServer, mockEngine, config)
    const handler = getHandler()

    const result = await handler({ auctionId: TEST_AUCTION_ID, sinceSeq: 3 })
    const body = parseToolResponse(result)

    // Only events with seq > 3
    expect(body.eventCount).toBe(2)
    const resultEvents = body.events as Array<{ seq: number }>
    expect(resultEvents[0].seq).toBe(4)
    expect(resultEvents[1].seq).toBe(5)
    expect(body.sinceSeq).toBe(3)
  })

  it('returns MISSING_CONFIG when agentId is not configured', async () => {
    const { mockServer, getHandler } = makeCapturingMcpServer()
    const { mockEngine } = makeMockEngine()
    const config = makeConfig({ agentId: null })

    registerMonitorTool(mockServer, mockEngine, config)
    const handler = getHandler()

    const result = await handler({ auctionId: TEST_AUCTION_ID })
    const body = parseToolResponse(result)

    expect(body.success).toBe(false)
    const error = body.error as { code: string }
    expect(error.code).toBe('MISSING_CONFIG')
  })
})
