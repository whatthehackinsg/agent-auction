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
  const pc = options?.publicClientLike ?? publicClient
  const wc = options?.walletClientLike ?? createSequencerClient(sequencerPrivateKey)
  const now = options?.now ?? Math.floor(Date.now() / 1000)

  const pending = await db
    .prepare(
      "SELECT auction_id, agent_id, depositor, amount, requested_at FROM bond_observations WHERE status = 'PENDING' ORDER BY requested_at ASC",
    )
    .all<PendingBond>()

  if ((pending.results ?? []).length === 0) {
    return 0
  }

  const transferEvent = erc20Abi.find((x) => x.type === 'event' && x.name === 'Transfer')
  const getLogs = (pc as {
    getLogs: (args: unknown) => Promise<Array<{
      args?: { from?: string; to?: string; value?: bigint }
      transactionHash?: `0x${string}`
      logIndex?: number
    }>>
  }).getLogs

  const logs = await getLogs({
    address: ADDRESSES.mockUSDC,
    event: transferEvent,
    fromBlock: options?.fromBlock,
    toBlock: 'latest',
  })

  let confirmed = 0

  for (const p of pending.results ?? []) {
    const requiredAmount = BigInt(p.amount)
    const match = logs.find((log) => {
      const from = (log.args?.from ?? '').toLowerCase()
      const to = (log.args?.to ?? '').toLowerCase()
      const value = log.args?.value ?? 0n
      return (
        from === p.depositor.toLowerCase() &&
        to === ADDRESSES.auctionEscrow.toLowerCase() &&
        value >= requiredAmount
      )
    })

    if (!match || !match.transactionHash || match.logIndex === undefined) {
      continue
    }

    await wc.writeContract({
      address: ADDRESSES.auctionEscrow,
      abi: auctionEscrowAbi,
      functionName: 'recordBond',
      args: [
        p.auction_id as `0x${string}`,
        BigInt(p.agent_id),
        p.depositor as `0x${string}`,
        requiredAmount,
        match.transactionHash,
        BigInt(match.logIndex),
      ],
    })

    await db
      .prepare(
        `UPDATE bond_observations
         SET status = 'CONFIRMED', confirmed_at = ?, observed_tx_hash = ?, observed_log_index = ?
         WHERE auction_id = ? AND agent_id = ?`,
      )
      .bind(now, match.transactionHash, match.logIndex, p.auction_id, p.agent_id)
      .run()

    confirmed += 1
  }

  return confirmed
}
