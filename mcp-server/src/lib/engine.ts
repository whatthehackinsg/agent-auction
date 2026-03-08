/**
 * HTTP client for the auction engine API.
 *
 * Thin wrapper around fetch that:
 * - Prepends the engine base URL
 * - Parses JSON responses
 * - Throws descriptive errors on non-OK status
 */

import type { ServerConfig } from './config.js'
import {
  buildX402AccessHeaders,
  createX402PaymentHeaders,
  resolveX402ReadScope,
} from './x402-read-auth.js'

export interface EngineClientDeps {
  fetchImpl?: typeof fetch
  buildAccessHeaders?: typeof buildX402AccessHeaders
  createPaymentHeaders?: typeof createX402PaymentHeaders
}

export class EngineClient {
  private readonly fetchImpl: typeof fetch

  constructor(
    private readonly config: ServerConfig,
    private readonly deps: EngineClientDeps = {},
  ) {
    this.fetchImpl = deps.fetchImpl ?? fetch
  }

  async fetch<T>(path: string, init?: RequestInit): Promise<T> {
    const url = `${this.config.engineUrl}${path}`
    const method = (init?.method ?? 'GET').toUpperCase()
    const scope = method === 'GET' ? resolveX402ReadScope(path) : null
    const headers = new Headers(init?.headers)

    if (scope) {
      if (this.config.engineReadMode === 'admin-bypass') {
        if (this.config.engineAdminKey) {
          headers.set('X-ENGINE-ADMIN-KEY', this.config.engineAdminKey)
        }
      } else {
        const accessHeaders = await (this.deps.buildAccessHeaders ?? buildX402AccessHeaders)(
          this.config,
          path,
        )
        for (const [key, value] of Object.entries(accessHeaders)) {
          headers.set(key, value)
        }
      }
    }

    let res = await this.fetchImpl(url, { ...init, headers })

    if (scope && this.config.engineReadMode === 'x402-buyer' && res.status === 402) {
      const paymentHeaders = await (this.deps.createPaymentHeaders ?? createX402PaymentHeaders)(
        this.config,
        res,
      )
      const retryHeaders = new Headers(init?.headers)
      for (const [key, value] of Object.entries(paymentHeaders)) {
        retryHeaders.set(key, value)
      }
      res = await this.fetchImpl(url, { ...init, headers: retryHeaders })
    }

    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Engine ${init?.method ?? 'GET'} ${path} failed (${res.status}): ${text}`)
    }
    return (await res.json()) as T
  }

  async get<T>(path: string): Promise<T> {
    return this.fetch<T>(path)
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return this.fetch<T>(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  }
}
