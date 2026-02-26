import { describe, it, expect } from 'vitest'
import {
  computeEventHash,
  computePayloadHash,
  deriveNullifier,
  verifyMembershipProof,
  verifyEIP712Signature,
  ZERO_HASH,
} from '../src/lib/crypto'

describe('Crypto Stubs', () => {
  describe('computeEventHash', () => {
    it('is deterministic — same inputs produce same output', async () => {
      const hash1 = await computeEventHash(1n, ZERO_HASH, ZERO_HASH)
      const hash2 = await computeEventHash(1n, ZERO_HASH, ZERO_HASH)
      expect(hash1).toEqual(hash2)
    })

    it('different inputs produce different outputs', async () => {
      const hash1 = await computeEventHash(1n, ZERO_HASH, ZERO_HASH)
      const hash2 = await computeEventHash(2n, ZERO_HASH, ZERO_HASH)
      expect(hash1).not.toEqual(hash2)
    })

    it('returns 32 bytes', async () => {
      const hash = await computeEventHash(1n, ZERO_HASH, ZERO_HASH)
      expect(hash.length).toBe(32)
    })
  })

  describe('computePayloadHash', () => {
    it('is deterministic', () => {
      const hash1 = computePayloadHash(
        1,
        100n,
        '0x1234567890abcdef1234567890abcdef12345678',
        50000000n
      )
      const hash2 = computePayloadHash(
        1,
        100n,
        '0x1234567890abcdef1234567890abcdef12345678',
        50000000n
      )
      expect(hash1).toEqual(hash2)
    })
  })

  describe('verifyMembershipProof (stub)', () => {
    it('always returns valid', async () => {
      const result = await verifyMembershipProof(null, null)
      expect(result.valid).toBe(true)
    })
  })

  describe('verifyEIP712Signature (stub)', () => {
    it('always returns true', () => {
      expect(verifyEIP712Signature(ZERO_HASH, ZERO_HASH, '0x00')).toBe(true)
    })
  })

  describe('deriveNullifier', () => {
    it('same inputs produce same nullifier', () => {
      const secret = new Uint8Array(32).fill(1)
      const auctionId = new Uint8Array(32).fill(2)
      const n1 = deriveNullifier(secret, auctionId, 0)
      const n2 = deriveNullifier(secret, auctionId, 0)
      expect(n1).toEqual(n2)
    })
  })
})
