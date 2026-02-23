import { formatUnits } from 'viem'
import {
  createDeployerClients,
  createWalletForPrivateKey,
  getAgentPrivateKeys,
} from './config'
import {
  claimRefund,
  createAuction,
  getWinner,
  joinAuction,
  placeBid,
  postBond,
  waitForSettlement,
} from './auction'
import { fundWithUSDC, getUsdcBalance, registerIdentity } from './identity'
import { deployWallet } from './wallet'
import { logStep, sleep } from './utils'

type AgentRun = {
  name: string
  agentId: bigint
  eoaAddress: `0x${string}`
  walletClient: ReturnType<typeof createWalletForPrivateKey>['walletClient']
  smartWallet: `0x${string}`
}

const USDC = BigInt(1_000_000)

async function main() {
  const started = Date.now()
  logStep('demo', 'starting 3-agent lifecycle demo')

  const deployer = createDeployerClients()
  const privateKeys = getAgentPrivateKeys().slice(0, 3)

  const agentIds = [BigInt(1001), BigInt(1002), BigInt(1003)]
  const labels = ['Agent-A', 'Agent-B', 'Agent-C'] as const

  const runs: AgentRun[] = []

  const auction = await createAuction({
    reservePrice: BigInt(80) * USDC,
    depositAmount: BigInt(50) * USDC,
    deadlineSecFromNow: 60,
  })
  logStep('auction', `created ${auction.auctionId}`)

  for (let i = 0; i < 3; i++) {
    const signer = createWalletForPrivateKey(privateKeys[i])
    const smartWallet = await deployWallet(signer.account.address, BigInt(100 + i))

    await registerIdentity(agentIds[i], signer.account.address)
    await fundWithUSDC(signer.account.address, BigInt(200) * USDC)

    const balance = await getUsdcBalance(signer.account.address)
    logStep('funding', `${labels[i]} balance=${formatUnits(balance, 6)} USDC`) 

    runs.push({
      name: labels[i],
      agentId: agentIds[i],
      eoaAddress: signer.account.address,
      walletClient: signer.walletClient,
      smartWallet,
    })
    logStep('agent', `${labels[i]} ready eoa=${signer.account.address} smart=${smartWallet}`)
  }

  for (const agent of runs) {
    await postBond({
      walletClient: agent.walletClient,
      walletAddress: agent.eoaAddress,
      auctionId: auction.auctionId,
      amount: BigInt(50) * USDC,
    })
    logStep('bond', `${agent.name} bond posted`)

    await joinAuction({
      auctionId: auction.auctionId,
      agentId: agent.agentId,
      wallet: agent.eoaAddress,
      bondAmount: BigInt(50) * USDC,
      nonce: 0,
    })
    logStep('join', `${agent.name} joined auction`) 
  }

  await placeBid({
    auctionId: auction.auctionId,
    agentId: runs[0].agentId,
    wallet: runs[0].eoaAddress,
    amount: BigInt(100) * USDC,
    nonce: 0,
  })
  logStep('bid', 'Agent-A bid 100 USDC')
  await sleep(800)

  await placeBid({
    auctionId: auction.auctionId,
    agentId: runs[1].agentId,
    wallet: runs[1].eoaAddress,
    amount: BigInt(150) * USDC,
    nonce: 0,
  })
  logStep('bid', 'Agent-B bid 150 USDC')
  await sleep(800)

  await placeBid({
    auctionId: auction.auctionId,
    agentId: runs[2].agentId,
    wallet: runs[2].eoaAddress,
    amount: BigInt(120) * USDC,
    nonce: 0,
  })
  logStep('bid', 'Agent-C bid 120 USDC')

  if (process.env.SKIP_SETTLEMENT_WAIT === '1') {
    logStep('settlement', 'SKIP_SETTLEMENT_WAIT=1 set, skipping settlement verification')
  } else {
    logStep('settlement', 'waiting for on-chain SETTLED state')
    await waitForSettlement(auction.auctionId, 120_000)

    const winner = await getWinner(auction.auctionId)
    logStep(
      'settlement',
      `winner on-chain agentId=${winner.agentId.toString()} amount=${formatUnits(winner.amount, 6)} USDC`,
    )

    if (winner.agentId !== runs[1].agentId) {
      throw new Error(
        `unexpected winner: expected Agent-B (${runs[1].agentId.toString()}), got ${winner.agentId.toString()}`,
      )
    }

    await claimRefund({
      walletClient: deployer.walletClient,
      caller: deployer.account.address,
      auctionId: auction.auctionId,
      agentId: runs[0].agentId,
    })
    logStep('refund', 'Agent-A refund claimed')

    await claimRefund({
      walletClient: deployer.walletClient,
      caller: deployer.account.address,
      auctionId: auction.auctionId,
      agentId: runs[2].agentId,
    })
    logStep('refund', 'Agent-C refund claimed')
  }

  const elapsed = ((Date.now() - started) / 1000).toFixed(1)
  logStep('demo', `completed in ${elapsed}s`) 
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err)
  logStep('fatal', message)
  process.exitCode = 1
})
