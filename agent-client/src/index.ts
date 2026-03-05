import { formatUnits } from 'viem'
import {
  createDeployerClients,
  RPC_URL,
} from './config'
import {
  engineFetch,
  initX402,
  logStep,
  signOnboardingChallenge,
  sleep,
} from './utils'
import {
  claimRefund,
  createAuction,
  getWinner,
  joinAuction,
  placeBid,
  postBond,
  submitBondProof,
  waitForSettlement,
} from './auction'
import { fundWithUSDC, getUsdcBalance, registerIdentity } from './identity'
import { createAgentSignerAdapters, type WalletSignerAdapter } from './wallet-adapter'
import {
  loadAgentState,
  getAgentStateFiles,
  generateMembershipProofForAgent,
  generateBidRangeProofForAgent,
  validateBidRange,
  persistNullifier,
  NullifierReusedError,
  BidOutOfRangeError,
  type AgentStateWithNullifiers,
} from './zk'
import { MEMBERSHIP_SIGNALS } from '@agent-auction/crypto'

type AgentRun = {
  name: string
  agentId: bigint
  eoaAddress: `0x${string}`
  signer: WalletSignerAdapter
  agentState: AgentStateWithNullifiers
  stateFile: string
}

const USDC = BigInt(1_000_000)
const RESERVE_PRICE = BigInt(80) * USDC
const MAX_BUDGET = BigInt(0) // uncapped — zk.ts will substitute 2^48 sentinel
const CHALLENGE_SIGN_ENABLED = process.env.ONBOARDING_CHALLENGE_SIGN === '1'

async function main() {
  const started = Date.now()
  logStep('demo', 'starting 3-agent lifecycle demo')

  const deployer = createDeployerClients()
  const signers = await createAgentSignerAdapters(3)

  // Initialize x402 auto-payment using first agent signer
  await initX402(signers[0])

  // agentIds 1, 2, 3 match the on-chain registered test-agent state files
  const agentIds = [BigInt(1), BigInt(2), BigInt(3)]
  const labels = ['Agent-A', 'Agent-B', 'Agent-C'] as const

  // Load ZK agent state files
  const stateFiles = getAgentStateFiles(3)
  const agentStates = stateFiles.map((f) => {
    const state = loadAgentState(f)
    logStep('zk', `loaded state for agentId=${state.agentId.toString()} from ${f}`)
    return state
  })

  const runs: AgentRun[] = []

  const auction = await createAuction({
    reservePrice: RESERVE_PRICE,
    depositAmount: BigInt(50) * USDC,
    deadlineSecFromNow: 60,
  })
  logStep('auction', `created ${auction.auctionId}`)

  for (let i = 0; i < 3; i++) {
    const signer = signers[i]
    const eoaAddress = await signer.getAddress()

    await registerIdentity(agentIds[i], eoaAddress)
    await fundWithUSDC(eoaAddress, BigInt(200) * USDC)

    const balance = await getUsdcBalance(eoaAddress)
    logStep('funding', `${labels[i]} balance=${formatUnits(balance, 6)} USDC`)

    runs.push({
      name: labels[i],
      agentId: agentIds[i],
      eoaAddress,
      signer,
      agentState: agentStates[i],
      stateFile: stateFiles[i],
    })
    logStep('agent', `${labels[i]} ready eoa=${eoaAddress}`)

    if (CHALLENGE_SIGN_ENABLED) {
      const proof = await signOnboardingChallenge({
        signer,
        agentId: agentIds[i],
      })
      logStep(
        'onboard-proof',
        `${labels[i]} signed challenge wallet=${proof.wallet} challenge=${proof.challenge} sig=${proof.signature}`,
      )
    }
  }

  for (let i = 0; i < runs.length; i++) {
    const agent = runs[i]

    const bondTxHash = await postBond({
      signer: agent.signer,
      auctionId: auction.auctionId,
      amount: BigInt(50) * USDC,
    })
    logStep('bond', `${agent.name} bond posted tx=${bondTxHash}`)

    // Wait for TX to propagate across RPCs before submitting proof to engine
    await sleep(3000)

    await submitBondProof({
      auctionId: auction.auctionId,
      agentId: agent.agentId,
      depositor: agent.eoaAddress,
      amount: BigInt(50) * USDC,
      txHash: bondTxHash,
    })
    logStep('bond', `${agent.name} bond verified`)

    // Generate RegistryMembership proof
    logStep('zk', `${labels[i]} generating RegistryMembership proof...`)
    const t0 = Date.now()
    // Use the agent's own Poseidon capability tree root (stored in local state file).
    // This is the per-agent root the circuit constrains against — NOT the global
    // keccak registry root returned by AgentPrivacyRegistry.getRoot().
    const membershipProof = await generateMembershipProofForAgent(
      agent.agentState,
      BigInt(auction.auctionId),
      agent.agentState.capabilityMerkleRoot,
    )
    logStep('zk', `${labels[i]} membership proof generated in ${Date.now() - t0}ms`)

    // Check local nullifier reuse before calling engine
    const nullifierStr = membershipProof.publicSignals[MEMBERSHIP_SIGNALS.NULLIFIER]
    if (agent.agentState.usedNullifiers.includes(nullifierStr)) {
      throw new NullifierReusedError(nullifierStr, auction.auctionId)
    }

    await joinAuction({
      auctionId: auction.auctionId,
      agentId: agent.agentId,
      bondAmount: BigInt(50) * USDC,
      nonce: 0,
      signer: agent.signer,
      proofPayload: membershipProof,
    })
    logStep('join', `${agent.name} joined auction with ZK membership proof`)

    // Persist nullifier AFTER successful engine response
    persistNullifier(agent.stateFile, nullifierStr)
    // Update in-memory state so double-join demo sees updated usedNullifiers
    agent.agentState.usedNullifiers.push(nullifierStr)
    logStep('zk', `${labels[i]} nullifier persisted to state file`)
  }

  // Agent-A bid: 100 USDC
  const bidAmountA = BigInt(100) * USDC
  const bidNonceA = 0
  logStep('zk', `${runs[0].name} pre-validating bid range...`)
  validateBidRange(bidAmountA, RESERVE_PRICE, MAX_BUDGET)
  logStep('zk', `${runs[0].name} generating BidRange proof...`)
  const t1A = Date.now()
  const bidProofA = await generateBidRangeProofForAgent(
    bidAmountA,
    RESERVE_PRICE,
    MAX_BUDGET,
    BigInt(bidNonceA),
  )
  logStep('zk', `${runs[0].name} bid range proof generated in ${Date.now() - t1A}ms`)

  await placeBid({
    auctionId: auction.auctionId,
    agentId: runs[0].agentId,
    amount: bidAmountA,
    nonce: bidNonceA,
    signer: runs[0].signer,
    proofPayload: bidProofA,
    proofSalt: BigInt(bidNonceA),
  })
  logStep('bid', `Agent-A bid ${formatUnits(bidAmountA, 6)} USDC with ZK range proof`)
  await sleep(800)

  // Agent-B bid: 150 USDC
  const bidAmountB = BigInt(150) * USDC
  const bidNonceB = 0
  logStep('zk', `${runs[1].name} pre-validating bid range...`)
  validateBidRange(bidAmountB, RESERVE_PRICE, MAX_BUDGET)
  logStep('zk', `${runs[1].name} generating BidRange proof...`)
  const t1B = Date.now()
  const bidProofB = await generateBidRangeProofForAgent(
    bidAmountB,
    RESERVE_PRICE,
    MAX_BUDGET,
    BigInt(bidNonceB),
  )
  logStep('zk', `${runs[1].name} bid range proof generated in ${Date.now() - t1B}ms`)

  await placeBid({
    auctionId: auction.auctionId,
    agentId: runs[1].agentId,
    amount: bidAmountB,
    nonce: bidNonceB,
    signer: runs[1].signer,
    proofPayload: bidProofB,
    proofSalt: BigInt(bidNonceB),
  })
  logStep('bid', `Agent-B bid ${formatUnits(bidAmountB, 6)} USDC with ZK range proof`)
  await sleep(800)

  // Agent-C bid: 200 USDC
  const bidAmountC = BigInt(200) * USDC
  const bidNonceC = 0
  logStep('zk', `${runs[2].name} pre-validating bid range...`)
  validateBidRange(bidAmountC, RESERVE_PRICE, MAX_BUDGET)
  logStep('zk', `${runs[2].name} generating BidRange proof...`)
  const t1C = Date.now()
  const bidProofC = await generateBidRangeProofForAgent(
    bidAmountC,
    RESERVE_PRICE,
    MAX_BUDGET,
    BigInt(bidNonceC),
  )
  logStep('zk', `${runs[2].name} bid range proof generated in ${Date.now() - t1C}ms`)

  await placeBid({
    auctionId: auction.auctionId,
    agentId: runs[2].agentId,
    amount: bidAmountC,
    nonce: bidNonceC,
    signer: runs[2].signer,
    proofPayload: bidProofC,
    proofSalt: BigInt(bidNonceC),
  })
  logStep('bid', `Agent-C bid ${formatUnits(bidAmountC, 6)} USDC with ZK range proof`)

  // ── Failure case demonstrations ────────────────────────────────────────────

  logStep('demo', '─── Demonstrating double-join prevention ───')
  try {
    // Re-generate the same membership proof for Agent-A (same auctionId → same nullifier)
    const duplicateProof = await generateMembershipProofForAgent(
      agentStates[0],
      BigInt(auction.auctionId),
      agentStates[0].capabilityMerkleRoot,
    )
    const dupNullifier = duplicateProof.publicSignals[MEMBERSHIP_SIGNALS.NULLIFIER]

    // Check local usedNullifiers first (should catch it after persistNullifier)
    if (runs[0].agentState.usedNullifiers.includes(dupNullifier)) {
      throw new NullifierReusedError(dupNullifier, auction.auctionId)
    }

    // If local check didn't catch it (shouldn't happen), the engine will reject
    await joinAuction({
      auctionId: auction.auctionId,
      agentId: runs[0].agentId,
      bondAmount: BigInt(50) * USDC,
      nonce: 1,
      signer: runs[0].signer,
      proofPayload: duplicateProof,
    })
    // Should not reach here
    logStep('security', 'FAIL: double-join was unexpectedly accepted!')
  } catch (err) {
    if (err instanceof NullifierReusedError) {
      logStep('security', `PASS: double-join prevented locally — ${err.detail}`)
    } else if (
      err instanceof Error &&
      (err.message.includes('nullifier') ||
        err.message.includes('Nullifier') ||
        err.message.includes('already'))
    ) {
      logStep('security', `PASS: double-join rejected by engine — ${err.message}`)
    } else {
      logStep('security', `PASS: double-join rejected — ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  logStep('demo', '─── Demonstrating bid range pre-validation ───')
  try {
    // Try a bid below the reserve price (1 USDC < 80 USDC reserve)
    validateBidRange(BigInt(1) * USDC, RESERVE_PRICE, MAX_BUDGET)
    logStep('security', 'FAIL: out-of-range bid was not caught!')
  } catch (err) {
    if (err instanceof BidOutOfRangeError) {
      logStep('security', `PASS: out-of-range bid caught — ${err.detail}`)
      logStep('security', `suggestion: ${err.suggestion}`)
    } else {
      throw err // Unexpected error
    }
  }

  // ── x402 manifest ─────────────────────────────────────────────────────────

  // Demonstrate x402 micropayment (transparent if server has X402_MODE=on)
  const manifest = await engineFetch<{ auctionId: string; manifestHash: string }>(
    `/auctions/${auction.auctionId}/manifest`,
  )
  logStep('x402', `fetched manifest via x402: auctionId=${manifest.auctionId}`)

  if (process.env.SKIP_SETTLEMENT_WAIT === '1') {
    logStep('settlement', 'SKIP_SETTLEMENT_WAIT=1 set, skipping settlement verification')
  } else {
    logStep('settlement', 'waiting for on-chain close + settlement (up to 3 min)')
    logStep('settlement', 'tip: run settlement watcher in another terminal for full SETTLED state:')
    logStep('settlement', '  cd cre && bun run scripts/settlement-watcher.ts')

    const result = await waitForSettlement(auction.auctionId, 180_000)

    if (result.state === 3) {
      logStep('settlement', 'auction fully SETTLED via CRE onReport()')
    } else if (result.state === 2) {
      logStep('settlement', 'auction CLOSED on-chain (recordResult succeeded)')
      logStep('settlement', 'CRE settlement not detected — run the settlement watcher for full E2E')
    }

    const winner = await getWinner(auction.auctionId)
    logStep(
      'settlement',
      `winner on-chain agentId=${winner.agentId.toString()} wallet=${winner.wallet} amount=${formatUnits(winner.amount, 6)} USDC`,
    )

    if (winner.agentId !== runs[2].agentId) {
      throw new Error(
        `unexpected winner: expected Agent-C (${runs[2].agentId.toString()}), got ${winner.agentId.toString()}`,
      )
    }

    // Refunds only work after SETTLED — skip if only CLOSED
    if (result.state === 3) {
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
        agentId: runs[1].agentId,
      })
      logStep('refund', 'Agent-B refund claimed')
    } else {
      logStep('refund', 'skipping refund claims (requires SETTLED state from CRE)')
    }
  }

  const elapsed = ((Date.now() - started) / 1000).toFixed(1)
  logStep('demo', `completed in ${elapsed}s`)
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err)
  logStep('fatal', message)
  process.exitCode = 1
})
