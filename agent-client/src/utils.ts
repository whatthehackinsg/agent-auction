import { ENGINE_URL } from './config'

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

export async function engineFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${ENGINE_URL}${path}`, init)
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Engine request failed (${res.status}) ${path}: ${text}`)
  }
  return (await res.json()) as T
}
