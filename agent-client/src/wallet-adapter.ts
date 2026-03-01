import { CdpClient } from '@coinbase/cdp-sdk'
import { createWalletClient, http, type Address, type Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { baseSepolia } from 'viem/chains'
import { getAgentPrivateKeys, RPC_URL } from './config'

export type WalletProvider = 'local' | 'coinbase' | 'dynamic' | 'privy'

export type TypedDataField = {
  name: string
  type: string
}

export type TypedDataPayload = {
  domain: Record<string, unknown>
  types: Record<string, readonly TypedDataField[]>
  primaryType: string
  message: Record<string, unknown>
}

export type SendTransactionPayload = {
  to: Address
  data?: Hex
  value?: bigint
}

export interface WalletSignerAdapter {
  readonly provider: WalletProvider
  getAddress(): Promise<Address>
  signTypedData(payload: TypedDataPayload): Promise<Hex>
  signMessage(message: string): Promise<Hex>
  sendTransaction(payload: SendTransactionPayload): Promise<Hex>
}

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value || value.trim().length === 0) {
    throw new Error(`${name} is required`)
  }
  return value.trim()
}

function parseAddressList(raw: string, expectedCount: number, envName: string): Address[] {
  const addresses = raw
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0)

  if (addresses.length < expectedCount) {
    throw new Error(`${envName} must contain at least ${expectedCount} addresses`)
  }

  for (const address of addresses) {
    if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
      throw new Error(`Invalid address in ${envName}: ${address}`)
    }
  }

  return addresses as Address[]
}

class LocalPrivateKeyAdapter implements WalletSignerAdapter {
  readonly provider = 'local' as const
  private readonly account
  private readonly walletClient

  constructor(privateKey: Hex) {
    this.account = privateKeyToAccount(privateKey)
    this.walletClient = createWalletClient({
      account: this.account,
      chain: baseSepolia,
      transport: http(RPC_URL),
    })
  }

  async getAddress(): Promise<Address> {
    return this.account.address
  }

  async signTypedData(payload: TypedDataPayload): Promise<Hex> {
    return this.account.signTypedData(payload as never)
  }

  async signMessage(message: string): Promise<Hex> {
    return this.account.signMessage({ message })
  }

  async sendTransaction(payload: SendTransactionPayload): Promise<Hex> {
    return this.walletClient.sendTransaction({
      account: this.account,
      chain: baseSepolia,
      to: payload.to,
      data: payload.data ?? '0x',
      value: payload.value ?? 0n,
    })
  }
}

class CoinbaseCdpAdapter implements WalletSignerAdapter {
  readonly provider = 'coinbase' as const

  constructor(
    private readonly cdp: CdpClient,
    private readonly address: Address,
    private readonly network: string,
  ) {}

  async getAddress(): Promise<Address> {
    return this.address
  }

  async signTypedData(payload: TypedDataPayload): Promise<Hex> {
    const result = await this.cdp.evm.signTypedData({
      address: this.address,
      domain: payload.domain as never,
      types: payload.types as never,
      primaryType: payload.primaryType as never,
      message: payload.message as never,
    })
    return result.signature
  }

  async signMessage(message: string): Promise<Hex> {
    const result = await this.cdp.evm.signMessage({
      address: this.address,
      message,
    })
    return result.signature
  }

  async sendTransaction(payload: SendTransactionPayload): Promise<Hex> {
    const result = await this.cdp.evm.sendTransaction({
      address: this.address,
      network: this.network as never,
      transaction: {
        to: payload.to,
        data: payload.data ?? '0x',
        value: payload.value ?? 0n,
      },
    })
    return result.transactionHash
  }
}

class UnsupportedManagedWalletAdapter implements WalletSignerAdapter {
  constructor(
    readonly provider: 'dynamic' | 'privy',
    private readonly index: number,
  ) {}

  private buildError(method: string): Error {
    return new Error(
      `${this.provider} adapter is not wired for ${method} yet (agent #${this.index + 1}). ` +
        'Use AGENT_WALLET_PROVIDER=local|coinbase for now.',
    )
  }

  async getAddress(): Promise<Address> {
    throw this.buildError('getAddress')
  }

  async signTypedData(_payload: TypedDataPayload): Promise<Hex> {
    throw this.buildError('signTypedData')
  }

  async signMessage(_message: string): Promise<Hex> {
    throw this.buildError('signMessage')
  }

  async sendTransaction(_payload: SendTransactionPayload): Promise<Hex> {
    throw this.buildError('sendTransaction')
  }
}

export function getWalletProvider(): WalletProvider {
  const provider = (process.env.AGENT_WALLET_PROVIDER ?? 'local').trim().toLowerCase()
  if (provider === 'local' || provider === 'coinbase' || provider === 'dynamic' || provider === 'privy') {
    return provider
  }
  throw new Error(
    `Unsupported AGENT_WALLET_PROVIDER=${provider}. Expected local|coinbase|dynamic|privy`,
  )
}

export async function createAgentSignerAdapters(count: number): Promise<WalletSignerAdapter[]> {
  const provider = getWalletProvider()

  if (provider === 'local') {
    return getAgentPrivateKeys()
      .slice(0, count)
      .map((privateKey) => new LocalPrivateKeyAdapter(privateKey))
  }

  if (provider === 'coinbase') {
    const cdp = new CdpClient({
      apiKeyId: requireEnv('CDP_API_KEY_ID'),
      apiKeySecret: requireEnv('CDP_API_KEY_SECRET'),
      walletSecret: requireEnv('CDP_WALLET_SECRET'),
    })
    const network = process.env.COINBASE_EVM_NETWORK?.trim() || 'base-sepolia'
    const addresses = parseAddressList(
      requireEnv('COINBASE_AGENT_ADDRESSES'),
      count,
      'COINBASE_AGENT_ADDRESSES',
    )
    return addresses.slice(0, count).map((address) => new CoinbaseCdpAdapter(cdp, address, network))
  }

  return Array.from({ length: count }, (_unused, index) => (
    new UnsupportedManagedWalletAdapter(provider, index)
  ))
}
