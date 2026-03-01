/**
 * HTTP client for the auction engine API.
 *
 * Thin wrapper around fetch that:
 * - Prepends the engine base URL
 * - Parses JSON responses
 * - Throws descriptive errors on non-OK status
 */

export class EngineClient {
  private readonly adminKey: string | null

  constructor(private readonly baseUrl: string, adminKey?: string | null) {
    this.adminKey = adminKey ?? null
  }

  async fetch<T>(path: string, init?: RequestInit): Promise<T> {
    const url = `${this.baseUrl}${path}`
    const headers = new Headers(init?.headers)
    if (this.adminKey) {
      headers.set('X-ENGINE-ADMIN-KEY', this.adminKey)
    }
    const res = await fetch(url, { ...init, headers })
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
