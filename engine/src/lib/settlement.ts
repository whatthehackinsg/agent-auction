import type { AuctionSettlementPacket } from '../types/contracts'
import { ADDRESSES, EIP712_DOMAIN } from './addresses'
import { auctionRegistryAbi, publicClient, createSequencerClient } from './chain-client'
import { privateKeyToAccount } from 'viem/accounts'

/**
 * Ensure the auction exists on-chain before recording a result.
 * If the on-chain state is NONE (0), calls createAuction() to self-heal
 * from a previously failed best-effort registration.
 */
export async function ensureAuctionOnChain(
  auctionId: `0x${string}`,
  auctionData: {
    manifestHash: `0x${string}`
    roomConfigHash: `0x${string}`
    reservePrice: bigint
    depositAmount: bigint
    deadline: bigint
  },
  sequencerPrivateKey: `0x${string}`,
): Promise<void> {
  const state = await publicClient.readContract({
    address: ADDRESSES.auctionRegistry,
    abi: auctionRegistryAbi,
    functionName: 'getAuctionState',
    args: [auctionId],
  })

  if (Number(state) === 0) {
    console.log(`[ensureAuctionOnChain] auction ${auctionId} not on-chain, creating...`)
    const client = createSequencerClient(sequencerPrivateKey)
    await client.writeContract({
      address: ADDRESSES.auctionRegistry,
      abi: auctionRegistryAbi,
      functionName: 'createAuction',
      args: [
        auctionId,
        auctionData.manifestHash,
        auctionData.roomConfigHash,
        auctionData.reservePrice,
        auctionData.depositAmount,
        auctionData.deadline,
      ],
    })
  }
}

// Must match deployed contract's SETTLEMENT_TYPEHASH (without replayContentHash)
const SETTLEMENT_TYPES = {
  AuctionSettlementPacket: [
    { name: 'auctionId', type: 'bytes32' },
    { name: 'manifestHash', type: 'bytes32' },
    { name: 'finalLogHash', type: 'bytes32' },
    { name: 'winnerAgentId', type: 'uint256' },
    { name: 'winnerWallet', type: 'address' },
    { name: 'winningBidAmount', type: 'uint256' },
    { name: 'closeTimestamp', type: 'uint64' },
  ],
} as const

export async function signSettlementPacket(
  packet: AuctionSettlementPacket,
  sequencerPrivateKey: `0x${string}`,
): Promise<`0x${string}`> {
  const account = privateKeyToAccount(sequencerPrivateKey)
  return account.signTypedData({
    domain: EIP712_DOMAIN,
    types: SETTLEMENT_TYPES,
    primaryType: 'AuctionSettlementPacket',
    message: packet,
  })
}

export async function recordResultOnChain(
  packet: AuctionSettlementPacket,
  sequencerSig: `0x${string}`,
  sequencerPrivateKey: `0x${string}`,
): Promise<`0x${string}`> {
  const client = createSequencerClient(sequencerPrivateKey)
  return client.writeContract({
    address: ADDRESSES.auctionRegistry,
    abi: auctionRegistryAbi,
    functionName: 'recordResult',
    args: [packet, sequencerSig],
  })
}
