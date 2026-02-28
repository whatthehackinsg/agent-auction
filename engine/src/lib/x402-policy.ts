export type X402RuntimeConfig =
  | { enabled: false; error?: string }
  | {
    enabled: true
    receiverAddress: `0x${string}`
    facilitatorUrl: string
  }

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/
const DEFAULT_FACILITATOR_URL = 'https://www.x402.org/facilitator'
const DEFAULT_PRICE_MANIFEST = '$0.001'
const DEFAULT_PRICE_EVENTS = '$0.0001'

type X402EnvConfig = {
  X402_MODE?: string
  X402_RECEIVER_ADDRESS?: string
  X402_FACILITATOR_URL?: string
}

export function resolveX402RuntimeConfig(env: X402EnvConfig): X402RuntimeConfig {
  if (env.X402_MODE !== 'on') {
    return { enabled: false }
  }

  const receiverAddress = env.X402_RECEIVER_ADDRESS?.trim()
  if (!receiverAddress || !ADDRESS_RE.test(receiverAddress)) {
    return { enabled: false, error: 'X402_RECEIVER_ADDRESS must be a valid 0x address when X402_MODE=on' }
  }

  return {
    enabled: true,
    receiverAddress: receiverAddress as `0x${string}`,
    facilitatorUrl: env.X402_FACILITATOR_URL ?? DEFAULT_FACILITATOR_URL,
  }
}

// ── Per-Auction x402 Policy ──────────────────────────────────────────

export interface AuctionX402Policy {
  mode?: 'on' | 'off' | 'inherit'
  priceManifest?: string
  priceEvents?: string
  receiverAddress?: string
}

export interface ResolvedX402Policy {
  enabled: boolean
  receiverAddress: `0x${string}` | null
  facilitatorUrl: string
  priceManifest: string
  priceEvents: string
}

const VALID_MODES = new Set(['on', 'off', 'inherit'])
const PRICE_RE = /^\$\d+(\.\d+)?$/
const KNOWN_KEYS = new Set(['mode', 'priceManifest', 'priceEvents', 'receiverAddress'])

function parsePriceValue(price: string): number {
  return parseFloat(price.replace('$', ''))
}

export function validateAuctionX402Policy(policy: unknown): string | null {
  if (typeof policy !== 'object' || policy === null || Array.isArray(policy)) {
    return 'x402Policy must be an object'
  }

  const obj = policy as Record<string, unknown>

  for (const key of Object.keys(obj)) {
    if (!KNOWN_KEYS.has(key)) {
      return `unknown x402Policy key: ${key}`
    }
  }

  if (obj.mode !== undefined) {
    if (typeof obj.mode !== 'string' || !VALID_MODES.has(obj.mode)) {
      return `x402Policy.mode must be one of: on, off, inherit`
    }
  }

  for (const field of ['priceManifest', 'priceEvents'] as const) {
    if (obj[field] !== undefined) {
      if (typeof obj[field] !== 'string' || !PRICE_RE.test(obj[field] as string)) {
        return `x402Policy.${field} must match format $N.NN (e.g. "$0.001")`
      }
      const value = parsePriceValue(obj[field] as string)
      if (value < 0.00001 || value > 1.0) {
        return `x402Policy.${field} must be between $0.00001 and $1.00`
      }
    }
  }

  if (obj.receiverAddress !== undefined) {
    if (typeof obj.receiverAddress !== 'string' || !ADDRESS_RE.test(obj.receiverAddress)) {
      return 'x402Policy.receiverAddress must be a valid 0x address (40 hex chars)'
    }
  }

  return null
}

export function resolveAuctionX402Policy(
  platformConfig: X402RuntimeConfig,
  auctionPolicy: AuctionX402Policy | null,
): ResolvedX402Policy {
  const facilitatorUrl = platformConfig.enabled
    ? platformConfig.facilitatorUrl
    : DEFAULT_FACILITATOR_URL

  const platformReceiver = platformConfig.enabled
    ? platformConfig.receiverAddress
    : null

  // Determine effective mode
  const auctionMode = auctionPolicy?.mode ?? 'inherit'

  let enabled: boolean
  if (auctionMode === 'inherit') {
    enabled = platformConfig.enabled
  } else {
    enabled = auctionMode === 'on'
  }

  // Determine receiver: auction override > platform
  const receiverAddress = (
    auctionPolicy?.receiverAddress
      ? auctionPolicy.receiverAddress as `0x${string}`
      : platformReceiver
  )

  // Fail-closed: mode=on but no receiver anywhere → disabled
  if (enabled && !receiverAddress) {
    enabled = false
  }

  return {
    enabled,
    receiverAddress: receiverAddress ?? null,
    facilitatorUrl,
    priceManifest: auctionPolicy?.priceManifest ?? DEFAULT_PRICE_MANIFEST,
    priceEvents: auctionPolicy?.priceEvents ?? DEFAULT_PRICE_EVENTS,
  }
}

export function getPaymentSignatureHeader(request: Request): string | null {
  return (
    request.headers.get('PAYMENT-SIGNATURE')
    ?? request.headers.get('payment-signature')
    ?? request.headers.get('X-PAYMENT')
    ?? request.headers.get('x-payment')
  )
}

export async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  const raw = new Uint8Array(digest)
  return `0x${Array.from(raw).map((b) => b.toString(16).padStart(2, '0')).join('')}`
}

export async function hasX402Receipt(db: D1Database, receiptHash: string): Promise<boolean> {
  const row = await db
    .prepare('SELECT receipt_hash FROM x402_receipts WHERE receipt_hash = ?')
    .bind(receiptHash)
    .first<{ receipt_hash: string }>()
  return !!row
}

export async function storeX402Receipt(db: D1Database, receiptHash: string, usedAt: number): Promise<void> {
  await db
    .prepare('INSERT OR IGNORE INTO x402_receipts (receipt_hash, used_at) VALUES (?, ?)')
    .bind(receiptHash, usedAt)
    .run()
}
