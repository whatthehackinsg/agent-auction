'use client'

import useSWR from 'swr'
import { createPublicClient, http } from 'viem'
import { baseSepolia } from 'viem/chains'

const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http('https://sepolia.base.org'),
})

const AUCTION_REGISTRY = '0xFEc7a05707AF85C6b248314E20FF8EfF590c3639' as const

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
] as const

export function useAuctionState(auctionId: string | undefined) {
  const { data, error, isLoading } = useSWR(
    auctionId ? ['auctionState', auctionId] : null,
    async () => {
      if (!auctionId) return null
      const state = await publicClient.readContract({
        address: AUCTION_REGISTRY,
        abi: auctionRegistryAbi,
        functionName: 'getAuctionState',
        args: [auctionId as `0x${string}`],
      })
      return state as number
    },
    { refreshInterval: 10000 }
  )

  return {
    state: data ?? null,
    isLoading,
    error,
    stateLabel:
      data !== null && data !== undefined
        ? (['NONE', 'OPEN', 'CLOSED', 'SETTLED', 'CANCELLED'][data] ?? 'UNKNOWN')
        : null,
  }
}