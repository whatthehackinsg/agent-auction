import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Miniflare } from 'miniflare'
import {
  extractPayerWalletFromPaymentHeader,
  getPaymentSignatureHeader,
  hasX402Receipt,
  hasX402Entitlement,
  resolveX402EntitlementScope,
  resolveX402RuntimeConfig,
  resolveAuctionX402Policy,
  validateAuctionX402Policy,
  sha256Hex,
  storeX402Entitlement,
  storeX402Receipt,
  type AuctionX402Policy,
  type X402RuntimeConfig,
} from '../src/lib/x402-policy'
import { extractAuctionIdFromPath } from '../src/middleware/x402'
import { applySchema, createTestMiniflare } from './setup'

describe('x402 policy helpers', () => {
  let mf: Miniflare
  let db: D1Database

  beforeAll(async () => {
    mf = createTestMiniflare()
    db = await mf.getD1Database('AUCTION_DB')
    await applySchema(db)
  })

  afterAll(async () => {
    await mf.dispose()
  })

  it('resolves off mode by default', () => {
    const cfg = resolveX402RuntimeConfig({})
    expect(cfg.enabled).toBe(false)
  })

  it('fails closed when mode on and receiver missing', () => {
    const cfg = resolveX402RuntimeConfig({ X402_MODE: 'on' })
    expect(cfg.enabled).toBe(false)
    expect(cfg.error).toContain('X402_RECEIVER_ADDRESS')
  })

  it('resolves on mode when receiver is valid', () => {
    const cfg = resolveX402RuntimeConfig({
      X402_MODE: 'on',
      X402_RECEIVER_ADDRESS: '0x' + '11'.repeat(20),
      X402_FACILITATOR_URL: 'https://example.com/facilitator',
    })
    expect(cfg.enabled).toBe(true)
    if (cfg.enabled) {
      expect(cfg.receiverAddress).toBe('0x' + '11'.repeat(20))
      expect(cfg.facilitatorUrl).toBe('https://example.com/facilitator')
    }
  })

  it('extracts payment signature from either header name', () => {
    const req1 = new Request('http://localhost/auctions/demo/manifest', {
      headers: { 'PAYMENT-SIGNATURE': 'sig-1' },
    })
    const req2 = new Request('http://localhost/auctions/demo/manifest', {
      headers: { 'X-PAYMENT': 'sig-2' },
    })
    expect(getPaymentSignatureHeader(req1)).toBe('sig-1')
    expect(getPaymentSignatureHeader(req2)).toBe('sig-2')
  })

  it('stores and looks up x402 receipt hash', async () => {
    const hash = await sha256Hex('demo-signature')
    expect(await hasX402Receipt(db, hash)).toBe(false)
    await storeX402Receipt(db, hash, Math.floor(Date.now() / 1000))
    expect(await hasX402Receipt(db, hash)).toBe(true)
  })

  it('stores and looks up x402 entitlement by wallet and scope', async () => {
    const wallet = '0x' + '22'.repeat(20)
    const scope = 'auction:0x' + 'ab'.repeat(32)

    expect(await hasX402Entitlement(db, wallet, scope)).toBe(false)
    await storeX402Entitlement(db, wallet, scope, Math.floor(Date.now() / 1000))
    expect(await hasX402Entitlement(db, wallet, scope)).toBe(true)
  })

  it('extracts payer wallet from an exact payment header', () => {
    const paymentPayload = {
      x402Version: 2,
      resource: 'http://localhost/auctions',
      accepted: {
        scheme: 'exact',
        network: 'eip155:84532',
        maxAmountRequired: '1000',
        resource: 'http://localhost/auctions',
        description: 'Auction discovery list',
        mimeType: 'application/json',
        outputSchema: undefined,
        payTo: '0x' + '11'.repeat(20),
        maxTimeoutSeconds: 300,
        asset: '0x' + '33'.repeat(20),
        amount: '1000',
      },
      payload: {
        authorization: {
          from: '0x' + '44'.repeat(20),
          to: '0x' + '11'.repeat(20),
          value: '1000',
          validAfter: '0',
          validBefore: '9999999999',
          nonce: '0x' + '55'.repeat(32),
        },
        signature: '0x' + '66'.repeat(65),
      },
    }
    const header = Buffer.from(JSON.stringify(paymentPayload), 'utf8').toString('base64')
    expect(extractPayerWalletFromPaymentHeader(header)).toBe('0x' + '44'.repeat(20))
  })
})

// ── extractAuctionIdFromPath ────────────────────────────────────────
// The dynamic x402 middleware receives HTTPRequestContext.path (the actual
// request path, e.g. "/auctions/0xabc.../manifest") and must extract the
// auction ID to look up per-auction policy.  These tests verify the regex
// against real path shapes the Hono adapter produces.

describe('extractAuctionIdFromPath', () => {
  it('extracts auction ID from a real manifest path', () => {
    const auctionId = '0x' + 'ab'.repeat(32)
    expect(extractAuctionIdFromPath(`/auctions/${auctionId}/manifest`)).toBe(auctionId)
  })

  it('extracts auction ID from a real events path', () => {
    const auctionId = '0x' + 'cd'.repeat(32)
    expect(extractAuctionIdFromPath(`/auctions/${auctionId}/events`)).toBe(auctionId)
  })

  it('returns null for unrelated paths', () => {
    expect(extractAuctionIdFromPath('/health')).toBeNull()
    expect(extractAuctionIdFromPath('/auctions')).toBeNull()
    expect(extractAuctionIdFromPath('/auctions/0xabc/action')).toBeNull()
    expect(extractAuctionIdFromPath('/auctions/0xabc/replay')).toBeNull()
  })

  it('returns null for empty/root path', () => {
    expect(extractAuctionIdFromPath('/')).toBeNull()
    expect(extractAuctionIdFromPath('')).toBeNull()
  })
})

describe('resolveX402EntitlementScope', () => {
  it('maps discovery list to discovery scope', () => {
    expect(resolveX402EntitlementScope('/auctions')).toBe('discovery')
  })

  it('maps room detail to auction-specific scope', () => {
    const auctionId = '0x' + 'ef'.repeat(32)
    expect(resolveX402EntitlementScope(`/auctions/${auctionId}`)).toBe(`auction:${auctionId}`)
  })

  it('returns null for non-entitled paths', () => {
    expect(resolveX402EntitlementScope('/health')).toBeNull()
    expect(resolveX402EntitlementScope('/auctions/0xabc/events')).toBeNull()
  })
})

// ── Per-Auction Policy Resolution ──────────────────────────────────
// These model real resolution scenarios an admin would encounter.

describe('resolveAuctionX402Policy', () => {
  const platformOn: X402RuntimeConfig = {
    enabled: true,
    receiverAddress: '0x' + '11'.repeat(20),
    facilitatorUrl: 'https://example.com/facilitator',
  }
  const platformOff: X402RuntimeConfig = { enabled: false }

  // Scenario: auction with no x402 config → inherits platform behavior
  it('auction with no policy inherits platform ON → enabled with platform defaults', () => {
    const result = resolveAuctionX402Policy(platformOn, null)
    expect(result.enabled).toBe(true)
    expect(result.receiverAddress).toBe('0x' + '11'.repeat(20))
    expect(result.priceManifest).toBe('$0.001')
    expect(result.priceEvents).toBe('$0.0001')
  })

  it('auction with no policy inherits platform OFF → disabled', () => {
    const result = resolveAuctionX402Policy(platformOff, null)
    expect(result.enabled).toBe(false)
  })

  // Scenario: premium auction forces payments even though platform is free
  it('premium auction (mode=on) overrides platform OFF', () => {
    const policy: AuctionX402Policy = {
      mode: 'on',
      receiverAddress: '0x' + '22'.repeat(20),
      priceManifest: '$0.005',
      priceEvents: '$0.0005',
    }
    const result = resolveAuctionX402Policy(platformOff, policy)
    expect(result.enabled).toBe(true)
    expect(result.receiverAddress).toBe('0x' + '22'.repeat(20))
    expect(result.priceManifest).toBe('$0.005')
    expect(result.priceEvents).toBe('$0.0005')
  })

  // Scenario: demo/free auction exempted even though platform charges
  it('demo auction (mode=off) overrides platform ON', () => {
    const policy: AuctionX402Policy = { mode: 'off' }
    const result = resolveAuctionX402Policy(platformOn, policy)
    expect(result.enabled).toBe(false)
  })

  // Scenario: explicit inherit follows platform toggle
  it('explicit inherit follows platform on/off', () => {
    const policy: AuctionX402Policy = { mode: 'inherit' }
    const resultOn = resolveAuctionX402Policy(platformOn, policy)
    expect(resultOn.enabled).toBe(true)
    const resultOff = resolveAuctionX402Policy(platformOff, policy)
    expect(resultOff.enabled).toBe(false)
  })

  // Scenario: auction overrides only the manifest price, events keeps default
  it('partial price override — only priceManifest set, priceEvents uses default', () => {
    const policy: AuctionX402Policy = { priceManifest: '$0.005' }
    const result = resolveAuctionX402Policy(platformOn, policy)
    expect(result.priceManifest).toBe('$0.005')
    expect(result.priceEvents).toBe('$0.0001')
  })

  // Scenario: auction sends revenue to a different wallet than the platform
  it('auction receiver takes priority over platform receiver', () => {
    const policy: AuctionX402Policy = {
      receiverAddress: '0x' + 'aa'.repeat(20),
    }
    const result = resolveAuctionX402Policy(platformOn, policy)
    expect(result.receiverAddress).toBe('0x' + 'aa'.repeat(20))
  })

  // Scenario: auction forces on but nobody configured a receiver anywhere
  // → fail-closed (disable rather than panic at middleware time)
  it('fails closed when mode=on but no receiver anywhere', () => {
    const policy: AuctionX402Policy = { mode: 'on' }
    const result = resolveAuctionX402Policy(platformOff, policy)
    expect(result.enabled).toBe(false)
  })
})

// ── Per-Auction Policy Validation ──────────────────────────────────
// These represent what an admin would POST/PATCH — valid and invalid
// payloads the engine must accept or reject.

describe('validateAuctionX402Policy', () => {
  it('accepts a fully specified valid policy', () => {
    expect(validateAuctionX402Policy({
      mode: 'on',
      priceManifest: '$0.005',
      priceEvents: '$0.0001',
      receiverAddress: '0x' + '11'.repeat(20),
    })).toBeNull()
  })

  it('accepts an empty object (all fields optional)', () => {
    expect(validateAuctionX402Policy({})).toBeNull()
  })

  it('accepts mode=inherit', () => {
    expect(validateAuctionX402Policy({ mode: 'inherit' })).toBeNull()
  })

  it('accepts boundary prices ($0.00001 min, $1.00 max)', () => {
    expect(validateAuctionX402Policy({ priceManifest: '$0.00001' })).toBeNull()
    expect(validateAuctionX402Policy({ priceManifest: '$1.00' })).toBeNull()
    expect(validateAuctionX402Policy({ priceManifest: '$1' })).toBeNull()
  })

  // Bad inputs an admin might accidentally send
  it('rejects non-object input', () => {
    expect(validateAuctionX402Policy('on')).toContain('must be an object')
    expect(validateAuctionX402Policy(null)).toContain('must be an object')
    expect(validateAuctionX402Policy([{ mode: 'on' }])).toContain('must be an object')
  })

  it('rejects mode values that are not on/off/inherit', () => {
    expect(validateAuctionX402Policy({ mode: 'maybe' })).toContain('mode must be one of')
    expect(validateAuctionX402Policy({ mode: true })).toContain('mode must be one of')
    expect(validateAuctionX402Policy({ mode: 123 })).toContain('mode must be one of')
  })

  it('rejects prices outside guardrails', () => {
    // Below min ($0.00001)
    expect(validateAuctionX402Policy({ priceManifest: '$0.000001' })).toContain('between')
    // Above max ($1.00)
    expect(validateAuctionX402Policy({ priceManifest: '$5.00' })).toContain('between')
    expect(validateAuctionX402Policy({ priceEvents: '$100' })).toContain('between')
  })

  it('rejects prices without $ prefix or with invalid format', () => {
    expect(validateAuctionX402Policy({ priceManifest: '0.001' })).toContain('format')
    expect(validateAuctionX402Policy({ priceEvents: 'free' })).toContain('format')
    expect(validateAuctionX402Policy({ priceManifest: '$abc' })).toContain('format')
  })

  it('rejects invalid receiver addresses', () => {
    expect(validateAuctionX402Policy({ receiverAddress: 'not-an-address' })).toContain('valid 0x address')
    expect(validateAuctionX402Policy({ receiverAddress: '0x123' })).toContain('valid 0x address')
    expect(validateAuctionX402Policy({ receiverAddress: '0x' + 'GG'.repeat(20) })).toContain('valid 0x address')
  })

  it('rejects unknown keys (guards against typos)', () => {
    expect(validateAuctionX402Policy({ mode: 'on', price: '$0.01' })).toContain('unknown')
    expect(validateAuctionX402Policy({ recieverAddress: '0x' + '11'.repeat(20) })).toContain('unknown')
  })
})
