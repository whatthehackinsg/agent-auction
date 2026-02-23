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
