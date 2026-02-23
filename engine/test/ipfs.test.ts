import { describe, it, expect } from 'vitest'
import { pinReplayBundleToIpfs } from '../src/lib/ipfs'

describe('pinReplayBundleToIpfs (Task 26)', () => {
  it('returns null cid when PINATA key is missing', async () => {
    const result = await pinReplayBundleToIpfs(new Uint8Array([1, 2, 3]), {})
    expect(result.cid).toBeNull()
    expect(result.error).toContain('PINATA_API_KEY')
  })

  it('parses legacy IpfsHash response', async () => {
    const fetchImpl: typeof fetch = async () => {
      return new Response(JSON.stringify({ IpfsHash: 'QmLegacyCid' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const result = await pinReplayBundleToIpfs(new Uint8Array([4, 5, 6]), {
      pinataJwt: 'jwt',
      fetchImpl,
    })

    expect(result.cid).toBe('QmLegacyCid')
    expect(result.error).toBeUndefined()
  })

  it('returns null cid on failed response', async () => {
    const fetchImpl: typeof fetch = async () => {
      return new Response('bad request', { status: 400 })
    }

    const result = await pinReplayBundleToIpfs(new Uint8Array([7, 8, 9]), {
      pinataJwt: 'jwt',
      fetchImpl,
    })

    expect(result.cid).toBeNull()
    expect(result.error).toContain('status=400')
  })
})
