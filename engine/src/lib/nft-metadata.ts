/**
 * ERC-721 tokenURI resolution and metadata parsing.
 * Best-effort: returns empty metadata on any failure.
 */
import { publicClient } from './chain-client'

/** Resolved metadata from an NFT's tokenURI */
export interface ResolvedNftMetadata {
  name: string | null
  description: string | null
  imageUrl: string | null
  rawTokenUri: string | null
}

const EMPTY_METADATA: ResolvedNftMetadata = {
  name: null,
  description: null,
  imageUrl: null,
  rawTokenUri: null,
}

/** Minimal ERC-721 ABI for tokenURI read */
const erc721TokenUriAbi = [
  {
    name: 'tokenURI',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [{ name: '', type: 'string' }],
  },
] as const

const IPFS_GATEWAY = 'https://gateway.pinata.cloud/ipfs/'
const FETCH_TIMEOUT_MS = 10_000

/** Convert ipfs:// URIs to HTTPS gateway URLs */
function resolveIpfsUri(uri: string): string {
  if (uri.startsWith('ipfs://')) {
    return `${IPFS_GATEWAY}${uri.slice(7)}`
  }
  return uri
}

/**
 * Parse JSON metadata from a tokenURI, handling:
 * - data:application/json;base64,<base64>
 * - data:application/json,<json>
 * - http(s):// and ipfs:// URIs (fetched with timeout)
 */
async function fetchTokenUriJson(tokenUri: string): Promise<Record<string, unknown>> {
  // Inline base64 data URI
  if (tokenUri.startsWith('data:application/json;base64,')) {
    const base64 = tokenUri.slice('data:application/json;base64,'.length)
    const decoded = atob(base64)
    return JSON.parse(decoded) as Record<string, unknown>
  }

  // Inline plain JSON data URI
  if (tokenUri.startsWith('data:application/json,')) {
    const jsonStr = decodeURIComponent(tokenUri.slice('data:application/json,'.length))
    return JSON.parse(jsonStr) as Record<string, unknown>
  }

  // HTTP(S) or IPFS URI -- fetch with timeout
  const url = resolveIpfsUri(tokenUri)
  const response = await fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })
  if (!response.ok) {
    throw new Error(`tokenURI fetch failed: ${response.status}`)
  }
  return (await response.json()) as Record<string, unknown>
}

/**
 * Resolve an ERC-721 NFT's tokenURI and extract metadata.
 * Best-effort: returns empty metadata on any failure (network, parse, etc.).
 *
 * NOTE: Always reads from Base Sepolia via the existing publicClient.
 * Multi-chain tokenURI reads are out of scope.
 */
export async function resolveNftMetadata(
  nftContract: string,
  nftTokenId: string,
  _nftChainId?: number,
): Promise<ResolvedNftMetadata> {
  try {
    // Step 1: Read tokenURI from on-chain
    const tokenUri = await publicClient.readContract({
      address: nftContract as `0x${string}`,
      abi: erc721TokenUriAbi,
      functionName: 'tokenURI',
      args: [BigInt(nftTokenId)],
    })

    if (!tokenUri || typeof tokenUri !== 'string') {
      return EMPTY_METADATA
    }

    // Step 2: Fetch and parse the metadata JSON
    const metadata = await fetchTokenUriJson(tokenUri)

    const name = typeof metadata.name === 'string' ? metadata.name : null
    const description = typeof metadata.description === 'string' ? metadata.description : null
    const rawImage = typeof metadata.image === 'string' ? metadata.image : null
    // Resolve ipfs:// in the image field too
    const imageUrl = rawImage ? resolveIpfsUri(rawImage) : null

    return {
      name,
      description,
      imageUrl,
      rawTokenUri: tokenUri,
    }
  } catch {
    // Best-effort: any failure returns empty metadata
    return EMPTY_METADATA
  }
}
