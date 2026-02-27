import { ADDRESSES } from './addresses'
import { auctionEscrowAbi, createSequencerClient, erc20Abi, publicClient } from './chain-client'

export type BondStatusKind = 'NONE' | 'PENDING' | 'CONFIRMED' | 'TIMEOUT'

export interface BondStatusResult {
  status: BondStatusKind
  auctionId: string
  agentId: string
  depositor?: string
  amount?: string
  requestedAt?: number
  confirmedAt?: number
  observedTxHash?: string
  observedLogIndex?: number
}

const DEFAULT_BOND_TIMEOUT_SECONDS = 60

type PendingBond = {
  auction_id: string
  agent_id: string
  depositor: string
  amount: string
  requested_at: number
}

type BondRow = {
  auction_id: string
  agent_id: string
  depositor: string
  amount: string
  status: string
  requested_at: number
  confirmed_at: number | null
  observed_tx_hash: string | null
  observed_log_index: number | null
}

export async function registerPendingBond(
  db: D1Database,
  params: {
    auctionId: string
    agentId: string
    depositor: string
    amount: string
    now?: number
  },
): Promise<void> {
  const now = params.now ?? Math.floor(Date.now() / 1000)
  await db
    .prepare(
      `INSERT INTO bond_observations (auction_id, agent_id, depositor, amount, status, requested_at)
       VALUES (?, ?, ?, ?, 'PENDING', ?)
       ON CONFLICT(auction_id, agent_id) DO UPDATE SET
         depositor = excluded.depositor,
         amount = excluded.amount`,
    )
    .bind(params.auctionId, params.agentId, params.depositor, params.amount, now)
    .run()
}

export async function getBondStatus(
  db: D1Database,
  auctionId: string,
  agentId: string,
  options?: { now?: number; timeoutSeconds?: number },
): Promise<BondStatusResult> {
  const now = options?.now ?? Math.floor(Date.now() / 1000)
  const timeout = options?.timeoutSeconds ?? DEFAULT_BOND_TIMEOUT_SECONDS

  const row = await db
    .prepare(
      'SELECT auction_id, agent_id, depositor, amount, status, requested_at, confirmed_at, observed_tx_hash, observed_log_index FROM bond_observations WHERE auction_id = ? AND agent_id = ?',
    )
    .bind(auctionId, agentId)
    .first<BondRow>()

  if (!row) {
    return { status: 'NONE', auctionId, agentId }
  }

  if (row.status === 'CONFIRMED') {
    return {
      status: 'CONFIRMED',
      auctionId,
      agentId,
      depositor: row.depositor,
      amount: row.amount,
      requestedAt: row.requested_at,
      confirmedAt: row.confirmed_at ?? undefined,
      observedTxHash: row.observed_tx_hash ?? undefined,
      observedLogIndex: row.observed_log_index ?? undefined,
    }
  }

  if (now - row.requested_at > timeout) {
    return {
      status: 'TIMEOUT',
      auctionId,
      agentId,
      depositor: row.depositor,
      amount: row.amount,
      requestedAt: row.requested_at,
    }
  }

  return {
    status: 'PENDING',
    auctionId,
    agentId,
    depositor: row.depositor,
    amount: row.amount,
    requestedAt: row.requested_at,
  }
}

export async function enforceJoinBondObservation(
  db: D1Database,
  params: {
    auctionId: string
    agentId: string
    wallet: string
    amount: string
    now?: number
    timeoutSeconds?: number
  },
): Promise<void> {
  const now = params.now ?? Math.floor(Date.now() / 1000)
  const timeout = params.timeoutSeconds ?? DEFAULT_BOND_TIMEOUT_SECONDS

  await registerPendingBond(db, {
    auctionId: params.auctionId,
    agentId: params.agentId,
    depositor: params.wallet,
    amount: params.amount,
    now,
  })

  const status = await getBondStatus(db, params.auctionId, params.agentId, {
    now,
    timeoutSeconds: timeout,
  })

  if (status.status === 'CONFIRMED') {
    return
  }
  if (status.status === 'TIMEOUT') {
    throw new Error('bond observation timeout (>60s)')
  }
  throw new Error('bond pending: transfer to escrow not observed yet')
}

/**
 * Verify a bond transfer by checking the TX receipt for a matching Transfer log.
 * This avoids getLogs range limits on public RPCs — works with any RPC provider.
 */
export async function verifyBondFromReceipt(
  db: D1Database,
  sequencerPrivateKey: `0x${string}`,
  params: {
    auctionId: string
    agentId: string
    depositor: string
    amount: string
    txHash: `0x${string}`
  },
  options?: {
    now?: number
    publicClientLike?: typeof publicClient
    walletClientLike?: ReturnType<typeof createSequencerClient>
  },
): Promise<boolean> {
  const pc = options?.publicClientLike ?? publicClient
  const wc = options?.walletClientLike ?? createSequencerClient(sequencerPrivateKey)
  const now = options?.now ?? Math.floor(Date.now() / 1000)
  const requiredAmount = BigInt(params.amount)

  // Retry receipt lookup — the TX may not be indexed on the engine's RPC yet
  let receipt: Awaited<ReturnType<typeof pc.getTransactionReceipt>> | null = null
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      receipt = await pc.getTransactionReceipt({ hash: params.txHash })
      if (receipt) break
    } catch {
      // receipt not found yet — will retry
    }
    if (attempt < 4) {
      await new Promise((r) => setTimeout(r, 3000))
    }
  }
  if (!receipt || receipt.status !== 'success') {
    return false
  }

  // ERC-20 Transfer topic
  const transferTopic = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'

  const match = receipt.logs.find((log) => {
    if (log.address.toLowerCase() !== ADDRESSES.mockUSDC.toLowerCase()) return false
    if (!log.topics[0] || log.topics[0] !== transferTopic) return false
    const from = log.topics[1] ? ('0x' + log.topics[1].slice(26)).toLowerCase() : ''
    const to = log.topics[2] ? ('0x' + log.topics[2].slice(26)).toLowerCase() : ''
    const value = log.data ? BigInt(log.data) : 0n
    return (
      from === params.depositor.toLowerCase() &&
      to === ADDRESSES.auctionEscrow.toLowerCase() &&
      value >= requiredAmount
    )
  })

  if (!match) return false

  const logIndex = match.logIndex ?? 0

  await wc.writeContract({
    address: ADDRESSES.auctionEscrow,
    abi: auctionEscrowAbi,
    functionName: 'recordBond',
    args: [
      params.auctionId as `0x${string}`,
      BigInt(params.agentId),
      params.depositor as `0x${string}`,
      requiredAmount,
      params.txHash,
      BigInt(logIndex),
    ],
  })

  await db
    .prepare(
      `INSERT INTO bond_observations (auction_id, agent_id, depositor, amount, status, requested_at, confirmed_at, observed_tx_hash, observed_log_index)
       VALUES (?, ?, ?, ?, 'CONFIRMED', ?, ?, ?, ?)
       ON CONFLICT(auction_id, agent_id) DO UPDATE SET
         status = 'CONFIRMED', confirmed_at = excluded.confirmed_at,
         observed_tx_hash = excluded.observed_tx_hash, observed_log_index = excluded.observed_log_index`,
    )
    .bind(params.auctionId, params.agentId, params.depositor, params.amount, now, now, params.txHash, logIndex)
    .run()

  return true
}

/**
 * @deprecated Use verifyBondFromReceipt instead — getLogs fails on public RPCs with range limits.
 */
export async function pollAndRecordBondTransfers(
  db: D1Database,
  sequencerPrivateKey: `0x${string}`,
  options?: {
    fromBlock?: bigint
    now?: number
    publicClientLike?: {
      getLogs: (args: unknown) => Promise<Array<{
        args?: { from?: string; to?: string; value?: bigint }
        transactionHash?: `0x${string}`
        logIndex?: number
      }>>
    }
    walletClientLike?: {
      writeContract: (args: unknown) => Promise<`0x${string}`>
    }
  },
): Promise<number> {
  return 0 // Disabled — use verifyBondFromReceipt
}
