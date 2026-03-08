import { describe, expect, it, vi } from 'vitest'
import { EngineClient } from '../src/lib/engine.js'
import { makeConfig } from './helpers.js'

describe('EngineClient x402 read auth', () => {
  it('retries eligible GET reads after a 402 payment challenge', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: 'payment required' }), {
          status: 402,
          headers: {
            'Content-Type': 'application/json',
            'PAYMENT-REQUIRED': Buffer.from(JSON.stringify({ accepts: [] }), 'utf8').toString('base64'),
          },
        }),
      )
      .mockResolvedValueOnce(
        Response.json({ auctions: [{ auction_id: '0x01' }] }),
      )

    const buildAccessHeaders = vi.fn().mockResolvedValue({
      'X-AUCTION-X402-ISSUED-AT': '123',
      'X-AUCTION-X402-ACCESS-SIGNATURE': '0x' + '11'.repeat(65),
    })
    const createPaymentHeaders = vi.fn().mockResolvedValue({
      'PAYMENT-SIGNATURE': 'paid-receipt',
    })

    const client = new EngineClient(makeConfig(), {
      fetchImpl,
      buildAccessHeaders,
      createPaymentHeaders,
    })

    const result = await client.get<{ auctions: Array<{ auction_id: string }> }>('/auctions')

    expect(result.auctions).toHaveLength(1)
    expect(buildAccessHeaders).toHaveBeenCalledWith(expect.any(Object), '/auctions')
    expect(createPaymentHeaders).toHaveBeenCalledTimes(1)
    expect(fetchImpl).toHaveBeenCalledTimes(2)

    const firstHeaders = new Headers(fetchImpl.mock.calls[0]?.[1]?.headers)
    expect(firstHeaders.get('X-AUCTION-X402-ISSUED-AT')).toBe('123')
    expect(firstHeaders.get('PAYMENT-SIGNATURE')).toBeNull()

    const secondHeaders = new Headers(fetchImpl.mock.calls[1]?.[1]?.headers)
    expect(secondHeaders.get('PAYMENT-SIGNATURE')).toBe('paid-receipt')
  })

  it('uses admin bypass mode only when explicitly configured', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({ auction: { auction_id: '0x01' }, snapshot: {} }),
    )
    const buildAccessHeaders = vi.fn()
    const createPaymentHeaders = vi.fn()

    const client = new EngineClient(
      makeConfig({
        engineReadMode: 'admin-bypass',
        engineAdminKey: 'debug-admin-key',
      }),
      {
        fetchImpl,
        buildAccessHeaders,
        createPaymentHeaders,
      },
    )

    await client.get('/auctions/0x01')

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const headers = new Headers(fetchImpl.mock.calls[0]?.[1]?.headers)
    expect(headers.get('X-ENGINE-ADMIN-KEY')).toBe('debug-admin-key')
    expect(buildAccessHeaders).not.toHaveBeenCalled()
    expect(createPaymentHeaders).not.toHaveBeenCalled()
  })
})
