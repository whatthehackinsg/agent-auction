'use client'

import useSWR from 'swr'
import { createPublicClient, http } from 'viem'
import { baseSepolia } from 'viem/chains'

const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http('https://sepolia.base.org'),
})

const REGISTRY_STACKS = [
  {
    version: 'v4',
    registry: '0xAe416531962709cb26886851888aEc80ef29bB45',
    escrow: '0x5a1af9fDD97162c184496519E40afCf864061329',
  },
  {
    version: 'v3',
    registry: '0xB2FB10e98B2707A4C27434665E3C864ecaea0b7F',
    escrow: '0xb23D3bca2728e407A3b8c8ab63C8Ed6538c4bca2',
  },
] as const

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

      const candidateStates = await Promise.all(
        REGISTRY_STACKS.map(async (stack) => {
          const state = await publicClient.readContract({
            address: stack.registry,
            abi: auctionRegistryAbi,
            functionName: 'getAuctionState',
            args: [auctionId as `0x${string}`],
          })
          return { stack, state: Number(state) }
        }),
      )

      const resolved =
        candidateStates.find((entry) => entry.state !== 0) ?? {
          stack: REGISTRY_STACKS[0],
          state: 0,
        }

      const [winner, auctionRaw] = await Promise.all([
        publicClient.readContract({
          address: resolved.stack.registry,
          abi: auctionRegistryAbi,
          functionName: 'getWinner',
          args: [auctionId as `0x${string}`],
        }),
        publicClient.readContract({
          address: resolved.stack.registry,
          abi: auctionRegistryAbi,
          functionName: 'auctions',
          args: [auctionId as `0x${string}`],
        }),
      ])

      const winnerTuple = winner as WinnerTuple
      const auctionTuple = auctionRaw as AuctionTuple

      return {
        state: resolved.state,
        winner: {
          agentId: winnerTuple[0].toString(),
          wallet: winnerTuple[1],
          amount: winnerTuple[2].toString(),
        },
        finalLogHash: auctionTuple[6],
        deadline: Number(auctionTuple[5]),
        registryAddress: resolved.stack.registry,
        registryVersion: resolved.stack.version,
        escrowAddress: resolved.stack.escrow,
      }
    },
    { refreshInterval: 10000 }
  )

  return {
    state: data?.state ?? null,
    winner: data?.winner ?? null,
    finalLogHash: data?.finalLogHash ?? null,
    deadline: data?.deadline ?? null,
    registryAddress: data?.registryAddress ?? null,
    registryVersion: data?.registryVersion ?? null,
    escrowAddress: data?.escrowAddress ?? null,
    isLoading,
    error,
    stateLabel:
      data?.state !== null && data?.state !== undefined
        ? (['NONE', 'OPEN', 'CLOSED', 'SETTLED', 'CANCELLED'][data.state] ?? 'UNKNOWN')
        : null,
  }
}
