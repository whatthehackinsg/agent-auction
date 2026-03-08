import { x402Client, x402HTTPClient } from '@x402/core/client'
import { registerExactEvmScheme } from '@x402/evm/exact/client'
import type { ClientEvmSigner } from '@x402/evm'
import {
  buildX402AccessTypedData,
  X402_ACCESS_ISSUED_AT_HEADER,
  X402_ACCESS_SIGNATURE_HEADER,
  type X402AccessScope,
} from '@agent-auction/crypto/x402-access'
import type { ServerConfig } from './config.js'
import { createBaseSepoliaPublicClient } from './onchain.js'
import { getEvmWalletProvider, type WalletWriteBackend } from './wallet-backend.js'

export interface X402HttpClientLike {
  getPaymentRequiredResponse(
    getHeader: (name: string) => string | null | undefined,
    body?: unknown,
  ): unknown
  createPaymentPayload(paymentRequired: unknown): Promise<unknown>
  encodePaymentSignatureHeader(paymentPayload: unknown): Record<string, string>
}

export interface X402ReadAuthDeps {
  getWalletBackend?: (config: ServerConfig) => Promise<WalletWriteBackend>
  createPublicClient?: typeof createBaseSepoliaPublicClient
  createHttpClient?: (signer: ClientEvmSigner) => X402HttpClientLike
  now?: () => number
}

export function resolveX402ReadScope(path: string): X402AccessScope | null {
  if (path === '/auctions') {
    return 'discovery'
  }

  const detailMatch = path.match(/^\/auctions\/([^/]+)$/)
  if (!detailMatch) {
    return null
  }

  return `auction:${detailMatch[1]}`
}

export async function buildX402AccessHeaders(
  config: ServerConfig,
  path: string,
  deps: X402ReadAuthDeps = {},
): Promise<Record<string, string>> {
  const scope = resolveX402ReadScope(path)
  if (!scope) {
    return {}
  }

  const walletBackend = await (deps.getWalletBackend ?? getEvmWalletProvider)(config)
  const issuedAt = Math.floor((deps.now ?? Date.now)() / 1000)
  const typedData = buildX402AccessTypedData({
    scope,
    engineOrigin: config.engineUrl,
    issuedAt,
  })

  const signature = await walletBackend.signTypedData(typedData)
  return {
    [X402_ACCESS_ISSUED_AT_HEADER]: String(issuedAt),
    [X402_ACCESS_SIGNATURE_HEADER]: signature,
  }
}

export async function createX402PaymentHeaders(
  config: ServerConfig,
  response: Response,
  deps: X402ReadAuthDeps = {},
): Promise<Record<string, string>> {
  const httpClient = await createX402HttpClient(config, deps)
  const paymentRequired = httpClient.getPaymentRequiredResponse((name) => response.headers.get(name))
  const paymentPayload = await httpClient.createPaymentPayload(paymentRequired)
  return httpClient.encodePaymentSignatureHeader(paymentPayload)
}

export async function createX402HttpClient(
  config: ServerConfig,
  deps: X402ReadAuthDeps = {},
): Promise<X402HttpClientLike> {
  if (!config.baseSepoliaRpc) {
    throw new Error('BASE_SEPOLIA_RPC is required for x402 buyer mode')
  }

  const walletBackend = await (deps.getWalletBackend ?? getEvmWalletProvider)(config)
  const publicClient = (deps.createPublicClient ?? createBaseSepoliaPublicClient)(config.baseSepoliaRpc)

  const signer: ClientEvmSigner = {
    address: walletBackend.wallet,
    signTypedData: (typedData) => walletBackend.signTypedData(typedData),
    readContract: (args) => publicClient.readContract(args as never),
  }

  if (deps.createHttpClient) {
    return deps.createHttpClient(signer)
  }

  const client = new x402Client()
  registerExactEvmScheme(client, { signer })
  return new x402HTTPClient(client)
}
