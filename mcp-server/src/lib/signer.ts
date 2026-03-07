/**
 * EIP-712 signing using viem's privateKeyToAccount.
 *
 * Implements the same domain/types as the engine and agent-client
 * to produce valid signatures for JOIN, BID, BID_COMMIT, and REVEAL actions.
 */

import {
  type Address,
  type Hex,
  encodeAbiParameters,
  keccak256,
  toBytes,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { MEMBERSHIP_SIGNALS } from '@agent-auction/crypto'

export interface ActionSigningAccount {
  address: Address
  signTypedData(typedData: unknown): Promise<Hex>
}

// ── Constants ────────────────────────────────────────────────────────────

const AUCTION_REGISTRY = '0xFEc7a05707AF85C6b248314E20FF8EfF590c3639' as const

const EIP712_DOMAIN = {
  name: 'AgentAuction' as const,
  version: '1' as const,
  chainId: 84532,
  verifyingContract: AUCTION_REGISTRY as Address,
} as const

const JOIN_TYPES = {
  Join: [
    { name: 'auctionId', type: 'uint256' },
    { name: 'nullifier', type: 'uint256' },
    { name: 'depositAmount', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
} as const

const BID_TYPES = {
  Bid: [
    { name: 'auctionId', type: 'uint256' },
    { name: 'amount', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
} as const

const BID_COMMIT_TYPES = {
  BidCommit: [
    { name: 'auctionId', type: 'uint256' },
    { name: 'bidCommitment', type: 'uint256' },
    { name: 'encryptedBidHash', type: 'bytes32' },
    { name: 'zkRangeProofHash', type: 'bytes32' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
} as const

const REVEAL_TYPES = {
  Reveal: [
    { name: 'auctionId', type: 'uint256' },
    { name: 'bid', type: 'uint256' },
    { name: 'salt', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
} as const

// ── Nullifier derivation ─────────────────────────────────────────────────

/**
 * Derive the JOIN nullifier exactly as the engine's legacy fallback does.
 *
 * nullifier = keccak256(abi.encode(agentId, auctionIdAsUint256, ActionType.JOIN=1))
 *
 * Used only when no ZK proof is available. When a ZK membership proof is provided,
 * the Poseidon nullifier from publicSignals[MEMBERSHIP_SIGNALS.NULLIFIER] is used instead.
 */
export function deriveJoinNullifier(agentId: bigint, auctionId: Hex): bigint {
  const auctionBytes = toBytes(auctionId, { size: 32 })

  let auction = 0n
  for (const b of auctionBytes) {
    auction = (auction << 8n) | BigInt(b)
  }

  const encoded = encodeAbiParameters(
    [
      { name: 'secret', type: 'uint256' },
      { name: 'auction', type: 'uint256' },
      { name: 'actionType', type: 'uint256' },
    ],
    [agentId, auction, 1n],
  )
  return BigInt(keccak256(encoded))
}

// ── Signer ───────────────────────────────────────────────────────────────

export class ActionSigner {
  private readonly signerAddress: Address
  private readonly signTypedDataImpl: (typedData: unknown) => Promise<Hex>

  constructor(source: Hex | ActionSigningAccount) {
    if (typeof source === 'string') {
      const account = privateKeyToAccount(source)
      this.signerAddress = account.address
      this.signTypedDataImpl = (typedData) => account.signTypedData(typedData as never)
      return
    }

    this.signerAddress = source.address
    this.signTypedDataImpl = source.signTypedData.bind(source)
  }

  get address(): Address {
    return this.signerAddress
  }

  /**
   * Sign a JOIN action and return the full payload for POST /auctions/:id/action.
   *
   * When proofPayload is provided, uses the Poseidon nullifier from the ZK proof
   * (publicSignals[MEMBERSHIP_SIGNALS.NULLIFIER]) — this MUST match what the engine
   * extracts from the proof to produce a valid EIP-712 signature.
   *
   * When proofPayload is absent, falls back to the keccak256 nullifier for
   * backward-compatible non-ZK joins.
   */
  async signJoin(params: {
    auctionId: Hex
    agentId: string
    bondAmount: bigint
    nonce: number
    deadlineSec?: number
    proofPayload?: { proof: unknown; publicSignals: string[] }
  }): Promise<{
    type: 'JOIN'
    agentId: string
    wallet: Address
    amount: string
    nonce: number
    deadline: string
    signature: Hex
    proof: unknown | null
  }> {
    const deadline = BigInt(Math.floor(Date.now() / 1000) + (params.deadlineSec ?? 300))

    let nullifier: bigint
    if (params.proofPayload) {
      // Use Poseidon nullifier from ZK proof — must match what engine extracts
      nullifier = BigInt(params.proofPayload.publicSignals[MEMBERSHIP_SIGNALS.NULLIFIER])
    } else {
      // Legacy keccak256 fallback for non-ZK joins
      nullifier = deriveJoinNullifier(BigInt(params.agentId), params.auctionId)
    }

    const signature = await this.signTypedDataImpl({
      domain: EIP712_DOMAIN,
      types: JOIN_TYPES,
      primaryType: 'Join',
      message: {
        auctionId: BigInt(params.auctionId),
        nullifier,
        depositAmount: params.bondAmount,
        nonce: BigInt(params.nonce),
        deadline,
      },
    })

    return {
      type: 'JOIN',
      agentId: params.agentId,
      wallet: this.signerAddress,
      amount: params.bondAmount.toString(),
      nonce: params.nonce,
      deadline: deadline.toString(),
      signature,
      proof: params.proofPayload ?? null,
    }
  }

  /**
   * Sign a BID action and return the full payload for POST /auctions/:id/action.
   */
  async signBid(params: {
    auctionId: Hex
    agentId: string
    amount: bigint
    nonce: number
    deadlineSec?: number
  }): Promise<{
    type: 'BID'
    agentId: string
    wallet: Address
    amount: string
    nonce: number
    deadline: string
    signature: Hex
  }> {
    const deadline = BigInt(Math.floor(Date.now() / 1000) + (params.deadlineSec ?? 300))

    const signature = await this.signTypedDataImpl({
      domain: EIP712_DOMAIN,
      types: BID_TYPES,
      primaryType: 'Bid',
      message: {
        auctionId: BigInt(params.auctionId),
        amount: params.amount,
        nonce: BigInt(params.nonce),
        deadline,
      },
    })

    return {
      type: 'BID',
      agentId: params.agentId,
      wallet: this.signerAddress,
      amount: params.amount.toString(),
      nonce: params.nonce,
      deadline: deadline.toString(),
      signature,
    }
  }

  /**
   * Sign a BID_COMMIT action for sealed-bid auctions.
   *
   * The bidCommitment is Poseidon(bid, salt) — computed by the caller and passed in.
   * encryptedBidHash and zkRangeProofHash are zero bytes32 (not yet implemented).
   */
  async signBidCommit(params: {
    auctionId: Hex
    agentId: string
    bidCommitment: bigint
    nonce: number
    deadlineSec?: number
  }): Promise<{
    type: 'BID_COMMIT'
    agentId: string
    wallet: Address
    amount: string
    nonce: number
    deadline: string
    signature: Hex
    bidCommitment: string
  }> {
    const deadline = BigInt(Math.floor(Date.now() / 1000) + (params.deadlineSec ?? 300))
    const zeroBytes32 = ('0x' + '00'.repeat(32)) as Hex

    const signature = await this.signTypedDataImpl({
      domain: EIP712_DOMAIN,
      types: BID_COMMIT_TYPES,
      primaryType: 'BidCommit',
      message: {
        auctionId: BigInt(params.auctionId),
        bidCommitment: params.bidCommitment,
        encryptedBidHash: zeroBytes32,
        zkRangeProofHash: zeroBytes32,
        nonce: BigInt(params.nonce),
        deadline,
      },
    })

    return {
      type: 'BID_COMMIT',
      agentId: params.agentId,
      wallet: this.signerAddress,
      amount: '0',
      nonce: params.nonce,
      deadline: deadline.toString(),
      signature,
      bidCommitment: params.bidCommitment.toString(),
    }
  }

  /**
   * Sign a REVEAL action for sealed-bid auctions.
   *
   * The bid and salt must produce Poseidon(bid, salt) === the stored bidCommitment.
   */
  async signReveal(params: {
    auctionId: Hex
    agentId: string
    bid: bigint
    salt: bigint
    nonce: number
    deadlineSec?: number
  }): Promise<{
    type: 'REVEAL'
    agentId: string
    wallet: Address
    amount: string
    revealSalt: string
    nonce: number
    deadline: string
    signature: Hex
  }> {
    const deadline = BigInt(Math.floor(Date.now() / 1000) + (params.deadlineSec ?? 300))

    const signature = await this.signTypedDataImpl({
      domain: EIP712_DOMAIN,
      types: REVEAL_TYPES,
      primaryType: 'Reveal',
      message: {
        auctionId: BigInt(params.auctionId),
        bid: params.bid,
        salt: params.salt,
        nonce: BigInt(params.nonce),
        deadline,
      },
    })

    return {
      type: 'REVEAL',
      agentId: params.agentId,
      wallet: this.signerAddress,
      amount: params.bid.toString(),
      revealSalt: params.salt.toString(),
      nonce: params.nonce,
      deadline: deadline.toString(),
      signature,
    }
  }
}
