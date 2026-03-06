import {
  F_MODULUS,
  buildPoseidonMerkleTree,
  computeLeafHash,
  generateBidRangeProof,
  generateMembershipProof,
  getMerkleProof,
  type Groth16Proof,
} from '@agent-auction/crypto'
import { toHex } from 'viem'
import { verifyBidRangeProof, verifyMembershipProof } from '../lib/crypto'

export interface TestProofPayload {
  proof: Groth16Proof
  publicSignals: string[]
}

type SparseTreeResult = Awaited<ReturnType<typeof buildPoseidonMerkleTree>> & {
  zeroHashes: bigint[]
}

const membershipProofCache = new Map<string, Promise<TestProofPayload>>()
const bidRangeProofCache = new Map<string, Promise<TestProofPayload>>()
let warmupPromise: Promise<void> | null = null

function normalizeField(value: bigint): bigint {
  return (value % (F_MODULUS - 1n)) + 1n
}

function membershipCacheKey(agentId: bigint, treeIndex: number): string {
  return `${agentId}:${treeIndex}`
}

function bidRangeCacheKey(agentId: bigint, amount: bigint, minBid: bigint, maxBid: bigint): string {
  return `${agentId}:${amount}:${minBid}:${maxBid}`
}

function deriveAgentSecret(agentId: bigint, treeIndex: number): bigint {
  return normalizeField(agentId * 1_000_003n + BigInt(treeIndex) + 17n)
}

function deriveAuctionId(agentId: bigint, treeIndex: number): bigint {
  return agentId * 10_000n + BigInt(treeIndex + 1)
}

function deriveCapabilityId(agentId: bigint, leafIndex: number): bigint {
  return agentId * 1_000n + BigInt(leafIndex + 1)
}

function deriveBidSalt(agentId: bigint, amount: bigint, minBid: bigint, maxBid: bigint): bigint {
  return normalizeField(agentId ^ amount ^ minBid ^ maxBid ^ 0x5a5an)
}

function toBytes32Hex(value: bigint): `0x${string}` {
  return toHex(value, { size: 32 })
}

async function buildMembershipTree(agentId: bigint, treeIndex: number): Promise<{
  agentSecret: bigint
  capabilityId: bigint
  leafIndex: bigint
  auctionId: bigint
  registryRoot: bigint
  pathElements: bigint[]
  pathIndices: number[]
}> {
  const leafCount = treeIndex + 1
  const agentSecret = deriveAgentSecret(agentId, treeIndex)
  const leafHashes: bigint[] = []

  for (let index = 0; index < leafCount; index += 1) {
    const capabilityId = deriveCapabilityId(agentId, index)
    const leafHash = await computeLeafHash(capabilityId, agentSecret, BigInt(index))
    leafHashes.push(leafHash)
  }

  const tree = (await buildPoseidonMerkleTree(leafHashes)) as SparseTreeResult
  const merkleProof = getMerkleProof(treeIndex, tree.layers, tree.zeroHashes)

  return {
    agentSecret,
    capabilityId: deriveCapabilityId(agentId, treeIndex),
    leafIndex: BigInt(treeIndex),
    auctionId: deriveAuctionId(agentId, treeIndex),
    registryRoot: tree.root,
    pathElements: merkleProof.pathElements,
    pathIndices: merkleProof.pathIndices,
  }
}

export async function generateTestMembershipProof(
  agentId: bigint,
  treeIndex: number,
  expectedRegistryRoot?: bigint,
): Promise<TestProofPayload> {
  const key = membershipCacheKey(agentId, treeIndex)
  let cached = membershipProofCache.get(key)
  if (!cached) {
    cached = (async () => {
      const membershipFixture = await buildMembershipTree(agentId, treeIndex)

      if (
        expectedRegistryRoot !== undefined
        && expectedRegistryRoot !== membershipFixture.registryRoot
      ) {
        throw new Error(
          `Expected registryRoot ${expectedRegistryRoot} does not match generated root ${membershipFixture.registryRoot}`,
        )
      }

      const proofPayload = await generateMembershipProof({
        agentSecret: membershipFixture.agentSecret,
        capabilityId: membershipFixture.capabilityId,
        leafIndex: membershipFixture.leafIndex,
        pathElements: membershipFixture.pathElements,
        pathIndices: membershipFixture.pathIndices,
        auctionId: membershipFixture.auctionId,
        registryRoot: membershipFixture.registryRoot,
      })

      const verified = await verifyMembershipProof(proofPayload, {
        requireProof: true,
        expectedRegistryRoot: toBytes32Hex(membershipFixture.registryRoot),
      })

      if (!verified.valid) {
        throw new Error(
          `Generated membership proof did not pass engine verification: ${JSON.stringify(verified)}`,
        )
      }

      return proofPayload
    })()

    membershipProofCache.set(key, cached)
  }

  return cached
}

export async function generateTestBidRangeProof(
  agentId: bigint,
  amount: bigint,
  minBid: bigint,
  maxBid: bigint,
): Promise<TestProofPayload> {
  const key = bidRangeCacheKey(agentId, amount, minBid, maxBid)
  let cached = bidRangeProofCache.get(key)
  if (!cached) {
    cached = (async () => {
      const effectiveMaxBid = maxBid === 0n ? 2n ** 48n : maxBid
      const proofPayload = await generateBidRangeProof({
        bid: amount,
        salt: deriveBidSalt(agentId, amount, minBid, effectiveMaxBid),
        reservePrice: minBid,
        maxBudget: effectiveMaxBid,
      })

      const verified = await verifyBidRangeProof(proofPayload, { requireProof: true })
      if (!verified.valid) {
        throw new Error(
          `Generated bid range proof did not pass engine verification: ${JSON.stringify(verified)}`,
        )
      }

      return proofPayload
    })()

    bidRangeProofCache.set(key, cached)
  }

  return cached
}

export async function setupTestProofs(): Promise<void> {
  if (!warmupPromise) {
    warmupPromise = Promise.all([
      generateTestMembershipProof(1n, 0),
      generateTestBidRangeProof(1n, 2_000_000n, 1_000_000n, 3_000_000n),
    ]).then(() => undefined)
  }

  await warmupPromise
}
