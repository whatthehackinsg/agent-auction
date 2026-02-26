import type { AuctionSettlementPacket } from '../types/contracts'
import { ADDRESSES, EIP712_DOMAIN } from './addresses'
import { auctionRegistryAbi, createSequencerClient } from './chain-client'
import { privateKeyToAccount } from 'viem/accounts'

const SETTLEMENT_TYPES = {
  AuctionSettlementPacket: [
    { name: 'auctionId', type: 'bytes32' },
    { name: 'manifestHash', type: 'bytes32' },
    { name: 'finalLogHash', type: 'bytes32' },
    { name: 'replayContentHash', type: 'bytes32' },
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
