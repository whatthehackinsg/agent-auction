import {
  CdpEvmWalletProvider,
} from '@coinbase/agentkit'
import {
  createWalletClient,
  encodeFunctionData,
  http,
  type Address,
  type ContractFunctionArgs,
  type ContractFunctionName,
  type Hex,
  type Abi,
  type WriteContractParameters,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { baseSepolia } from 'viem/chains'
import type { ServerConfig } from './config.js'

export type ResolvedWriteBackendKind = 'agentkit' | 'raw-key' | 'none'
export type ResolvedWriteBackendPath =
  | 'supported-agentkit-cdp'
  | 'advanced-raw-key'
  | 'read-only'

export interface ResolvedWriteBackend {
  kind: ResolvedWriteBackendKind
  path: ResolvedWriteBackendPath
  configured: boolean
  supportLevel: 'supported' | 'advanced' | 'none'
  selectionSource: 'explicit' | 'auto-default' | 'read-only'
  wallet: Address | null
  networkId: string | null
}

export interface WriteBackendHealth extends ResolvedWriteBackend {
  error?: string
}

export interface WalletBackendDeps {
  createAgentKitProvider?: (config: ServerConfig) => Promise<AgentKitWriteProvider>
  createRawKeyProvider?: (config: ServerConfig) => WalletWriteBackend
}

export interface WalletWriteBackend {
  kind: Exclude<ResolvedWriteBackendKind, 'none'>
  path: Exclude<ResolvedWriteBackendPath, 'read-only'>
  wallet: Address
  signTypedData(typedData: unknown): Promise<Hex>
  writeContract<
    const abi extends Abi | readonly unknown[],
    functionName extends ContractFunctionName<abi, 'nonpayable' | 'payable'>,
    const args extends ContractFunctionArgs<abi, 'nonpayable' | 'payable', functionName>,
  >(parameters: WriteContractParameters<abi, functionName, args>): Promise<Hex>
}

interface AgentKitWriteProvider {
  getAddress(): string
  signTypedData(typedData: unknown): Promise<Hex>
  sendTransaction(transaction: {
    to: Address
    data?: Hex
    value?: bigint
    gas?: bigint
    maxFeePerGas?: bigint
    maxPriorityFeePerGas?: bigint
  }): Promise<Hex>
}

const providerCache = new Map<string, Promise<WalletWriteBackend>>()

export function resetWalletBackendCacheForTests(): void {
  providerCache.clear()
}

export function resolveWriteBackend(config: ServerConfig): ResolvedWriteBackend {
  const requiredCdpFields = [
    ['CDP_API_KEY_ID', config.cdp.apiKeyId],
    ['CDP_API_KEY_SECRET', config.cdp.apiKeySecret],
    ['CDP_WALLET_SECRET', config.cdp.walletSecret],
    ['CDP_WALLET_ADDRESS', config.cdp.walletAddress],
    ['BASE_SEPOLIA_RPC', config.baseSepoliaRpc],
  ] as const

  const missingCdpFields = requiredCdpFields
    .filter(([, value]) => !value)
    .map(([name]) => name)
  const hasCompleteAgentKitConfig = missingCdpFields.length === 0
  const hasAnyCdpConfig =
    config.cdp.apiKeyId !== null
    || config.cdp.apiKeySecret !== null
    || config.cdp.walletSecret !== null
    || config.cdp.walletAddress !== null
  const hasRawKeyBridge = config.agentPrivateKey !== null

  if (config.walletBackendMode === 'agentkit') {
    assertCompleteAgentKitConfig(missingCdpFields)
    return {
      kind: 'agentkit',
      path: 'supported-agentkit-cdp',
      configured: true,
      supportLevel: 'supported',
      selectionSource: 'explicit',
      wallet: config.cdp.walletAddress,
      networkId: config.cdp.networkId,
    }
  }

  if (config.walletBackendMode === 'raw-key') {
    if (!hasRawKeyBridge) {
      throw new Error(
        'MCP_WALLET_BACKEND=raw-key requires AGENT_PRIVATE_KEY. The advanced bridge is not configured.',
      )
    }

    return {
      kind: 'raw-key',
      path: 'advanced-raw-key',
      configured: true,
      supportLevel: 'advanced',
      selectionSource: 'explicit',
      wallet: privateKeyToAccount(config.agentPrivateKey!).address,
      networkId: 'base-sepolia',
    }
  }

  if (hasAnyCdpConfig && !hasCompleteAgentKitConfig) {
    assertCompleteAgentKitConfig(missingCdpFields)
  }

  if (hasCompleteAgentKitConfig) {
    return {
      kind: 'agentkit',
      path: 'supported-agentkit-cdp',
      configured: true,
      supportLevel: 'supported',
      selectionSource: 'auto-default',
      wallet: config.cdp.walletAddress,
      networkId: config.cdp.networkId,
    }
  }

  if (hasRawKeyBridge) {
    return {
      kind: 'raw-key',
      path: 'advanced-raw-key',
      configured: true,
      supportLevel: 'advanced',
      selectionSource: 'auto-default',
      wallet: privateKeyToAccount(config.agentPrivateKey!).address,
      networkId: 'base-sepolia',
    }
  }

  return {
    kind: 'none',
    path: 'read-only',
    configured: false,
    supportLevel: 'none',
    selectionSource: 'read-only',
    wallet: null,
    networkId: null,
  }
}

export function describeWriteBackend(config: ServerConfig): WriteBackendHealth {
  try {
    return resolveWriteBackend(config)
  } catch (error) {
    return {
      kind: 'none',
      path: 'read-only',
      configured: false,
      supportLevel: 'none',
      selectionSource: 'read-only',
      wallet: null,
      networkId: null,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

export async function getEvmWalletProvider(
  config: ServerConfig,
  deps: WalletBackendDeps = {},
  options: { fresh?: boolean } = {},
): Promise<WalletWriteBackend> {
  const backend = resolveWriteBackend(config)
  if (!backend.configured || backend.kind === 'none') {
    throw new Error(
      'No write backend is configured. Configure the supported AgentKit/CDP path or explicitly opt into the advanced raw-key bridge.',
    )
  }

  const cacheKey =
    backend.kind === 'agentkit'
      ? `agentkit:${config.cdp.apiKeyId}:${config.cdp.walletAddress}:${config.cdp.networkId}:${config.baseSepoliaRpc ?? ''}`
      : `raw-key:${config.agentPrivateKey}:${config.baseSepoliaRpc ?? ''}`

  const shouldCache = !options.fresh && backend.kind === 'raw-key'
  if (shouldCache) {
    const cached = providerCache.get(cacheKey)
    if (cached) {
      return cached
    }
  }

  const providerPromise =
    backend.kind === 'agentkit'
      ? wrapAgentKitProvider(config, deps.createAgentKitProvider ?? defaultCreateAgentKitProvider)
      : Promise.resolve((deps.createRawKeyProvider ?? defaultCreateRawKeyProvider)(config))

  if (shouldCache) {
    providerCache.set(cacheKey, providerPromise)
  }
  return providerPromise
}

function assertCompleteAgentKitConfig(missingFields: string[]): void {
  if (missingFields.length === 0) {
    return
  }

  throw new Error(
    `Incomplete AgentKit/CDP configuration: missing ${missingFields.join(', ')}. Complete the supported AgentKit + CDP Server Wallet setup or remove the partial CDP envs; the MCP server will not silently downgrade to the advanced raw-key bridge.`,
  )
}

async function defaultCreateAgentKitProvider(
  config: ServerConfig,
): Promise<AgentKitWriteProvider> {
  return CdpEvmWalletProvider.configureWithWallet({
    apiKeyId: config.cdp.apiKeyId!,
    apiKeySecret: config.cdp.apiKeySecret!,
    walletSecret: config.cdp.walletSecret!,
    address: config.cdp.walletAddress!,
    networkId: config.cdp.networkId,
    rpcUrl: config.baseSepoliaRpc ?? undefined,
  })
}

function defaultCreateRawKeyProvider(config: ServerConfig): WalletWriteBackend {
  const account = privateKeyToAccount(config.agentPrivateKey!)
  const walletClient = createWalletClient({
    account,
    chain: baseSepolia,
    transport: http(config.baseSepoliaRpc ?? undefined),
  })

  return {
    kind: 'raw-key',
    path: 'advanced-raw-key',
    wallet: account.address,
    signTypedData: (typedData) => walletClient.signTypedData(typedData as never),
    writeContract: (parameters) => walletClient.writeContract(parameters as never),
  }
}

async function wrapAgentKitProvider(
  config: ServerConfig,
  createProvider: (config: ServerConfig) => Promise<AgentKitWriteProvider>,
): Promise<WalletWriteBackend> {
  const provider = await createProvider(config)
  return createAgentKitBackend(provider)
}

function createAgentKitBackend(provider: AgentKitWriteProvider): WalletWriteBackend {
  return {
    kind: 'agentkit',
    path: 'supported-agentkit-cdp',
    wallet: provider.getAddress() as Address,
    signTypedData: (typedData) => provider.signTypedData(typedData),
    async writeContract(parameters) {
      const data = (encodeFunctionData as (parameters: Record<string, unknown>) => Hex)({
        abi: parameters.abi,
        functionName: parameters.functionName,
        args: parameters.args,
      })

      return provider.sendTransaction({
        to: parameters.address,
        data,
        value: parameters.value,
        gas: parameters.gas,
        maxFeePerGas: parameters.maxFeePerGas,
        maxPriorityFeePerGas: parameters.maxPriorityFeePerGas,
      })
    },
  }
}
