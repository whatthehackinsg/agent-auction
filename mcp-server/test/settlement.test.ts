/**
 * Tests for check_settlement_status tool.
 *
 * Covers: OPEN auction, SETTLED auction, 404, generic engine error.
 */

import { describe, it, expect } from 'vitest'
import { makeCapturingMcpServer, makeMockEngine, parseToolResponse, TEST_AUCTION_ID } from './helpers.js'
import { registerSettlementTool } from '../src/tools/settlement.js'

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeSettlementResponse(status: number, winner?: { agentId: string; wallet: string; amount: string }) {
  return {
    auction: {
      auction_id: TEST_AUCTION_ID,
      status,
    },
    snapshot: {
      status,
      winnerAgentId: winner?.agentId ?? '',
      winnerWallet: winner?.wallet ?? '',
      winningBidAmount: winner?.amount ?? '0',
    },
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('check_settlement_status', () => {
  it('returns settlement view for OPEN auction', async () => {
    const { mockServer, getHandler } = makeCapturingMcpServer()
    const { mockEngine } = makeMockEngine({
      getImpl: async () => makeSettlementResponse(1),
    })

    registerSettlementTool(mockServer, mockEngine)
    const handler = getHandler()

    const result = await handler({ auctionId: TEST_AUCTION_ID })
    const body = parseToolResponse(result)

    expect(body.success).toBe(true)
    expect(body.status).toBe('OPEN')
    expect(body.isSettled).toBe(false)
    expect(body.winnerAgentId).toBeNull()
    expect(body.suggestion).toContain('still open')
  })

  it('returns settlement view for SETTLED auction', async () => {
    const { mockServer, getHandler } = makeCapturingMcpServer()
    const { mockEngine } = makeMockEngine({
      getImpl: async () =>
        makeSettlementResponse(3, {
          agentId: '7',
          wallet: '0xWinnerAddr',
          amount: '200000000',
        }),
    })

    registerSettlementTool(mockServer, mockEngine)
    const handler = getHandler()

    const result = await handler({ auctionId: TEST_AUCTION_ID })
    const body = parseToolResponse(result)

    expect(body.success).toBe(true)
    expect(body.status).toBe('SETTLED')
    expect(body.isSettled).toBe(true)
    expect(body.winnerAgentId).toBe('7')
    expect(body.winnerWallet).toBe('0xWinnerAddr')
    expect(body.winningBidAmount).toBe('200000000')
    expect(body.suggestion).toContain('Settlement complete')
  })

  it('returns AUCTION_NOT_FOUND on missing auction', async () => {
    const { mockServer, getHandler } = makeCapturingMcpServer()
    const { mockEngine } = makeMockEngine({
      getImpl: async () => {
        throw new Error('Engine GET /auctions/0x99 failed (404): Not found')
      },
    })

    registerSettlementTool(mockServer, mockEngine)
    const handler = getHandler()

    const result = await handler({ auctionId: '0x99' })
    const body = parseToolResponse(result)

    expect(body.success).toBe(false)
    const error = body.error as { code: string }
    expect(error.code).toBe('AUCTION_NOT_FOUND')
  })

  it('returns ENGINE_ERROR on generic failure', async () => {
    const { mockServer, getHandler } = makeCapturingMcpServer()
    const { mockEngine } = makeMockEngine({
      getImpl: async () => {
        throw new Error('ECONNREFUSED')
      },
    })

    registerSettlementTool(mockServer, mockEngine)
    const handler = getHandler()

    const result = await handler({ auctionId: TEST_AUCTION_ID })
    const body = parseToolResponse(result)

    expect(body.success).toBe(false)
    const error = body.error as { code: string; detail: string }
    expect(error.code).toBe('ENGINE_ERROR')
    expect(error.detail).toContain('ECONNREFUSED')
  })
})
