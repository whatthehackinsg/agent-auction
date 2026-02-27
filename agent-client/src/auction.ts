import { type Address, type Hex, type WalletClient, encodeAbiParameters, keccak256, toBytes } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { baseSepolia } from 'viem/chains'
import {
  ADDRESSES,
  escrowAbi,
  publicClient,
  registryAbi,
  usdcAbi,
} from './config'
import { engineFetch, logStep, randomBytes32Hex, sleep } from './utils'

// EIP-712 domain matching engine's EIP712_DOMAIN
const EIP712_DOMAIN = {
  name: 'AgentAuction' as const,
  version: '1' as const,
  chainId: 84532,
  verifyingContract: ADDRESSES.auctionRegistry,
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

/** Derive nullifier matching engine's deriveNullifier(wallet, auctionId, actionType=0) */
function deriveJoinNullifier(wallet: Address, auctionId: `0x${string}`): bigint {
  const walletBytes = toBytes(wallet, { size: 32 })
  const auctionBytes = toBytes(auctionId, { size: 32 })

  let secret = 0n
  for (const b of walletBytes) {
    secret = (secret << 8n) | BigInt(b)
  }
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
    [secret, auction, 0n],
  )
  return BigInt(keccak256(encoded))
}

type EngineActionResponse = {
  seq: number
  eventHash: string
  prevHash: string
  sequencerSig?: string
}

type BondStatusResponse = {
  status: 'NONE' | 'PENDING' | 'CONFIRMED' | 'TIMEOUT'
}

type CreateAuctionResponse = {
  auctionId: `0x${string}`
  createdAt: number
}

export async function createAuction(params: {
  reservePrice: bigint
  depositAmount: bigint
  deadlineSecFromNow: number
  title?: string
  description?: string
  itemImageCid?: string
  nftContract?: string
  nftTokenId?: string
  nftChainId?: number
}): Promise<CreateAuctionResponse> {
  const auctionId = randomBytes32Hex()
  const manifestHash = randomBytes32Hex()
  const deadline = Math.floor(Date.now() / 1000) + params.deadlineSecFromNow

  const body: Record<string, unknown> = {
    auctionId,
    manifestHash,
    reservePrice: params.reservePrice.toString(),
    depositAmount: params.depositAmount.toString(),
    deadline,
  }
  if (params.title !== undefined) body.title = params.title
  if (params.description !== undefined) body.description = params.description
  if (params.itemImageCid !== undefined) body.itemImageCid = params.itemImageCid
  if (params.nftContract !== undefined) body.nftContract = params.nftContract
  if (params.nftTokenId !== undefined) body.nftTokenId = params.nftTokenId
  if (params.nftChainId !== undefined) body.nftChainId = params.nftChainId

  logStep('auction', `creating auction ${auctionId}`)
  return engineFetch<CreateAuctionResponse>('/auctions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export async function uploadAuctionImage(params: {
  auctionId: string
  imageBuffer: Uint8Array
  fileName?: string
}): Promise<{ cid: string }> {
  const formData = new FormData()
  const blob = new Blob([params.imageBuffer as BlobPart])
  formData.append('image', blob, params.fileName ?? 'image.png')

  logStep('upload', `uploading image for auction ${params.auctionId}`)
  return engineFetch<{ cid: string }>(`/auctions/${params.auctionId}/image`, {
    method: 'POST',
    body: formData,
  })
}

export async function postBond(params: {
  walletClient: WalletClient
  walletAddress: Address
  auctionId: `0x${string}`
  amount: bigint
}): Promise<`0x${string}`> {
  logStep('bond', `transfer ${params.amount.toString()} from ${params.walletAddress} to escrow`)

  const txHash = await params.walletClient.writeContract({
    chain: baseSepolia,
    account: params.walletClient.account!,
    address: ADDRESSES.mockUSDC,
    abi: usdcAbi,
    functionName: 'transfer',
    args: [ADDRESSES.auctionEscrow, params.amount],
  })
  await publicClient.waitForTransactionReceipt({ hash: txHash })
  return txHash
}

export async function submitBondProof(params: {
  auctionId: `0x${string}`
  agentId: bigint
  depositor: Address
  amount: bigint
  txHash: `0x${string}`
}): Promise<void> {
  logStep('bond', `submitting bond proof txHash=${params.txHash}`)
  await engineFetch(`/auctions/${params.auctionId}/bonds`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      agentId: params.agentId.toString(),
      depositor: params.depositor,
      amount: params.amount.toString(),
      txHash: params.txHash,
    }),
  })
}

export async function waitBondObservation(
  auctionId: `0x${string}`,
  agentId: bigint,
  timeoutMs = 60_000,
): Promise<void> {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    const status = await engineFetch<BondStatusResponse>(`/auctions/${auctionId}/bonds/${agentId.toString()}`)
    if (status.status === 'CONFIRMED') {
      return
    }
    if (status.status === 'TIMEOUT') {
      throw new Error(`bond observation timed out for agent ${agentId.toString()}`)
    }
    await sleep(2000)
  }
  throw new Error(`bond observation timeout exceeded for agent ${agentId.toString()}`)
}

export async function joinAuction(params: {
  auctionId: `0x${string}`
  agentId: bigint
  wallet: Address
  bondAmount: bigint
  nonce: number
  privateKey: Hex
}): Promise<EngineActionResponse> {
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 300) // 5 min
  const nullifier = deriveJoinNullifier(params.wallet, params.auctionId)
  const account = privateKeyToAccount(params.privateKey)
  const signature = await account.signTypedData({
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

  const payload = {
    type: 'JOIN',
    agentId: params.agentId.toString(),
    wallet: params.wallet,
    amount: params.bondAmount.toString(),
    nonce: params.nonce,
    deadline: deadline.toString(),
    signature,
    proof: null,
  }

  const maxAttempts = 30
  for (let i = 1; i <= maxAttempts; i++) {
    try {
      const result = await engineFetch<EngineActionResponse>(`/auctions/${params.auctionId}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      return result
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (message.includes('bond pending')) {
        logStep('join', `agent ${params.agentId.toString()} waiting for bond observation (${i}/${maxAttempts})`)
        await sleep(2000)
        continue
      }
      if (message.includes('timeout')) {
        throw new Error(`join rejected due to bond timeout: ${message}`)
      }
      throw err
    }
  }

  throw new Error(`join failed: bond observation not confirmed for agent ${params.agentId.toString()}`)
}

export async function placeBid(params: {
  auctionId: `0x${string}`
  agentId: bigint
  wallet: Address
  amount: bigint
  nonce: number
  privateKey: Hex
}): Promise<EngineActionResponse> {
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 300)
  const account = privateKeyToAccount(params.privateKey)
  const signature = await account.signTypedData({
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

  return engineFetch<EngineActionResponse>(`/auctions/${params.auctionId}/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'BID',
      agentId: params.agentId.toString(),
      wallet: params.wallet,
      amount: params.amount.toString(),
      nonce: params.nonce,
      deadline: deadline.toString(),
      signature,
    }),
  })
}

/**
 * Wait for on-chain settlement.
 *
 * State machine: OPEN(1) → CLOSED(2) via recordResult → SETTLED(3) via CRE onReport.
 *
 * Waits up to `timeoutMs` for the auction to reach CLOSED (2) or SETTLED (3).
 * Returns the final observed state so the caller can decide how to proceed.
 */
export async function waitForSettlement(
  auctionId: `0x${string}`,
  timeoutMs = 180_000,
): Promise<{ state: number; label: string }> {
  const STATE_LABELS: Record<number, string> = {
    0: 'NONE',
    1: 'OPEN',
    2: 'CLOSED',
    3: 'SETTLED',
    4: 'CANCELLED',
  }

  const started = Date.now()
  let lastState = -1
  while (Date.now() - started < timeoutMs) {
    const state = await publicClient.readContract({
      address: ADDRESSES.auctionRegistry,
      abi: registryAbi,
      functionName: 'getAuctionState',
      args: [auctionId],
    })
    const numeric = Number(state)

    if (numeric !== lastState) {
      const elapsed = ((Date.now() - started) / 1000).toFixed(0)
      logStep('settlement', `on-chain state → ${STATE_LABELS[numeric] ?? numeric} (${elapsed}s)`)
      lastState = numeric
    }

    // SETTLED (3) — full CRE settlement complete
    if (numeric === 3) {
      return { state: 3, label: 'SETTLED' }
    }
    // CLOSED (2) — recordResult succeeded, CRE settlement pending
    // Keep polling for a while to see if CRE settles it
    if (numeric === 2) {
      // Give CRE an extra 60s to settle after CLOSED
      const closedAt = Date.now()
      while (Date.now() - closedAt < 60_000 && Date.now() - started < timeoutMs) {
        await sleep(4000)
        const s2 = await publicClient.readContract({
          address: ADDRESSES.auctionRegistry,
          abi: registryAbi,
          functionName: 'getAuctionState',
          args: [auctionId],
        })
        if (Number(s2) === 3) {
          logStep('settlement', `on-chain state → SETTLED`)
          return { state: 3, label: 'SETTLED' }
        }
      }
      // CRE didn't settle in time — still return CLOSED as partial success
      return { state: 2, label: 'CLOSED' }
    }
    await sleep(4000)
  }
  throw new Error(`auction ${auctionId} did not reach CLOSED within ${timeoutMs / 1000}s (last state: ${STATE_LABELS[lastState] ?? lastState})`)
}

export async function getWinner(auctionId: `0x${string}`): Promise<{
  agentId: bigint
  wallet: Address
  amount: bigint
}> {
  const winner = await publicClient.readContract({
    address: ADDRESSES.auctionRegistry,
    abi: registryAbi,
    functionName: 'getWinner',
    args: [auctionId],
  })

  const tuple = winner as readonly [bigint, Address, bigint]
  return {
    agentId: tuple[0],
    wallet: tuple[1],
    amount: tuple[2],
  }
}

export async function claimRefund(params: {
  walletClient: WalletClient
  caller: Address
  auctionId: Hex
  agentId: bigint
}): Promise<void> {
  try {
    const txHash = await params.walletClient.writeContract({
      chain: baseSepolia,
      account: params.walletClient.account!,
      address: ADDRESSES.auctionEscrow,
      abi: escrowAbi,
      functionName: 'claimRefund',
      args: [params.auctionId, params.agentId],
    })
    await publicClient.waitForTransactionReceipt({ hash: txHash })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (message.includes('AlreadyRefunded') || message.includes('NoBondFound')) {
      return
    }
    throw err
  }
}
