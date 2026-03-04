/**
 * Tests for discover_auctions tool.
 *
 * Covers: listing, status filtering, NFT filtering, empty results, engine errors.
 */

import { describe, it, expect } from 'vitest'
import { makeCapturingMcpServer, makeMockEngine, parseToolResponse } from './helpers.js'
import { registerDiscoverTool } from '../src/tools/discover.js'

// ── Fixtures ──────────────────────────────────────────────────────────────────

const now = Math.floor(Date.now() / 1000)

function makeAuctionRow(overrides: Record<string, unknown> = {}) {
  return {
    auction_id: '0x' + '00'.repeat(31) + '01',
    title: 'Test Auction',
    description: 'A test auction',
    status: 1,
    reserve_price: '100000000',
    deposit_amount: '50000000',
    deadline: now + 3600,
    auction_type: 'english',
    max_bid: null,
    created_at: now - 600,
    item_image_cid: null,
    nft_contract: null,
    nft_token_id: null,
    nft_chain_id: null,
    nft_name: null,
    nft_description: null,
    nft_image_url: null,
    nft_token_uri: null,
    ...overrides,
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('discover_auctions', () => {
  it('returns all auctions with status labels', async () => {
    const { mockServer, getHandler } = makeCapturingMcpServer()
    const { mockEngine } = makeMockEngine({
      getImpl: async () => ({
        auctions: [
          makeAuctionRow({ auction_id: '0x01', status: 1 }),
          makeAuctionRow({ auction_id: '0x02', status: 2 }),
        ],
      }),
    })

    registerDiscoverTool(mockServer, mockEngine)
    const handler = getHandler()

    const result = await handler({})
    const body = parseToolResponse(result)

    expect(body.count).toBe(2)
    const auctions = body.auctions as Array<{ auctionId: string; status: string }>
    expect(auctions[0].status).toBe('OPEN')
    expect(auctions[1].status).toBe('CLOSED')
  })

  it('filters by status', async () => {
    const { mockServer, getHandler } = makeCapturingMcpServer()
    const { mockEngine } = makeMockEngine({
      getImpl: async () => ({
        auctions: [
          makeAuctionRow({ auction_id: '0x01', status: 1 }),
          makeAuctionRow({ auction_id: '0x02', status: 2 }),
          makeAuctionRow({ auction_id: '0x03', status: 1 }),
        ],
      }),
    })

    registerDiscoverTool(mockServer, mockEngine)
    const handler = getHandler()

    const result = await handler({ statusFilter: 'OPEN' })
    const body = parseToolResponse(result)

    expect(body.count).toBe(2)
    const auctions = body.auctions as Array<{ status: string }>
    for (const a of auctions) {
      expect(a.status).toBe('OPEN')
    }
  })

  it('filters by NFT presence', async () => {
    const { mockServer, getHandler } = makeCapturingMcpServer()
    const { mockEngine } = makeMockEngine({
      getImpl: async () => ({
        auctions: [
          makeAuctionRow({
            auction_id: '0x01',
            nft_contract: '0xNFT',
            nft_token_id: '42',
            nft_name: 'Cool NFT',
          }),
          makeAuctionRow({ auction_id: '0x02' }),
        ],
      }),
    })

    registerDiscoverTool(mockServer, mockEngine)
    const handler = getHandler()

    const result = await handler({ hasNft: true })
    const body = parseToolResponse(result)

    expect(body.count).toBe(1)
    const auctions = body.auctions as Array<{ hasNft: boolean }>
    expect(auctions[0].hasNft).toBe(true)
  })

  it('returns empty list gracefully', async () => {
    const { mockServer, getHandler } = makeCapturingMcpServer()
    const { mockEngine } = makeMockEngine({
      getImpl: async () => ({ auctions: [] }),
    })

    registerDiscoverTool(mockServer, mockEngine)
    const handler = getHandler()

    const result = await handler({})
    const body = parseToolResponse(result)

    expect(body.count).toBe(0)
    expect(body.auctions).toEqual([])
  })

  it('returns ENGINE_ERROR on engine failure', async () => {
    const { mockServer, getHandler } = makeCapturingMcpServer()
    const { mockEngine } = makeMockEngine({
      getImpl: async () => {
        throw new Error('Connection refused')
      },
    })

    registerDiscoverTool(mockServer, mockEngine)
    const handler = getHandler()

    const result = await handler({})
    const body = parseToolResponse(result)

    expect(body.success).toBe(false)
    const error = body.error as { code: string; detail: string; suggestion: string }
    expect(error.code).toBe('ENGINE_ERROR')
    expect(error.detail).toContain('Connection refused')
    expect(error.suggestion).toBeTruthy()
  })
})
