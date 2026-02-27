export interface PinIpfsResult {
  cid: string | null
  error?: string
}

function toErrorBody(body: string | undefined): string {
  if (!body) {
    return 'no response body'
  }
  return body.length > 1024 ? `${body.slice(0, 1024)}...` : body
}

function parseCid(json: unknown): string | null {
  if (!json || typeof json !== 'object') {
    return null
  }

  const record = json as Record<string, unknown>
  if (typeof record.IpfsHash === 'string') {
    return record.IpfsHash
  }

  const data = record.data
  if (data && typeof data === 'object') {
    const cid = (data as Record<string, unknown>).cid
    if (typeof cid === 'string') {
      return cid
    }
  }

  return null
}

/**
 * Best-effort pinning to IPFS via Pinata.
 *
 * Fallback behavior:
 * - Missing PINATA_API_KEY => returns { cid: null }
 * - Network/API failure => returns { cid: null, error }
 */
export async function pinToIpfs(
  payload: Uint8Array,
  options: {
    pinataJwt?: string
    fileName?: string
    fetchImpl?: typeof fetch
  },
): Promise<PinIpfsResult> {
  if (!options.pinataJwt) {
    return { cid: null, error: 'PINATA_API_KEY not configured' }
  }

  const fetchImpl = options.fetchImpl ?? fetch
  const form = new FormData()
  const bytes = new Uint8Array(payload.byteLength)
  bytes.set(payload)
  const blob = new Blob([bytes.buffer], { type: 'application/octet-stream' })
  form.append('file', blob, options.fileName ?? 'replay-bundle.bin')

  try {
    const res = await fetchImpl('https://api.pinata.cloud/pinning/pinFileToIPFS', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${options.pinataJwt}`,
      },
      body: form,
    })

    if (!res.ok) {
      const body = await res.text()
      return {
        cid: null,
        error: `Pinata upload failed status=${res.status} body=${toErrorBody(body)}`,
      }
    }

    const json = (await res.json()) as unknown
    const cid = parseCid(json)
    if (!cid) {
      return {
        cid: null,
        error: 'Pinata response missing CID (expected IpfsHash or data.cid)',
      }
    }

    return { cid }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { cid: null, error: `Pinata request failed: ${message}` }
  }
}

/** @deprecated Use `pinToIpfs` instead */
export const pinReplayBundleToIpfs = pinToIpfs
