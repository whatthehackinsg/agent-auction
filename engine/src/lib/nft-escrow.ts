/**
 * NftEscrow on-chain deposit status reader.
 * Reads the NftEscrow.deposits(auctionId) view to check custody state.
 */
import { publicClient } from './chain-client'
import { ADDRESSES } from './addresses'

/** Human-readable labels for NftEscrow deposit states */
export const NFT_STATE_LABELS = ['NONE', 'DEPOSITED', 'CLAIMED', 'RETURNED'] as const

/** Inline minimal ABI for NftEscrow.deposits(bytes32) view */
const nftEscrowAbi = [
  {
    name: 'deposits',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'auctionId', type: 'bytes32' }],
    outputs: [
      { name: 'nftContract', type: 'address' },
      { name: 'tokenId', type: 'uint256' },
      { name: 'depositor', type: 'address' },
      { name: 'state', type: 'uint8' },
      { name: 'depositTimestamp', type: 'uint256' },
    ],
  },
] as const

/**
 * Read the NftEscrow deposit status for an auction.
 * Returns the human-readable state label and depositor address.
 * Best-effort: returns UNKNOWN on any failure.
 */
export async function getNftEscrowStatus(
  auctionId: string,
): Promise<{ state: string; depositor: string | null }> {
  try {
    const result = await publicClient.readContract({
      address: ADDRESSES.nftEscrow,
      abi: nftEscrowAbi,
      functionName: 'deposits',
      args: [auctionId as `0x${string}`],
    })

    // result is a tuple: [nftContract, tokenId, depositor, state, depositTimestamp]
    const stateIndex = Number(result[3])
    const depositor = result[2] as string
    const state = NFT_STATE_LABELS[stateIndex] ?? 'UNKNOWN'

    // Zero address means no depositor
    const zeroAddress = '0x0000000000000000000000000000000000000000'
    return {
      state,
      depositor: depositor === zeroAddress ? null : depositor,
    }
  } catch {
    // Best-effort: return UNKNOWN on any chain read failure
    return { state: 'UNKNOWN', depositor: null }
  }
}
