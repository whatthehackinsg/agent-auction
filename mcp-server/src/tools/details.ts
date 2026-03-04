/**
 * get_auction_details — Get full details for a specific auction.
 *
 * GET /auctions/:id -> returns D1 row + Durable Object room snapshot
 * including highest bid, time remaining, participant count, and aggregate stats.
 *
 * Note: The snapshot now returns masked bidder identity (e.g., "Agent ●●●●42")
 * and aggregate competition data instead of raw agent IDs.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { EngineClient } from '../lib/engine.js'
import { toolError } from '../lib/tool-response.js'

interface RoomSnapshot {
  auctionId: string
  currentSeq: number
  headHash: string
  participantCount: number
  highestBid: string
  highestBidder: string
  startedAt: number
  deadline: number
  status: number
  serverNow: number
  timeRemainingSec: number
  snipeWindowSec: number
  extensionSec: number
  maxExtensions: number
  extensionCount: number
  terminalType: string
  winnerAgentId: string
  winnerWallet: string
  winningBidAmount: string
  // Aggregate fields (new)
  bidCount?: number
  uniqueBidders?: number
  lastActivitySec?: number
  competitionLevel?: 'low' | 'medium' | 'high'
  priceIncreasePct?: number
  snipeWindowActive?: boolean
  extensionsRemaining?: number
}

interface AuctionRow {
  auction_id: string
  title: string | null
  description: string | null
  status: number
  reserve_price: string
  deposit_amount: string
  deadline: number
  auction_type: string
  max_bid: string | null
  created_at: number
  item_image_cid: string | null
  nft_contract: string | null
  nft_token_id: string | null
  nft_chain_id: number | null
  nft_name: string | null
  nft_description: string | null
  nft_image_url: string | null
  nft_token_uri: string | null
}

interface AuctionDetailResponse {
  auction: AuctionRow
  snapshot: RoomSnapshot
  nftEscrowState: string | null // 'NONE' | 'DEPOSITED' | 'CLAIMED' | 'RETURNED' | 'UNKNOWN' | null
}

const STATUS_LABELS: Record<number, string> = {
  1: 'OPEN',
  2: 'CLOSED',
  3: 'SETTLED',
  4: 'CANCELLED',
}

export function registerDetailsTool(server: McpServer, engine: EngineClient): void {
  server.registerTool(
    'get_auction_details',
    {
      title: 'Get Auction Details',
      description:
        'Get full details for a specific auction including current snapshot, highest bid (masked bidder), ' +
        'time remaining, participant count, competition level, NFT metadata (name, description, image), ' +
        'NFT escrow deposit status, and winner info if closed.',
      inputSchema: z.object({
        auctionId: z.string().describe('The 0x-prefixed bytes32 auction ID'),
      }),
    },
    async ({ auctionId }) => {
      let data: AuctionDetailResponse
      try {
        data = await engine.get<AuctionDetailResponse>(`/auctions/${auctionId}`)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        if (msg.includes('404') || msg.toLowerCase().includes('not found')) {
          return toolError(
            'AUCTION_NOT_FOUND',
            msg,
            'Verify the auction ID is correct (0x-prefixed bytes32)',
          )
        }
        return toolError('ENGINE_ERROR', msg, 'Check engine connectivity and try again')
      }

      const { auction, snapshot, nftEscrowState } = data
      const result = {
        auctionId: auction.auction_id,
        title: auction.title ?? '(untitled)',
        description: auction.description,
        status: STATUS_LABELS[auction.status] ?? `UNKNOWN(${auction.status})`,
        auctionType: auction.auction_type,
        reservePrice: auction.reserve_price,
        depositAmount: auction.deposit_amount,
        maxBid: auction.max_bid,
        deadline: auction.deadline,
        createdAt: auction.created_at,
        item: {
          imageCid: auction.item_image_cid,
          imageUrl: auction.item_image_cid
            ? `https://gateway.pinata.cloud/ipfs/${auction.item_image_cid}`
            : auction.nft_image_url ?? null,
          nftContract: auction.nft_contract,
          nftTokenId: auction.nft_token_id,
          nftChainId: auction.nft_chain_id,
          nftName: auction.nft_name ?? null,
          nftDescription: auction.nft_description ?? null,
          nftEscrowState: nftEscrowState,
        },
        snapshot: {
          participantCount: snapshot.participantCount,
          currentSeq: snapshot.currentSeq,
          highestBid: snapshot.highestBid,
          highestBidder: snapshot.highestBidder, // now masked by engine
          timeRemainingSec: snapshot.timeRemainingSec,
          serverNow: snapshot.serverNow,
          deadline: snapshot.deadline,
          snipeWindowSec: snapshot.snipeWindowSec,
          extensionSec: snapshot.extensionSec,
          maxExtensions: snapshot.maxExtensions,
          extensionCount: snapshot.extensionCount,
          terminalType: snapshot.terminalType,
          winnerAgentId: snapshot.winnerAgentId,
          winnerWallet: snapshot.winnerWallet,
          winningBidAmount: snapshot.winningBidAmount,
          // Aggregate fields
          bidCount: snapshot.bidCount,
          uniqueBidders: snapshot.uniqueBidders,
          lastActivitySec: snapshot.lastActivitySec,
          competitionLevel: snapshot.competitionLevel,
          priceIncreasePct: snapshot.priceIncreasePct,
          snipeWindowActive: snapshot.snipeWindowActive,
          extensionsRemaining: snapshot.extensionsRemaining,
        },
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      }
    },
  )
}
