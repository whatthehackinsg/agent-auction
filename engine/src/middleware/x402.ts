import type { MiddlewareHandler } from 'hono'
import { sha256, toBytes } from 'viem'

type X402Options = {
  priceUsdc: string
  resource: string
}

function extractReceipt(headers: Headers): string | null {
  return (
    headers.get('x402-receipt') ??
    headers.get('x-payment-receipt') ??
    headers.get('x402') ??
    null
  )
}

export function requireX402(options: X402Options): MiddlewareHandler {
  return async (c, next) => {
    const receipt = extractReceipt(c.req.raw.headers)
    if (!receipt) {
      return c.json(
        {
          error: 'payment required',
          payment: 'x402',
          resource: options.resource,
          priceUsdc: options.priceUsdc,
        },
        402,
      )
    }

    const receiptHash = sha256(toBytes(receipt))
    const existing = await c.env.AUCTION_DB
      .prepare('SELECT receipt_hash FROM x402_receipts WHERE receipt_hash = ?')
      .bind(receiptHash)
      .first()

    if (existing) {
      return c.json({ error: 'duplicate x402 receipt' }, 409)
    }

    await c.env.AUCTION_DB
      .prepare('INSERT INTO x402_receipts (receipt_hash, used_at) VALUES (?, ?)')
      .bind(receiptHash, Math.floor(Date.now() / 1000))
      .run()

    await next()
  }
}
