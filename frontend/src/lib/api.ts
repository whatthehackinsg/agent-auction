// API client for auction engine
const configuredApiBaseUrl = process.env.NEXT_PUBLIC_ENGINE_URL

if (process.env.NODE_ENV === 'production' && !configuredApiBaseUrl) {
  throw new Error('NEXT_PUBLIC_ENGINE_URL must be set for production builds')
}

export const API_BASE_URL = configuredApiBaseUrl ?? 'http://localhost:8787'

export async function fetcher<T>(url: string): Promise<T> {
  const res = await fetch(`/api/admin${url}`)
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    const detail = text ? ` body=${text.slice(0, 300)}` : ''
    const error = new Error(`API request failed: status=${res.status}${detail}`)
    throw error
  }
  return res.json() as Promise<T>
}

/** Fetch wrapper for admin-gated engine endpoints.
 *  Routes through /api/admin/* server proxy so the admin key
 *  never reaches the browser. */
export async function adminFetcher<T>(
  url: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`/api/admin${url}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    const detail = text ? ` body=${text.slice(0, 300)}` : ''
    throw new Error(`API request failed: status=${res.status}${detail}`)
  }
  return res.json() as Promise<T>
}
