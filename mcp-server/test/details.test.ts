/**
 * Tests for get_auction_details tool.
 *
 * Covers: full detail response, 404 handling, generic engine errors.
 */

import { describe, it, expect } from 'vitest'
import { makeCapturingMcpServer, makeMockEngine, parseToolResponse, TEST_AUCTION_ID } from './helpers.js'
import { registerDetailsTool } from '../src/tools/details.js'

// ── Fixtures ──────────────────────────────────────────────────────────────────

const now = Math.floor(Date.now() / 1000)

function makeDetailResponse(overrides?: { auction?: Record<string, unknown>; snapshot?: Record<string, unknown>; nftEscrowState?: string | null }) {
  return {
    auction: {
      auction_id: TEST_AUCTION_ID,
      title: 'Premium NFT Auction',
      description: 'A rare collectible',
      status: 1,
      reserve_price: '100000000',
      deposit_amount: '50000000',
      deadline: now + 3600,
      auction_type: 'english',
      max_bid: null,
      created_at: now - 600,
      item_image_cid: null,
      nft_contract: '0xNFT',
      nft_token_id: '42',
      nft_chain_id: 84532,
      nft_name: 'Rare Ape #42',
      nft_description: 'A very rare ape',
      nft_image_url: 'https://example.com/ape.png',
      nft_token_uri: 'https://example.com/metadata/42',
      ...overrides?.auction,
    },
    snapshot: {
      auctionId: TEST_AUCTION_ID,
      currentSeq: 5,
      headHash: '0xdeadbeef',
      participantCount: 3,
      highestBid: '150000000',
      highestBidder: 'Agent ****42',
      startedAt: now - 600,
      deadline: now + 3600,
      status: 1,
      serverNow: now,
      timeRemainingSec: 3600,
      snipeWindowSec: 60,
      extensionSec: 120,
      maxExtensions: 5,
      extensionCount: 0,
      terminalType: 'OPEN',
      winnerAgentId: '',
      winnerWallet: '',
      winningBidAmount: '0',
      bidCount: 12,
      uniqueBidders: 3,
      lastActivitySec: 30,
      competitionLevel: 'high',
      priceIncreasePct: 50,
      snipeWindowActive: false,
      extensionsRemaining: 5,
      ...overrides?.snapshot,
    },
    nftEscrowState: overrides?.nftEscrowState ?? null,
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('get_auction_details', () => {
  it('returns full auction details with snapshot', async () => {
    const { mockServer, getHandler } = makeCapturingMcpServer()
    const { mockEngine } = makeMockEngine({
      getImpl: async () => makeDetailResponse(),
    })

    registerDetailsTool(mockServer, mockEngine)
    const handler = getHandler()

    const result = await handler({ auctionId: TEST_AUCTION_ID })
    const body = parseToolResponse(result)

    // Basic auction fields
    expect(body.auctionId).toBe(TEST_AUCTION_ID)
    expect(body.title).toBe('Premium NFT Auction')
    expect(body.status).toBe('OPEN')
    expect(body.auctionType).toBe('english')
    expect(body.reservePrice).toBe('100000000')

    // Item / NFT fields
    const item = body.item as Record<string, unknown>
    expect(item.nftContract).toBe('0xNFT')
    expect(item.nftTokenId).toBe('42')
    expect(item.nftName).toBe('Rare Ape #42')
    expect(item.nftDescription).toBe('A very rare ape')

    // Snapshot fields
    const snapshot = body.snapshot as Record<string, unknown>
    expect(snapshot.participantCount).toBe(3)
    expect(snapshot.highestBid).toBe('150000000')
    expect(snapshot.highestBidder).toBe('Agent ****42')
    expect(snapshot.bidCount).toBe(12)
    expect(snapshot.competitionLevel).toBe('high')
    expect(snapshot.extensionsRemaining).toBe(5)
  })

  it('returns AUCTION_NOT_FOUND on 404', async () => {
    const { mockServer, getHandler } = makeCapturingMcpServer()
    const { mockEngine } = makeMockEngine({
      getImpl: async () => {
        throw new Error('Engine GET /auctions/0x99 failed (404): Not found')
      },
    })

    registerDetailsTool(mockServer, mockEngine)
    const handler = getHandler()

    const result = await handler({ auctionId: '0x99' })
    const body = parseToolResponse(result)

    expect(body.success).toBe(false)
    const error = body.error as { code: string; detail: string; suggestion: string }
    expect(error.code).toBe('AUCTION_NOT_FOUND')
    expect(error.detail).toContain('404')
    expect(error.suggestion).toContain('auction ID')
  })

  it('returns ENGINE_ERROR on other errors', async () => {
    const { mockServer, getHandler } = makeCapturingMcpServer()
    const { mockEngine } = makeMockEngine({
      getImpl: async () => {
        throw new Error('Network timeout')
      },
    })

    registerDetailsTool(mockServer, mockEngine)
    const handler = getHandler()

    const result = await handler({ auctionId: TEST_AUCTION_ID })
    const body = parseToolResponse(result)

    expect(body.success).toBe(false)
    const error = body.error as { code: string }
    expect(error.code).toBe('ENGINE_ERROR')
  })
})
