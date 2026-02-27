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
