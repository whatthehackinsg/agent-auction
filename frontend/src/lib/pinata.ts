export type PinataNetwork = 'public' | 'private'

export interface PinataUploadOptions {
  jwt: string
  fileName?: string
  network?: PinataNetwork
  groupId?: string
  name?: string
  keyValues?: Record<string, string>
  car?: boolean
  timeoutMs?: number
  useLegacyFallback?: boolean
}

export interface PinataV3Response {
  data: {
    cid: string
    id: string
    size: number
    number_of_files: number
    name?: string
    network?: PinataNetwork
    created_at?: string
    cid_version?: number
  }
}

export interface PinataLegacyResponse {
  IpfsHash: string
  PinSize: string
  Timestamp: string
  isDuplicate?: boolean
}

export type PinataUploadResult =
  | { cid: string; provider: 'v3'; raw: PinataV3Response }
  | { cid: string; provider: 'legacy'; raw: PinataLegacyResponse }

function toBlobPart(payload: Uint8Array | ArrayBuffer | string): BlobPart {
  if (typeof payload === 'string') {
    return payload
  }

  if (payload instanceof Uint8Array) {
    return payload
  }

  return new Uint8Array(payload)
}

function toErrorBody(body: string | undefined): string {
  if (!body) {
    return 'no response body'
  }

  return body.length > 1024 ? `${body.slice(0, 1024)}...` : body
}

async function parseErrorResponse(res: Response): Promise<string> {
  try {
    const body = await res.text()
    return `status=${res.status} body=${toErrorBody(body)}`
  } catch {
    return `status=${res.status} (failed to read response body)`
  }
}

function buildV3Form(
  payload: Uint8Array | ArrayBuffer | string,
  options: Pick<PinataUploadOptions, 'fileName' | 'network' | 'groupId' | 'name' | 'keyValues' | 'car'>
): FormData {
  const form = new FormData()
  const blob = new Blob([toBlobPart(payload)], { type: 'application/octet-stream' })
  const fileName = options.fileName || 'replay-bundle.bin'

  // v3 upload endpoint requires multipart/form-data with a `file` part
  form.append('file', blob, fileName)

  if (options.network) {
    form.append('network', options.network)
  }

  if (options.groupId) {
    form.append('group_id', options.groupId)
  }

  if (options.name) {
    form.append('name', options.name)
  }

  if (options.keyValues) {
    form.append('keyvalues', JSON.stringify(options.keyValues))
  }

  if (options.car !== undefined) {
    form.append('car', String(options.car))
  }

  return form
}

function buildLegacyForm(
  payload: Uint8Array | ArrayBuffer | string,
  options: Pick<PinataUploadOptions, 'fileName' | 'name' | 'keyValues'>
): FormData {
  const form = new FormData()
  const blob = new Blob([toBlobPart(payload)], { type: 'application/octet-stream' })
  const fileName = options.fileName || 'replay-bundle.bin'

  // Legacy endpoint expects `file`, with JSON-string fields for metadata/options
  form.append('file', blob, fileName)

  if (options.name || options.keyValues) {
    form.append(
      'pinataMetadata',
      JSON.stringify({
        name: options.name,
        keyvalues: options.keyValues,
      })
    )
  }

  return form
}

async function postForm(url: string, jwt: string, body: FormData, timeoutMs?: number): Promise<Response> {
  if (!timeoutMs) {
    return fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${jwt}`,
      },
      body,
    })
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    return await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${jwt}`,
      },
      body,
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timer)
  }
}

async function pinWithV3Endpoint(
  payload: Uint8Array | ArrayBuffer | string,
  options: PinataUploadOptions
): Promise<PinataUploadResult> {
  const form = buildV3Form(payload, options)
  const res = await postForm('https://uploads.pinata.cloud/v3/files', options.jwt, form, options.timeoutMs)

  if (!res.ok) {
    throw new Error(`Pinata v3 upload failed: ${await parseErrorResponse(res)}`)
  }

  const json = (await res.json()) as unknown

  if (typeof json !== 'object' || json === null || !('data' in json) || typeof (json as PinataV3Response).data?.cid !== 'string') {
    throw new Error('Pinata v3 response missing `data.cid`')
  }

  const cast = json as PinataV3Response

  return {
    cid: cast.data.cid,
    provider: 'v3',
    raw: cast,
  }
}

async function pinWithLegacyEndpoint(
  payload: Uint8Array | ArrayBuffer | string,
  options: PinataUploadOptions
): Promise<PinataUploadResult> {
  const form = buildLegacyForm(payload, options)
  const res = await postForm('https://api.pinata.cloud/pinning/pinFileToIPFS', options.jwt, form, options.timeoutMs)

  if (!res.ok) {
    throw new Error(`Pinata legacy upload failed: ${await parseErrorResponse(res)}`)
  }

  const json = (await res.json()) as unknown

  if (typeof json !== 'object' || json === null || typeof (json as PinataLegacyResponse).IpfsHash !== 'string') {
    throw new Error('Pinata legacy response missing `IpfsHash`')
  }

  const cast = json as PinataLegacyResponse

  return {
    cid: cast.IpfsHash,
    provider: 'legacy',
    raw: cast,
  }
}

export async function pinReplayBundleToPinata(
  payload: Uint8Array | ArrayBuffer | string,
  options: PinataUploadOptions
): Promise<PinataUploadResult> {
  if (!options.jwt) {
    throw new Error('Pinata JWT is required')
  }

  try {
    return await pinWithV3Endpoint(payload, options)
  } catch (error) {
    if (!options.useLegacyFallback) {
      throw error instanceof Error ? error : new Error('Pinata v3 upload failed')
    }

    try {
      return await pinWithLegacyEndpoint(payload, options)
    } catch (fallbackError) {
      const primaryMessage = error instanceof Error ? error.message : 'unknown v3 error'
      const legacyMessage = fallbackError instanceof Error ? fallbackError.message : 'unknown legacy error'
      throw new Error(`${primaryMessage} | fallback also failed: ${legacyMessage}`)
    }
  }
}

export function getPinataCid(result: PinataUploadResult): string {
  return result.cid
}
