/**
 * get_auction_details — Get full details for a specific auction.
 *
 * GET /auctions/:id -> returns D1 row + Durable Object room snapshot
 * including highest bid, time remaining, participant count, etc.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { EngineClient } from '../lib/engine.js'

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
}

interface AuctionDetailResponse {
  auction: AuctionRow
  snapshot: RoomSnapshot
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
        'Get full details for a specific auction including current snapshot, highest bid, time remaining, participant count, and winner info if closed.',
      inputSchema: z.object({
        auctionId: z.string().describe('The 0x-prefixed bytes32 auction ID'),
      }),
    },
    async ({ auctionId }) => {
      const data = await engine.get<AuctionDetailResponse>(`/auctions/${auctionId}`)

      const { auction, snapshot } = data
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
            : null,
          nftContract: auction.nft_contract,
          nftTokenId: auction.nft_token_id,
          nftChainId: auction.nft_chain_id,
        },
        snapshot: {
          participantCount: snapshot.participantCount,
          currentSeq: snapshot.currentSeq,
          highestBid: snapshot.highestBid,
          highestBidder: snapshot.highestBidder,
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
