import type { MiddlewareHandler } from 'hono'
import { paymentMiddleware, x402ResourceServer } from '@x402/hono'
import { ExactEvmScheme } from '@x402/evm/exact/server'
import { HTTPFacilitatorClient } from '@x402/core/server'

type X402Config = {
  receiverAddress: `0x${string}`
  facilitatorUrl: string
}

const DEFAULT_FACILITATOR_URL = 'https://www.x402.org/facilitator'

export function createX402Middleware(config: X402Config): MiddlewareHandler {
  const facilitatorClient = new HTTPFacilitatorClient({
    url: config.facilitatorUrl || DEFAULT_FACILITATOR_URL,
  })

  const server = new x402ResourceServer(facilitatorClient)
    .register('eip155:84532', new ExactEvmScheme())

  return paymentMiddleware(
    {
      'GET /auctions/[id]/manifest': {
        accepts: [{
          scheme: 'exact',
          price: '$0.001',
          network: 'eip155:84532',
          payTo: config.receiverAddress,
        }],
        description: 'Auction manifest',
        mimeType: 'application/json',
      },
      'GET /auctions/[id]/events': {
        accepts: [{
          scheme: 'exact',
          price: '$0.0001',
          network: 'eip155:84532',
          payTo: config.receiverAddress,
        }],
        description: 'Auction event log',
        mimeType: 'application/json',
      },
    },
    server,
  )
}

/**
 * Extract auction ID from a request path like `/auctions/<id>/manifest` or `/auctions/<id>/events`.
 * Returns null if the path doesn't match the expected pattern.
 */
export function extractAuctionIdFromPath(path: string): string | null {
  const match = path.match(/^\/auctions\/([^/]+)\/(manifest|events)/)
  return match ? match[1] : null
}

export type DynamicX402Config = {
  facilitatorUrl: string
  getAuctionPolicy: (auctionId: string) => Promise<{
    receiverAddress: `0x${string}`
    priceManifest: string
    priceEvents: string
  }>
}

/**
 * Create a dynamic x402 middleware that resolves per-auction pricing at request time.
 * Uses DynamicPrice / DynamicPayTo callbacks from @x402/core — the price and payTo
 * are functions that receive the request context and return the value.
 */
export function createDynamicX402Middleware(config: DynamicX402Config): MiddlewareHandler {
  const facilitatorClient = new HTTPFacilitatorClient({
    url: config.facilitatorUrl || DEFAULT_FACILITATOR_URL,
  })

  const server = new x402ResourceServer(facilitatorClient)
    .register('eip155:84532', new ExactEvmScheme())

  // Dynamic callbacks receive HTTPRequestContext { adapter, path, method, paymentHeader? }
  // and return per-auction pricing/receiver by extracting the auction ID from ctx.path.
  const dynamicPayTo = async (ctx: { path: string }) => {
    const auctionId = extractAuctionIdFromPath(ctx.path)
    if (!auctionId) return '0x0000000000000000000000000000000000000000'
    const policy = await config.getAuctionPolicy(auctionId)
    return policy.receiverAddress
  }

  const dynamicManifestPrice = async (ctx: { path: string }) => {
    const auctionId = extractAuctionIdFromPath(ctx.path)
    if (!auctionId) return '$0.001'
    const policy = await config.getAuctionPolicy(auctionId)
    return policy.priceManifest
  }

  const dynamicEventsPrice = async (ctx: { path: string }) => {
    const auctionId = extractAuctionIdFromPath(ctx.path)
    if (!auctionId) return '$0.0001'
    const policy = await config.getAuctionPolicy(auctionId)
    return policy.priceEvents
  }

  return paymentMiddleware(
    {
      'GET /auctions/[id]/manifest': {
        accepts: [{
          scheme: 'exact',
          price: dynamicManifestPrice,
          network: 'eip155:84532',
          payTo: dynamicPayTo,
        }],
        description: 'Auction manifest',
        mimeType: 'application/json',
      },
      'GET /auctions/[id]/events': {
        accepts: [{
          scheme: 'exact',
          price: dynamicEventsPrice,
          network: 'eip155:84532',
          payTo: dynamicPayTo,
        }],
        description: 'Auction event log',
        mimeType: 'application/json',
      },
    },
    server,
  )
}
