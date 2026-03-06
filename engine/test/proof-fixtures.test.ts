import { beforeAll, describe, expect, it } from 'vitest'
import {
  generateTestBidRangeProof,
  generateTestMembershipProof,
  setupTestProofs,
} from '../src/test-helpers/proof-fixtures'
import { verifyBidRangeProof, verifyMembershipProof } from '../src/lib/crypto'

describe('proof fixture helpers', () => {
  beforeAll(async () => {
    await setupTestProofs()
  }, 120000)

  it('generates a real membership proof accepted by the engine verifier', async () => {
    const proofPayload = await generateTestMembershipProof(12345n, 0)
    const result = await verifyMembershipProof(proofPayload, { requireProof: true })

    expect(result.valid).toBe(true)
    expect(result.registryRoot).not.toBe('0x00')
    expect(result.nullifier).not.toBe('0x00')
  }, 120000)

  it('generates a real bid range proof accepted by the engine verifier', async () => {
    const proofPayload = await generateTestBidRangeProof(12345n, 2_000_000n, 1_000_000n, 3_000_000n)
    const result = await verifyBidRangeProof(proofPayload, { requireProof: true })

    expect(result.valid).toBe(true)
    expect(result.bidCommitment).not.toBe('0')
    expect(result.reservePrice).toBe('1000000')
    expect(result.maxBudget).toBe('3000000')
  }, 120000)
})
