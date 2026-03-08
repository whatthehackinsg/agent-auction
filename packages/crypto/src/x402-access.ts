export type X402AccessScope = 'discovery' | `auction:${string}`

export const X402_ACCESS_DOMAIN = {
  name: 'AgentAuctionX402Access',
  version: '1',
} as const

export const X402_ACCESS_ISSUED_AT_HEADER = 'X-AUCTION-X402-ISSUED-AT' as const
export const X402_ACCESS_SIGNATURE_HEADER = 'X-AUCTION-X402-ACCESS-SIGNATURE' as const

export const X402_ACCESS_PRIMARY_TYPE = 'X402Access' as const

export const X402_ACCESS_TYPES = {
  X402Access: [
    { name: 'scope', type: 'string' },
    { name: 'engine', type: 'string' },
    { name: 'issuedAt', type: 'uint64' },
  ],
} as const

export interface BuildX402AccessTypedDataArgs {
  scope: X402AccessScope
  engineOrigin: string
  issuedAt: number | bigint
  chainId?: number
}

export function normalizeX402EngineOrigin(url: string): string {
  return new URL(url).origin
}

export function buildX402AccessTypedData({
  scope,
  engineOrigin,
  issuedAt,
  chainId = 84532,
}: BuildX402AccessTypedDataArgs) {
  return {
    domain: {
      ...X402_ACCESS_DOMAIN,
      chainId,
    },
    types: X402_ACCESS_TYPES,
    primaryType: X402_ACCESS_PRIMARY_TYPE,
    message: {
      scope,
      engine: normalizeX402EngineOrigin(engineOrigin),
      issuedAt: BigInt(issuedAt),
    },
  } as const
}
