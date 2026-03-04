export function truncateHex(value: string, head = 6, tail = 4): string {
  if (value.length <= head + tail + 3) return value
  return `${value.slice(0, head)}...${value.slice(-tail)}`
}

export function formatUsdc(amountBaseUnits: string): string {
  const amount = BigInt(amountBaseUnits)
  const whole = amount / BigInt(1_000_000)
  const frac = amount % BigInt(1_000_000)
  if (frac === BigInt(0)) return `${whole.toString()} USDC`
  const fracStr = frac.toString().padStart(6, '0').replace(/0+$/, '')
  return `${whole.toString()}.${fracStr} USDC`
}

export function formatCountdown(deadlineSec: number): string {
  const now = Math.floor(Date.now() / 1000)
  const delta = deadlineSec - now
  if (delta <= 0) return 'ENDED'

  const hours = Math.floor(delta / 3600)
  const mins = Math.floor((delta % 3600) / 60)
  const secs = delta % 60
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs
    .toString()
    .padStart(2, '0')}`
}

export function statusLabel(status: number): 'NONE' | 'OPEN' | 'CLOSED' | 'SETTLED' | 'CANCELLED' {
  switch (status) {
    case 0:
      return 'NONE'
    case 1:
      return 'OPEN'
    case 2:
      return 'CLOSED'
    case 3:
      return 'SETTLED'
    case 4:
      return 'CANCELLED'
    default:
      return 'NONE'
  }
}

export function nftExplorerUrl(
  chainId: number | null | undefined,
  contract: string | null | undefined,
  tokenId: string | null | undefined,
): string | null {
  if (!contract || !tokenId) return null
  const explorers: Record<number, string> = {
    84532: 'https://sepolia.basescan.org',
    8453: 'https://basescan.org',
    1: 'https://etherscan.io',
    11155111: 'https://sepolia.etherscan.io',
  }
  const base = explorers[chainId ?? 84532] ?? explorers[84532]
  return `${base}/token/${contract}?a=${tokenId}`
}

export function nftMarketplaceUrl(
  chainId: number | null | undefined,
  contract: string | null | undefined,
  tokenId: string | null | undefined,
): string | null {
  if (!contract || !tokenId) return null
  const testnetChains: Record<number, string> = {
    84532: 'base-sepolia',
    11155111: 'sepolia',
  }
  const mainnetChains: Record<number, string> = {
    8453: 'base',
    1: 'ethereum',
  }
  const cid = chainId ?? 84532
  const testnetSlug = testnetChains[cid]
  if (testnetSlug) {
    return `https://testnets.opensea.io/assets/${testnetSlug}/${contract}/${tokenId}`
  }
  const mainnetSlug = mainnetChains[cid]
  if (mainnetSlug) {
    return `https://opensea.io/assets/${mainnetSlug}/${contract}/${tokenId}`
  }
  return null
}
