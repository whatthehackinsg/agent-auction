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

type WorkerResult = {
  valid: boolean
  reason?: string
  detail?: string
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

      function makeTamperedBidRangeFixture() {
        return {
          ...bidRangeFixture,
          publicSignals: [
            ...bidRangeFixture.publicSignals.slice(0, 1),
            (BigInt(bidRangeFixture.publicSignals[1]) + 1n).toString(),
            ...bidRangeFixture.publicSignals.slice(2),
          ],
        }
      }

      export default {
        async fetch(request) {
          const url = new URL(request.url)

          if (url.pathname === '/membership') {
            return Response.json(await verifyMembershipProof(membershipFixture, { requireProof: true }))
          }

          if (url.pathname === '/bid-range') {
            return Response.json(await verifyBidRangeProof(bidRangeFixture, { requireProof: true }))
          }

          if (url.pathname === '/membership-missing') {
            return Response.json(await verifyMembershipProof(null, { requireProof: true }))
          }

          if (url.pathname === '/membership-malformed') {
            return Response.json(await verifyMembershipProof({ garbage: true }, { requireProof: true }))
          }

          if (url.pathname === '/bid-range-tampered') {
            return Response.json(await verifyBidRangeProof(makeTamperedBidRangeFixture(), { requireProof: true }))
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
      '.wasm': 'copy',
    },
    logLevel: 'silent',
  })

  return workerBundlePath
}

function expectWorkerFailClosed(label: string, result: WorkerResult, reason: string): void {
  if (result.valid) {
    throw new Error(`${label} unexpectedly verified inside Worker runtime`)
  }

  expect(result.reason).toBe(reason)
}

function expectWorkerSuccess(label: string, result: WorkerResult): void {
  if (!result.valid) {
    throw new Error(
      `${label} failed inside Worker runtime (${result.reason ?? 'unknown'}): ${result.detail ?? 'no detail'}`,
    )
  }

  expect(result.reason).toBe('valid')
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
      modulesRules: [{ type: 'CompiledWasm', include: ['**/*.wasm'] }],
    })
  })

  afterAll(async () => {
    await mf?.dispose()
    await rm(tempDir, { recursive: true, force: true })
  })

  it('verifies membership proofs through the shared Worker runtime loader', async () => {
    const response = await mf.dispatchFetch('http://localhost/membership')
    expect(response.status).toBe(200)

    expectWorkerSuccess('membership proof', (await response.json()) as WorkerResult)
  })

  it('verifies bid-range proofs through the shared Worker runtime loader', async () => {
    const response = await mf.dispatchFetch('http://localhost/bid-range')
    expect(response.status).toBe(200)

    expectWorkerSuccess('bid-range proof', (await response.json()) as WorkerResult)
  })

  it('keeps missing membership proofs fail-closed inside the Worker runtime', async () => {
    const response = await mf.dispatchFetch('http://localhost/membership-missing')
    expect(response.status).toBe(200)

    expectWorkerFailClosed(
      'missing membership proof',
      (await response.json()) as WorkerResult,
      'missing_proof',
    )
  })

  it('keeps malformed membership proofs fail-closed inside the Worker runtime', async () => {
    const response = await mf.dispatchFetch('http://localhost/membership-malformed')
    expect(response.status).toBe(200)

    expectWorkerFailClosed(
      'malformed membership proof',
      (await response.json()) as WorkerResult,
      'malformed_proof',
    )
  })

  it('keeps tampered bid-range proofs fail-closed inside the Worker runtime', async () => {
    const response = await mf.dispatchFetch('http://localhost/bid-range-tampered')
    expect(response.status).toBe(200)

    expectWorkerFailClosed(
      'tampered bid-range proof',
      (await response.json()) as WorkerResult,
      'groth16_invalid',
    )
  })
})
