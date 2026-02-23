import { type Address, type Hex, type WalletClient } from 'viem'
import { baseSepolia } from 'viem/chains'
import {
  ADDRESSES,
  escrowAbi,
  publicClient,
  registryAbi,
  usdcAbi,
} from './config'
import { engineFetch, logStep, randomBytes32Hex, sleep } from './utils'

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
}): Promise<CreateAuctionResponse> {
  const auctionId = randomBytes32Hex()
  const manifestHash = randomBytes32Hex()
  const deadline = Math.floor(Date.now() / 1000) + params.deadlineSecFromNow

  logStep('auction', `creating auction ${auctionId}`)
  return engineFetch<CreateAuctionResponse>('/auctions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      auctionId,
      manifestHash,
      reservePrice: params.reservePrice.toString(),
      depositAmount: params.depositAmount.toString(),
      deadline,
    }),
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
    account: params.walletAddress,
    address: ADDRESSES.mockUSDC,
    abi: usdcAbi,
    functionName: 'transfer',
    args: [ADDRESSES.auctionEscrow, params.amount],
  })
  await publicClient.waitForTransactionReceipt({ hash: txHash })
  return txHash
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
}): Promise<EngineActionResponse> {
  const payload = {
    type: 'JOIN',
    agentId: params.agentId.toString(),
    wallet: params.wallet,
    amount: params.bondAmount.toString(),
    nonce: params.nonce,
    signature: '0x',
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
}): Promise<EngineActionResponse> {
  return engineFetch<EngineActionResponse>(`/auctions/${params.auctionId}/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'BID',
      agentId: params.agentId.toString(),
      wallet: params.wallet,
      amount: params.amount.toString(),
      nonce: params.nonce,
      signature: '0x',
    }),
  })
}

export async function waitForSettlement(auctionId: `0x${string}`, timeoutMs = 120_000): Promise<void> {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    const state = await publicClient.readContract({
      address: ADDRESSES.auctionRegistry,
      abi: registryAbi,
      functionName: 'getAuctionState',
      args: [auctionId],
    })
    const numeric = Number(state)
    if (numeric === 3) {
      return
    }
    await sleep(4000)
  }
  throw new Error(`auction ${auctionId} did not settle within timeout`)
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
      account: params.caller,
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
