import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { privateKeyToAccount } from 'viem/accounts'
import {
  computeEventHash,
  computePayloadHash,
  deriveNullifier,
  verifyMembershipProof,
  verifyBidRangeProof,
  verifyActionSignature,
  AUCTION_EIP712_TYPES,
  ZERO_HASH,
} from '../src/lib/crypto'
import { EIP712_DOMAIN } from '../src/lib/addresses'

describe('Crypto Primitives', () => {
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

  describe('verifyMembershipProof', () => {
    it('returns valid when no proof is provided (backward compatible)', async () => {
      const result = await verifyMembershipProof(null)
      expect(result.valid).toBe(true)
      expect(result.registryRoot).toBe('0x00')
    })

    it('rejects null proof when requireProof is true', async () => {
      const result = await verifyMembershipProof(null, { requireProof: true })
      expect(result.valid).toBe(false)
      expect(result.registryRoot).toBe('0x00')
      expect(result.nullifier).toBe('0x00')
    })

    it('accepts null proof when requireProof is false (explicit)', async () => {
      const result = await verifyMembershipProof(null, { requireProof: false })
      expect(result.valid).toBe(true)
    })

    it('returns invalid for malformed proof payload', async () => {
      const result = await verifyMembershipProof({ garbage: true })
      expect(result.valid).toBe(false)
    })

    it('returns invalid for a proof with wrong number of public signals', async () => {
      const result = await verifyMembershipProof({
        proof: { pi_a: [], pi_b: [], pi_c: [], protocol: 'groth16', curve: 'bn128' },
        publicSignals: ['1', '2'], // needs 3
      })
      expect(result.valid).toBe(false)
    })

    it('returns invalid for a structurally valid but cryptographically wrong proof', async () => {
      const result = await verifyMembershipProof({
        proof: {
          pi_a: ['1', '2', '1'],
          pi_b: [['1', '2'], ['3', '4'], ['1', '0']],
          pi_c: ['1', '2', '1'],
          protocol: 'groth16',
          curve: 'bn128',
        },
        publicSignals: ['111', '222', '333'],
      })
      expect(result.valid).toBe(false)
    })
  })

  describe('verifyBidRangeProof', () => {
    it('returns valid when no proof is provided (backward compatible)', async () => {
      const result = await verifyBidRangeProof(null)
      expect(result.valid).toBe(true)
      expect(result.bidCommitment).toBe('0')
      expect(result.reservePrice).toBe('0')
      expect(result.maxBudget).toBe('0')
    })

    it('rejects null proof when requireProof is true', async () => {
      const result = await verifyBidRangeProof(null, { requireProof: true })
      expect(result.valid).toBe(false)
      expect(result.bidCommitment).toBe('0')
    })

    it('accepts null proof when requireProof is false (explicit)', async () => {
      const result = await verifyBidRangeProof(null, { requireProof: false })
      expect(result.valid).toBe(true)
    })

    it('returns invalid for malformed proof payload', async () => {
      const result = await verifyBidRangeProof({ garbage: true })
      expect(result.valid).toBe(false)
    })

    it('returns invalid for a proof with wrong number of public signals', async () => {
      const result = await verifyBidRangeProof({
        proof: { pi_a: [], pi_b: [], pi_c: [], protocol: 'groth16', curve: 'bn128' },
        publicSignals: ['1', '2', '3'], // needs 4
      })
      expect(result.valid).toBe(false)
    })

    it('returns invalid for a structurally valid but cryptographically wrong proof', async () => {
      const result = await verifyBidRangeProof({
        proof: {
          pi_a: ['1', '2', '1'],
          pi_b: [['1', '2'], ['3', '4'], ['1', '0']],
          pi_c: ['1', '2', '1'],
          protocol: 'groth16',
          curve: 'bn128',
        },
        publicSignals: ['1', '111', '222', '333'],
      })
      expect(result.valid).toBe(false)
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

describe('EIP-712 Signature Verification', () => {
  const TEST_PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as const
  const account = privateKeyToAccount(TEST_PRIVATE_KEY)
  const auctionId = BigInt('0x' + 'aa'.repeat(32))

  beforeEach(() => {
    // Disable stubs so real verification runs
    delete process.env.ENGINE_ALLOW_INSECURE_STUBS
  })

  afterEach(() => {
    // Re-enable stubs for other tests
    process.env.ENGINE_ALLOW_INSECURE_STUBS = 'true'
  })

  it('accepts a valid Bid signature', async () => {
    const message = {
      auctionId,
      amount: 100000000n,
      nonce: 0n,
      deadline: BigInt(Math.floor(Date.now() / 1000) + 3600),
    }

    const signature = await account.signTypedData({
      domain: EIP712_DOMAIN,
      types: { Bid: AUCTION_EIP712_TYPES.Bid },
      primaryType: 'Bid',
      message,
    })

    const valid = await verifyActionSignature({
      address: account.address,
      primaryType: 'Bid',
      message,
      signature,
    })

    expect(valid).toBe(true)
  })

  it('rejects a signature from the wrong wallet', async () => {
    const message = {
      auctionId,
      amount: 50000000n,
      nonce: 1n,
      deadline: BigInt(Math.floor(Date.now() / 1000) + 3600),
    }

    const signature = await account.signTypedData({
      domain: EIP712_DOMAIN,
      types: { Bid: AUCTION_EIP712_TYPES.Bid },
      primaryType: 'Bid',
      message,
    })

    // Verify against a different address
    const valid = await verifyActionSignature({
      address: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
      primaryType: 'Bid',
      message,
      signature,
    })

    expect(valid).toBe(false)
  })

  it('rejects a tampered message', async () => {
    const message = {
      auctionId,
      amount: 100000000n,
      nonce: 0n,
      deadline: BigInt(Math.floor(Date.now() / 1000) + 3600),
    }

    const signature = await account.signTypedData({
      domain: EIP712_DOMAIN,
      types: { Bid: AUCTION_EIP712_TYPES.Bid },
      primaryType: 'Bid',
      message,
    })

    // Tamper: change amount
    const valid = await verifyActionSignature({
      address: account.address,
      primaryType: 'Bid',
      message: { ...message, amount: 999999999n },
      signature,
    })

    expect(valid).toBe(false)
  })

  it('accepts a valid Join signature', async () => {
    const message = {
      auctionId,
      nullifier: 12345n,
      depositAmount: 0n,
      nonce: 0n,
      deadline: BigInt(Math.floor(Date.now() / 1000) + 3600),
    }

    const signature = await account.signTypedData({
      domain: EIP712_DOMAIN,
      types: { Join: AUCTION_EIP712_TYPES.Join },
      primaryType: 'Join',
      message,
    })

    const valid = await verifyActionSignature({
      address: account.address,
      primaryType: 'Join',
      message,
      signature,
    })

    expect(valid).toBe(true)
  })
})
