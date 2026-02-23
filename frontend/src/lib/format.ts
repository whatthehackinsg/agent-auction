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
