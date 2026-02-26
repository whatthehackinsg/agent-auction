/**
 * Agent onboarding — one-shot setup for new agents.
 *
 * Steps:
 *  1. Deploy EIP-4337 smart wallet via AgentAccountFactory.createAccount()
 *  2. Register identity in MockIdentityRegistry → get agentId
 *  3. Register agent in AgentPaymaster (account → agentId mapping)
 *  4. Mint MockUSDC to the agent's wallet
 */
import {
  createSequencerClient,
  publicClient,
  agentAccountFactoryAbi,
  mockIdentityRegistryAbi,
  agentPaymasterAbi,
  mockUsdcMintAbi,
} from './chain-client'
import { ADDRESSES } from './addresses'

export interface OnboardParams {
  runtimeSigner: `0x${string}`
  salt: bigint
  mintAmount: bigint
  sequencerPrivateKey: `0x${string}`
}

export interface OnboardResult {
  walletAddress: `0x${string}`
  agentId: string
  runtimeSigner: `0x${string}`
  usdcMinted: string
  txHashes: {
    createAccount: `0x${string}`
    registerIdentity: `0x${string}`
    registerPaymaster: `0x${string}`
    mintUsdc: `0x${string}`
  }
}

export async function onboardAgent(params: OnboardParams): Promise<OnboardResult> {
  const { runtimeSigner, salt, mintAmount, sequencerPrivateKey } = params
  const walletClient = createSequencerClient(sequencerPrivateKey)

  // Step 1: Deploy agent smart wallet (idempotent — returns existing if already deployed)
  const createAccountHash = await walletClient.writeContract({
    address: ADDRESSES.agentAccountFactory,
    abi: agentAccountFactoryAbi,
    functionName: 'createAccount',
    args: [runtimeSigner, salt],
  })
  const createReceipt = await publicClient.waitForTransactionReceipt({ hash: createAccountHash })
  if (createReceipt.status !== 'success') throw new Error('createAccount tx reverted')

  // Read the deterministic wallet address
  const walletAddress = await publicClient.readContract({
    address: ADDRESSES.agentAccountFactory,
    abi: agentAccountFactoryAbi,
    functionName: 'getAddress',
    args: [runtimeSigner, salt],
  }) as `0x${string}`

  // Step 2: Register identity in MockIdentityRegistry
  const registerIdHash = await walletClient.writeContract({
    address: ADDRESSES.mockIdentityRegistry,
    abi: mockIdentityRegistryAbi,
    functionName: 'register',
    args: [walletAddress],
  })
  const idReceipt = await publicClient.waitForTransactionReceipt({ hash: registerIdHash })
  if (idReceipt.status !== 'success') throw new Error('identity register tx reverted')

  // Parse agentId from AgentRegistered event log
  // AgentRegistered(uint256 indexed agentId, address indexed owner)
  const agentRegisteredTopic = '0x0f32b6dff3d23e4cfc2bf0695745cf4c20afe498e38cb28b4e2ddc0e9e5f2746'
  const registeredLog = idReceipt.logs.find(
    (log) => log.address.toLowerCase() === ADDRESSES.mockIdentityRegistry.toLowerCase()
      && log.topics[0] === agentRegisteredTopic,
  )
  const agentId = registeredLog
    ? BigInt(registeredLog.topics[1]!)
    : 0n

  // Step 3: Register in AgentPaymaster (account → agentId mapping)
  const registerPaymasterHash = await walletClient.writeContract({
    address: ADDRESSES.agentPaymaster,
    abi: agentPaymasterAbi,
    functionName: 'registerAgent',
    args: [walletAddress, agentId],
  })
  const paymasterReceipt = await publicClient.waitForTransactionReceipt({ hash: registerPaymasterHash })
  if (paymasterReceipt.status !== 'success') throw new Error('paymaster registerAgent tx reverted')

  // Step 4: Mint MockUSDC to agent wallet
  const mintHash = await walletClient.writeContract({
    address: ADDRESSES.mockUSDC,
    abi: mockUsdcMintAbi,
    functionName: 'mint',
    args: [walletAddress, mintAmount],
  })
  const mintReceipt = await publicClient.waitForTransactionReceipt({ hash: mintHash })
  if (mintReceipt.status !== 'success') throw new Error('MockUSDC mint tx reverted')

  return {
    walletAddress,
    agentId: agentId.toString(),
    runtimeSigner,
    usdcMinted: mintAmount.toString(),
    txHashes: {
      createAccount: createAccountHash,
      registerIdentity: registerIdHash,
      registerPaymaster: registerPaymasterHash,
      mintUsdc: mintHash,
    },
  }
}
