import { ENGINE_URL, X402_ENABLED, publicClient } from './config'
import { x402Client, wrapFetchWithPayment } from '@x402/fetch'
import { registerExactEvmScheme } from '@x402/evm/exact/client'
import type { Address, Hex } from 'viem'
import type { WalletSignerAdapter } from './wallet-adapter'

export function nowTag(): string {
  return new Date().toISOString()
}

export function logStep(step: string, message: string): void {
  // Required by plan: timestamped logs for demo video.
  console.log(`[${nowTag()}] [${step}] ${message}`)
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function randomBytes32Hex(): `0x${string}` {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return (`0x${[...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')}`) as `0x${string}`
}

// x402 auto-payment: initialized lazily via initX402()
let x402Fetch: typeof fetch | null = null

export async function initX402(signer: WalletSignerAdapter) {
  if (!X402_ENABLED) return
  const address = await signer.getAddress()
  const client = new x402Client()
  registerExactEvmScheme(client, {
    signer: {
      address,
      signTypedData: async (payload) => signer.signTypedData({
        domain: payload.domain as Record<string, unknown>,
        types: payload.types as Record<string, Array<{ name: string; type: string }>>,
        primaryType: payload.primaryType,
        message: payload.message as Record<string, unknown>,
      }),
      readContract: async (args) => publicClient.readContract({
        address: args.address,
        abi: args.abi as readonly unknown[],
        functionName: args.functionName as never,
        args: args.args as readonly unknown[] | undefined,
      }),
    },
  })
  x402Fetch = wrapFetchWithPayment(fetch, client)
  logStep('x402', `auto-payment enabled for ${address} via ${signer.provider}`)
}

function randomNonceHex(bytes = 8): string {
  const raw = new Uint8Array(bytes)
  crypto.getRandomValues(raw)
  return [...raw].map((value) => value.toString(16).padStart(2, '0')).join('')
}

export async function signOnboardingChallenge(params: {
  signer: WalletSignerAdapter
  agentId: bigint
}): Promise<{ wallet: Address; challenge: string; signature: Hex }> {
  const wallet = await params.signer.getAddress()
  const issuedAt = Math.floor(Date.now() / 1000)
  const challenge = `agent-auction:onboard:${params.agentId.toString()}:${issuedAt}:${randomNonceHex()}`
  const signature = await params.signer.signMessage(challenge)
  return { wallet, challenge, signature }
}

export async function engineFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const fetchFn = x402Fetch ?? fetch
  const res = await fetchFn(`${ENGINE_URL}${path}`, init)
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Engine request failed (${res.status}) ${path}: ${text}`)
  }
  return (await res.json()) as T
}
