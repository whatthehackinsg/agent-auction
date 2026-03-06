import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { build } from 'esbuild'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { builtinModules } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Miniflare } from 'miniflare'

const TEST_DIR = dirname(fileURLToPath(import.meta.url))
const CRYPTO_PATH = resolve(TEST_DIR, '../src/lib/crypto.ts')
const MEMBERSHIP_FIXTURE_PATH = resolve(TEST_DIR, './fixtures/membership-proof.json')
const BID_RANGE_FIXTURE_PATH = resolve(TEST_DIR, './fixtures/bidrange-proof.json')

type MembershipWorkerResult = {
  valid: boolean
  reason?: string
  detail?: string
  registryRoot?: string
  capabilityCommitment?: string
  nullifier?: string
}

type BidRangeWorkerResult = {
  valid: boolean
  bidCommitment?: string
  reservePrice?: string
  maxBudget?: string
}

let tempDir: string
let workerBundlePath: string
let mf: Miniflare

async function buildWorkerBundle(): Promise<string> {
  tempDir = await mkdtemp(join(tmpdir(), 'auction-proof-runtime-'))
  const entryPath = join(tempDir, 'proof-runtime-entry.ts')
  workerBundlePath = join(tempDir, 'proof-runtime-entry.mjs')

  await writeFile(
    entryPath,
    `
      import membershipFixture from ${JSON.stringify(MEMBERSHIP_FIXTURE_PATH)}
      import bidRangeFixture from ${JSON.stringify(BID_RANGE_FIXTURE_PATH)}
      import { verifyMembershipProof, verifyBidRangeProof } from ${JSON.stringify(CRYPTO_PATH)}

      export default {
        async fetch(request) {
          const url = new URL(request.url)

          if (url.pathname === '/membership') {
            return Response.json(await verifyMembershipProof(membershipFixture, { requireProof: true }))
          }

          if (url.pathname === '/bid-range') {
            return Response.json(await verifyBidRangeProof(bidRangeFixture, { requireProof: true }))
          }

          return new Response('not found', { status: 404 })
        },
      }
    `,
    'utf8',
  )

  const nodeBuiltinExternals = Array.from(
    new Set([
      ...builtinModules,
      ...builtinModules.map((moduleName) => `node:${moduleName}`),
    ]),
  )

  await build({
    entryPoints: [entryPath],
    bundle: true,
    format: 'esm',
    outfile: workerBundlePath,
    platform: 'neutral',
    target: 'es2022',
    mainFields: ['browser', 'module', 'main'],
    conditions: ['worker', 'browser'],
    external: nodeBuiltinExternals,
    loader: {
      '.json': 'json',
    },
    logLevel: 'silent',
  })

  return workerBundlePath
}

function expectWorkerProofVerification(
  label: string,
  result: { valid: boolean; detail?: string; reason?: string },
): void {
  if (!result.valid) {
    const reason = result.reason ? ` (${result.reason})` : ''
    const detail = result.detail ? `: ${result.detail}` : ''
    throw new Error(`${label} failed inside Worker runtime${reason}${detail}`)
  }
}

describe('Proof runtime compatibility (workerd via Miniflare)', () => {
  beforeAll(async () => {
    const bundlePath = await buildWorkerBundle()
    mf = new Miniflare({
      modules: true,
      modulesRoot: tempDir,
      scriptPath: bundlePath,
      compatibilityDate: '2024-12-01',
      compatibilityFlags: ['nodejs_compat'],
    })
  })

  afterAll(async () => {
    await mf?.dispose()
    await rm(tempDir, { recursive: true, force: true })
  })

  it('verifies a membership proof on the shared Worker loader path', async () => {
    const response = await mf.dispatchFetch('http://localhost/membership')
    expect(response.status).toBe(200)

    const result = (await response.json()) as MembershipWorkerResult
    expectWorkerProofVerification('membership proof', result)
    expect(result).toMatchObject({
      valid: true,
    })
  })

  it('verifies a bid-range proof on the shared Worker loader path', async () => {
    const response = await mf.dispatchFetch('http://localhost/bid-range')
    expect(response.status).toBe(200)

    const result = (await response.json()) as BidRangeWorkerResult
    expectWorkerProofVerification('bid-range proof', result)
    expect(result).toMatchObject({
      valid: true,
    })
  })
})
