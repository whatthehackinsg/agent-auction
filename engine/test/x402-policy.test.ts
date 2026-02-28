import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Miniflare } from 'miniflare'
import {
  getPaymentSignatureHeader,
  hasX402Receipt,
  resolveX402RuntimeConfig,
  resolveAuctionX402Policy,
  validateAuctionX402Policy,
  sha256Hex,
  storeX402Receipt,
  type AuctionX402Policy,
  type X402RuntimeConfig,
} from '../src/lib/x402-policy'
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
})

// ── Per-Auction Policy Resolution ──────────────────────────────────

describe('resolveAuctionX402Policy', () => {
  const platformOn: X402RuntimeConfig = {
    enabled: true,
    receiverAddress: '0x' + '11'.repeat(20),
    facilitatorUrl: 'https://example.com/facilitator',
  }
  const platformOff: X402RuntimeConfig = { enabled: false }

  it('null policy → uses platform config (on)', () => {
    const result = resolveAuctionX402Policy(platformOn, null)
    expect(result.enabled).toBe(true)
    expect(result.receiverAddress).toBe('0x' + '11'.repeat(20))
    expect(result.priceManifest).toBe('$0.001')
    expect(result.priceEvents).toBe('$0.0001')
  })

  it('null policy → uses platform config (off)', () => {
    const result = resolveAuctionX402Policy(platformOff, null)
    expect(result.enabled).toBe(false)
  })

  it('mode: on overrides platform off', () => {
    const policy: AuctionX402Policy = {
      mode: 'on',
      receiverAddress: '0x' + '22'.repeat(20),
    }
    const result = resolveAuctionX402Policy(platformOff, policy)
    expect(result.enabled).toBe(true)
    expect(result.receiverAddress).toBe('0x' + '22'.repeat(20))
  })

  it('mode: off overrides platform on', () => {
    const policy: AuctionX402Policy = { mode: 'off' }
    const result = resolveAuctionX402Policy(platformOn, policy)
    expect(result.enabled).toBe(false)
  })

  it('mode: inherit follows platform', () => {
    const policy: AuctionX402Policy = { mode: 'inherit' }
    const resultOn = resolveAuctionX402Policy(platformOn, policy)
    expect(resultOn.enabled).toBe(true)
    const resultOff = resolveAuctionX402Policy(platformOff, policy)
    expect(resultOff.enabled).toBe(false)
  })

  it('custom prices used, defaults for unset', () => {
    const policy: AuctionX402Policy = { priceManifest: '$0.005' }
    const result = resolveAuctionX402Policy(platformOn, policy)
    expect(result.priceManifest).toBe('$0.005')
    expect(result.priceEvents).toBe('$0.0001') // default
  })

  it('receiver override takes priority over platform', () => {
    const policy: AuctionX402Policy = {
      receiverAddress: '0x' + 'aa'.repeat(20),
    }
    const result = resolveAuctionX402Policy(platformOn, policy)
    expect(result.receiverAddress).toBe('0x' + 'aa'.repeat(20))
  })

  it('fails closed when mode=on but no receiver anywhere', () => {
    const policy: AuctionX402Policy = { mode: 'on' }
    const result = resolveAuctionX402Policy(platformOff, policy)
    expect(result.enabled).toBe(false)
  })
})

// ── Per-Auction Policy Validation ──────────────────────────────────

describe('validateAuctionX402Policy', () => {
  it('valid input returns null', () => {
    expect(validateAuctionX402Policy({
      mode: 'on',
      priceManifest: '$0.005',
      priceEvents: '$0.0001',
      receiverAddress: '0x' + '11'.repeat(20),
    })).toBeNull()
  })

  it('empty object is valid', () => {
    expect(validateAuctionX402Policy({})).toBeNull()
  })

  it('rejects non-object input', () => {
    expect(validateAuctionX402Policy('invalid')).toContain('must be an object')
    expect(validateAuctionX402Policy(null)).toContain('must be an object')
    expect(validateAuctionX402Policy([1, 2])).toContain('must be an object')
  })

  it('rejects invalid mode', () => {
    expect(validateAuctionX402Policy({ mode: 'maybe' })).toContain('mode must be one of')
    expect(validateAuctionX402Policy({ mode: 123 })).toContain('mode must be one of')
  })

  it('rejects price below minimum', () => {
    expect(validateAuctionX402Policy({ priceManifest: '$0.000001' })).toContain('between')
  })

  it('rejects price above maximum', () => {
    expect(validateAuctionX402Policy({ priceManifest: '$5.00' })).toContain('between')
  })

  it('rejects invalid price format', () => {
    expect(validateAuctionX402Policy({ priceManifest: '0.001' })).toContain('format')
    expect(validateAuctionX402Policy({ priceEvents: 'free' })).toContain('format')
  })

  it('rejects invalid receiver address', () => {
    expect(validateAuctionX402Policy({ receiverAddress: 'not-an-address' })).toContain('valid 0x address')
    expect(validateAuctionX402Policy({ receiverAddress: '0x123' })).toContain('valid 0x address')
  })

  it('rejects unknown keys', () => {
    expect(validateAuctionX402Policy({ mode: 'on', unknownField: true })).toContain('unknown')
  })
})
