// API client for auction engine
const configuredApiBaseUrl = process.env.NEXT_PUBLIC_ENGINE_URL

if (process.env.NODE_ENV === 'production' && !configuredApiBaseUrl) {
  throw new Error('NEXT_PUBLIC_ENGINE_URL must be set for production builds')
}

export const API_BASE_URL = configuredApiBaseUrl ?? 'http://localhost:8787'

export async function fetcher<T>(url: string): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${url}`)
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    const detail = text ? ` body=${text.slice(0, 300)}` : ''
    const error = new Error(`API request failed: status=${res.status}${detail}`)
    throw error
  }
  return res.json() as Promise<T>
}

/** Headers for admin-gated engine endpoints */
export function adminHeaders(): Record<string, string> {
  const key = process.env.NEXT_PUBLIC_ENGINE_ADMIN_KEY
  if (!key) return {}
  return { 'X-ENGINE-ADMIN-KEY': key }
}

/** Fetch wrapper that includes admin key header */
export async function adminFetcher<T>(
  url: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${url}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...adminHeaders(),
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
