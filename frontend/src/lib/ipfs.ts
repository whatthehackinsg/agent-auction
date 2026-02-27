export function resolveImageUrl(cidOrUrl: string | null | undefined): string | null {
  if (!cidOrUrl) return null
  if (cidOrUrl.startsWith('http')) return cidOrUrl
  return `https://gateway.pinata.cloud/ipfs/${cidOrUrl}`
}
