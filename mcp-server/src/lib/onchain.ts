import {
  createPublicClient,
  createWalletClient,
  decodeEventLog,
  http,
  toHex,
  zeroAddress,
  type Address,
  type Hex,
  type TransactionReceipt,
} from 'viem'
import { privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts'
import { baseSepolia } from 'viem/chains'
import {
  computeCapabilityCommitment,
  type AgentPrivateState,
} from '@agent-auction/crypto'
import type { ServerConfig } from './config.js'
import { getEvmWalletProvider, resolveWriteBackend, type ResolvedWriteBackend } from './wallet-backend.js'

export const BASE_SEPOLIA_CONTRACTS = {
  identityRegistry: '0x8004A818BFB912233c491871b3d84c89A494BD9e',
  agentPrivacyRegistry: '0x5b4f09A5D5188dCe1b1ba0caeDBcEb52CaCD1902',
  auctionEscrow: '0xb23D3bca2728e407A3b8c8ab63C8Ed6538c4bca2',
  mockUsdc: '0xfEE786495d165b16dc8e68B6F8281193e041737d',
} as const satisfies Record<string, Address>

export const erc8004Abi = [
  {
    name: 'register',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'agentURI', type: 'string' }],
    outputs: [{ name: 'agentId', type: 'uint256' }],
  },
  {
    name: 'ownerOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    name: 'Registered',
    type: 'event',
    inputs: [
      { name: 'agentId', type: 'uint256', indexed: true },
      { name: 'owner', type: 'address', indexed: true },
      { name: 'agentURI', type: 'string', indexed: false },
    ],
  },
  {
    name: 'Transfer',
    type: 'event',
    inputs: [
      { name: 'from', type: 'address', indexed: true },
      { name: 'to', type: 'address', indexed: true },
      { name: 'tokenId', type: 'uint256', indexed: true },
    ],
  },
] as const

export const agentPrivacyRegistryAbi = [
  {
    name: 'register',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'agentId', type: 'uint256' },
      { name: 'poseidonRoot', type: 'bytes32' },
      { name: 'capCommitment', type: 'bytes32' },
    ],
    outputs: [],
  },
] as const

export const usdcAbi = [
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'transfer',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'allowance',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const

export const auctionEscrowAbi = [
  {
    name: 'claimRefund',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'auctionId', type: 'bytes32' },
      { name: 'agentId', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    name: 'withdraw',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'agentId', type: 'uint256' }],
    outputs: [],
  },
  {
    name: 'withdrawable',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'agentId', type: 'uint256' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'getDesignatedWallet',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'agentId', type: 'uint256' }],
    outputs: [{ name: '', type: 'address' }],
  },
] as const

export type BaseSepoliaPublicClient = ReturnType<typeof createBaseSepoliaPublicClient>
export interface BaseSepoliaWalletClient {
  writeContract(parameters: unknown): Promise<Hex>
}

export interface BaseSepoliaClients {
  account: Pick<PrivateKeyAccount, 'address'>
  publicClient: BaseSepoliaPublicClient
  walletClient: BaseSepoliaWalletClient
  wallet: Address
  backend: ResolvedWriteBackend
}

export interface IdentityRegistrationResult {
  agentId: bigint
  agentURI: string
  owner: Address
  receipt: TransactionReceipt
  txHash: Hex
}

export interface PrivacyRegistrationResult {
  capabilityCommitment: bigint
  poseidonRoot: bigint
  receipt: TransactionReceipt
  txHash: Hex
}

export function createBaseSepoliaPublicClient(rpcUrl: string) {
  return createPublicClient({
    chain: baseSepolia,
    transport: http(rpcUrl),
  })
}

export function createBaseSepoliaWalletClient(rpcUrl: string, privateKey: Hex) {
  const account = privateKeyToAccount(privateKey)
  const walletClient = createWalletClient({
    account,
    chain: baseSepolia,
    transport: http(rpcUrl),
  })

  return { account, walletClient }
}

export function createBaseSepoliaClients(rpcUrl: string, privateKey: Hex): BaseSepoliaClients {
  const publicClient = createBaseSepoliaPublicClient(rpcUrl)
  const { account, walletClient } = createBaseSepoliaWalletClient(rpcUrl, privateKey)
  return {
    account,
    publicClient,
    walletClient,
    wallet: account.address,
    backend: {
      kind: 'raw-key',
      path: 'advanced-raw-key',
      configured: true,
      supportLevel: 'advanced',
      selectionSource: 'explicit',
      wallet: account.address,
      networkId: 'base-sepolia',
    },
  }
}

export async function createBackendAwareBaseSepoliaClients(
  config: ServerConfig,
): Promise<BaseSepoliaClients> {
  if (!config.baseSepoliaRpc) {
    throw new Error('BASE_SEPOLIA_RPC is required for on-chain writes')
  }

  const backend = resolveWriteBackend(config)
  if (!backend.configured || backend.kind === 'none' || !backend.wallet) {
    throw new Error(
      'No write backend is configured. Complete the supported AgentKit + CDP Server Wallet setup or explicitly opt into the advanced raw-key bridge.',
    )
  }

  const publicClient = createBaseSepoliaPublicClient(config.baseSepoliaRpc)

  return {
    account: { address: backend.wallet },
    publicClient,
    walletClient: {
      writeContract: async (parameters: unknown) => {
        const walletProvider = await getEvmWalletProvider(config, {}, {
          // Recreate the AgentKit/CDP provider per write. Reusing a long-lived
          // provider causes stale nonce / gas-estimation failures on the second
          // on-chain transaction in the same process.
          fresh: backend.kind === 'agentkit',
        })
        return walletProvider.writeContract(parameters as never)
      },
    },
    wallet: backend.wallet,
    backend: {
      ...backend,
      wallet: backend.wallet,
    },
  }
}

export function parseRegisteredEvent(
  receipt: TransactionReceipt,
): { agentId: bigint; agentURI: string; owner: Address } | null {
  for (const log of receipt.logs) {
    try {
      const decoded = decodeEventLog({
        abi: erc8004Abi,
        data: log.data,
        topics: log.topics,
      })

      if (decoded.eventName === 'Registered') {
        return {
          agentId: decoded.args.agentId,
          agentURI: decoded.args.agentURI,
          owner: decoded.args.owner,
        }
      }
    } catch {
      // Ignore unrelated logs.
    }
  }

  return null
}

export function parseMintedAgentIdFromTransfer(receipt: TransactionReceipt): bigint | null {
  for (const log of receipt.logs) {
    try {
      const decoded = decodeEventLog({
        abi: erc8004Abi,
        data: log.data,
        topics: log.topics,
      })

      if (decoded.eventName === 'Transfer' && decoded.args.from === zeroAddress) {
        return decoded.args.tokenId
      }
    } catch {
      // Ignore unrelated logs.
    }
  }

  return null
}

export async function registerAgentIdentity(
  clients: BaseSepoliaClients,
  agentURI: string,
  registryAddress: Address = BASE_SEPOLIA_CONTRACTS.identityRegistry,
): Promise<IdentityRegistrationResult> {
  const txHash = await clients.walletClient.writeContract({
    address: registryAddress,
    abi: erc8004Abi,
    functionName: 'register',
    args: [agentURI],
    account: clients.account,
    chain: baseSepolia,
  })
  const receipt = await clients.publicClient.waitForTransactionReceipt({ hash: txHash })
  const registered = parseRegisteredEvent(receipt)
  if (registered) {
    return {
      agentId: registered.agentId,
      agentURI: registered.agentURI,
      owner: registered.owner,
      receipt,
      txHash,
    }
  }

  const mintedAgentId = parseMintedAgentIdFromTransfer(receipt)
  if (mintedAgentId === null) {
    throw new Error(
      `ERC-8004 registration tx ${txHash} confirmed but neither Registered nor mint Transfer logs were found`,
    )
  }

  return {
    agentId: mintedAgentId,
    agentURI,
    owner: clients.account.address,
    receipt,
    txHash,
  }
}

export async function registerPrivacyMembership(
  clients: BaseSepoliaClients,
  privateState: AgentPrivateState,
  registryAddress: Address = BASE_SEPOLIA_CONTRACTS.agentPrivacyRegistry,
): Promise<PrivacyRegistrationResult> {
  const primaryCapability = privateState.capabilities[0]
  if (!primaryCapability) {
    throw new Error('prepareOnboarding() returned no capabilities for privacy registration')
  }

  const capabilityCommitment = await computeCapabilityCommitment(
    primaryCapability.capabilityId,
    privateState.agentSecret,
  )

  const txHash = await clients.walletClient.writeContract({
    address: registryAddress,
    abi: agentPrivacyRegistryAbi,
    functionName: 'register',
    args: [
      privateState.agentId,
      bigintToBytes32(privateState.capabilityMerkleRoot),
      bigintToBytes32(capabilityCommitment),
    ],
    account: clients.account,
    chain: baseSepolia,
  })
  const receipt = await clients.publicClient.waitForTransactionReceipt({ hash: txHash })

  return {
    capabilityCommitment,
    poseidonRoot: privateState.capabilityMerkleRoot,
    receipt,
    txHash,
  }
}

export async function readIdentityOwner(
  publicClient: BaseSepoliaPublicClient,
  agentId: bigint,
  registryAddress: Address = BASE_SEPOLIA_CONTRACTS.identityRegistry,
): Promise<Address> {
  return publicClient.readContract({
    address: registryAddress,
    abi: erc8004Abi,
    functionName: 'ownerOf',
    args: [agentId],
  })
}

export async function transferUsdcToEscrow(
  clients: BaseSepoliaClients,
  amount: bigint,
  tokenAddress: Address = BASE_SEPOLIA_CONTRACTS.mockUsdc,
  escrowAddress: Address = BASE_SEPOLIA_CONTRACTS.auctionEscrow,
): Promise<{ receipt: TransactionReceipt; txHash: Hex }> {
  const txHash = await clients.walletClient.writeContract({
    address: tokenAddress,
    abi: usdcAbi,
    functionName: 'transfer',
    args: [escrowAddress, amount],
    account: clients.account,
    chain: baseSepolia,
  })
  const receipt = await clients.publicClient.waitForTransactionReceipt({ hash: txHash })
  return { receipt, txHash }
}

export async function claimEscrowRefund(
  clients: BaseSepoliaClients,
  auctionId: Hex,
  agentId: bigint,
  escrowAddress: Address = BASE_SEPOLIA_CONTRACTS.auctionEscrow,
): Promise<{ receipt: TransactionReceipt; txHash: Hex }> {
  const txHash = await clients.walletClient.writeContract({
    address: escrowAddress,
    abi: auctionEscrowAbi,
    functionName: 'claimRefund',
    args: [auctionId, agentId],
    account: clients.account,
    chain: baseSepolia,
  })
  const receipt = await clients.publicClient.waitForTransactionReceipt({ hash: txHash })
  return { receipt, txHash }
}

export async function withdrawEscrowFunds(
  clients: BaseSepoliaClients,
  agentId: bigint,
  escrowAddress: Address = BASE_SEPOLIA_CONTRACTS.auctionEscrow,
): Promise<{ receipt: TransactionReceipt; txHash: Hex }> {
  const txHash = await clients.walletClient.writeContract({
    address: escrowAddress,
    abi: auctionEscrowAbi,
    functionName: 'withdraw',
    args: [agentId],
    account: clients.account,
    chain: baseSepolia,
  })
  const receipt = await clients.publicClient.waitForTransactionReceipt({ hash: txHash })
  return { receipt, txHash }
}

export async function readWithdrawableBalance(
  publicClient: BaseSepoliaPublicClient,
  agentId: bigint,
  escrowAddress: Address = BASE_SEPOLIA_CONTRACTS.auctionEscrow,
): Promise<bigint> {
  return publicClient.readContract({
    address: escrowAddress,
    abi: auctionEscrowAbi,
    functionName: 'withdrawable',
    args: [agentId],
  })
}

export async function readDesignatedWallet(
  publicClient: BaseSepoliaPublicClient,
  agentId: bigint,
  escrowAddress: Address = BASE_SEPOLIA_CONTRACTS.auctionEscrow,
): Promise<Address> {
  return publicClient.readContract({
    address: escrowAddress,
    abi: auctionEscrowAbi,
    functionName: 'getDesignatedWallet',
    args: [agentId],
  })
}

function bigintToBytes32(value: bigint): Hex {
  return toHex(value, { size: 32 })
}
