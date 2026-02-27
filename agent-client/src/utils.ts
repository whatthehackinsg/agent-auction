import { ENGINE_URL, X402_ENABLED } from './config'
import { x402Client, wrapFetchWithPayment } from '@x402/fetch'
import { registerExactEvmScheme } from '@x402/evm/exact/client'
import { privateKeyToAccount } from 'viem/accounts'

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

export function initX402(privateKey: `0x${string}`) {
  if (!X402_ENABLED) return
  const signer = privateKeyToAccount(privateKey)
  const client = new x402Client()
  registerExactEvmScheme(client, { signer })
  x402Fetch = wrapFetchWithPayment(fetch, client)
  logStep('x402', `auto-payment enabled for ${signer.address}`)
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
