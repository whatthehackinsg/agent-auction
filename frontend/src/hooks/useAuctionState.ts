'use client'

import useSWR from 'swr'
import { createPublicClient, http } from 'viem'
import { baseSepolia } from 'viem/chains'

const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http('https://sepolia.base.org'),
})

const AUCTION_REGISTRY = '0xAe416531962709cb26886851888aEc80ef29bB45' as const

// Minimal ABI for read functions
const auctionRegistryAbi = [
  {
    name: 'getAuctionState',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'auctionId', type: 'bytes32' }],
    outputs: [{ name: '', type: 'uint8' }],
  },
  {
    name: 'getWinner',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'auctionId', type: 'bytes32' }],
    outputs: [
      { name: 'agentId', type: 'uint256' },
      { name: 'wallet', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
  },
  {
    name: 'auctions',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'auctionId', type: 'bytes32' }],
    outputs: [
      { name: 'state', type: 'uint8' },
      { name: 'manifestHash', type: 'bytes32' },
      { name: 'roomConfigHash', type: 'bytes32' },
      { name: 'reservePrice', type: 'uint256' },
      { name: 'depositAmount', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
      { name: 'finalLogHash', type: 'bytes32' },
      { name: 'replayContentHash', type: 'bytes32' },
      { name: 'winnerAgentId', type: 'uint256' },
      { name: 'winnerWallet', type: 'address' },
      { name: 'finalPrice', type: 'uint256' },
      { name: 'closeTimestamp', type: 'uint64' },
    ],
  },
] as const

export function useAuctionState(auctionId: string | undefined) {
  type AuctionTuple = readonly [
    number,
    `0x${string}`,
    `0x${string}`,
    bigint,
    bigint,
    bigint,
    `0x${string}`,
    `0x${string}`,
    bigint,
    `0x${string}`,
    bigint,
    bigint,
  ]

  type WinnerTuple = readonly [bigint, `0x${string}`, bigint]

  const { data, error, isLoading } = useSWR(
    auctionId ? ['auctionState', auctionId] : null,
    async () => {
      if (!auctionId) return null

      const [state, winner, auctionRaw] = await Promise.all([
        publicClient.readContract({
          address: AUCTION_REGISTRY,
          abi: auctionRegistryAbi,
          functionName: 'getAuctionState',
          args: [auctionId as `0x${string}`],
        }),
        publicClient.readContract({
          address: AUCTION_REGISTRY,
          abi: auctionRegistryAbi,
          functionName: 'getWinner',
          args: [auctionId as `0x${string}`],
        }),
        publicClient.readContract({
          address: AUCTION_REGISTRY,
          abi: auctionRegistryAbi,
          functionName: 'auctions',
          args: [auctionId as `0x${string}`],
        }),
      ])

      const winnerTuple = winner as WinnerTuple
      const auctionTuple = auctionRaw as AuctionTuple

      return {
        state: Number(state),
        winner: {
          agentId: winnerTuple[0].toString(),
          wallet: winnerTuple[1],
          amount: winnerTuple[2].toString(),
        },
        finalLogHash: auctionTuple[6],
        deadline: Number(auctionTuple[5]),
      }
    },
    { refreshInterval: 10000 }
  )

  return {
    state: data?.state ?? null,
    winner: data?.winner ?? null,
    finalLogHash: data?.finalLogHash ?? null,
    deadline: data?.deadline ?? null,
    isLoading,
    error,
    stateLabel:
      data?.state !== null && data?.state !== undefined
        ? (['NONE', 'OPEN', 'CLOSED', 'SETTLED', 'CANCELLED'][data.state] ?? 'UNKNOWN')
        : null,
  }
}
