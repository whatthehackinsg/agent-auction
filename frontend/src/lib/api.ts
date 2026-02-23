// API client for auction engine
export const API_BASE_URL = process.env.NEXT_PUBLIC_ENGINE_URL || 'http://localhost:8787'

export async function fetcher<T>(url: string): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${url}`)
  if (!res.ok) {
    const error = new Error('API request failed')
    throw error
  }
  return res.json() as Promise<T>
}