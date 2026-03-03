import { baseSepolia } from 'viem/chains'
import {
  createPublicClient,
  createWalletClient,
  http,
  type Address,
  type Hex,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

export const RPC_URL = process.env.BASE_SEPOLIA_RPC ?? 'https://sepolia.base.org'
export const ENGINE_URL = process.env.ENGINE_URL ?? 'http://localhost:8787'
export const X402_ENABLED = process.env.X402_ENABLED !== 'false' // on by default
export const AGENT_STATE_DIR = process.env.AGENT_STATE_DIR ?? '../packages/crypto/test-agents'

export const ADDRESSES = {
  mockUSDC: '0xfEE786495d165b16dc8e68B6F8281193e041737d',
  identityRegistry: '0x8004A818BFB912233c491871b3d84c89A494BD9e',
  /** @deprecated Use identityRegistry (ERC-8004) instead */
  mockIdentityRegistry: '0x68E06c33D4957102362ACffC2BFF9E6b38199318',
  agentPrivacyRegistry: '0x857E1049A5eE2cCA03a5C95F32089FECe51Ce8ff',
  auctionRegistry: '0xFEc7a05707AF85C6b248314E20FF8EfF590c3639',
  auctionEscrow: '0x20944f46AB83F7eA40923D7543AF742Da829743c',
} as const satisfies Record<string, Address>

/** @deprecated Use erc8004Abi for real ERC-8004 registry */
export const identityAbi = [
  {
    name: 'registerWithId',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'agentId', type: 'uint256' },
      { name: 'owner', type: 'address' },
    ],
    outputs: [],
  },
  {
    name: 'register',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'owner', type: 'address' }],
    outputs: [{ name: 'agentId', type: 'uint256' }],
  },
] as const

/** ERC-8004 Identity Registry ABI — agents self-register */
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
] as const

export const usdcAbi = [
  {
    name: 'mint',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [],
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
] as const

export const registryAbi = [
  {
    name: 'getAuctionState',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'auctionId', type: 'bytes32' }],
    outputs: [{ name: '', type: 'uint8' }],
  },
  {
    name: 'getWinner',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'auctionId', type: 'bytes32' }],
    outputs: [
      { name: 'agentId', type: 'uint256' },
      { name: 'wallet', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
  },
] as const

export const escrowAbi = [
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
] as const

export const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http(RPC_URL),
})

export function getDeployerPrivateKey(): Hex {
  const key = process.env.DEPLOYER_PRIVATE_KEY
  if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key)) {
    throw new Error('DEPLOYER_PRIVATE_KEY (0x-prefixed 32-byte hex) is required')
  }
  return key as Hex
}

export function createWalletForPrivateKey(privateKey: Hex) {
  const account = privateKeyToAccount(privateKey)
  const walletClient = createWalletClient({
    account,
    chain: baseSepolia,
    transport: http(RPC_URL),
  })

  return { account, walletClient }
}

export function createDeployerClients() {
  const privateKey = getDeployerPrivateKey()
  return createWalletForPrivateKey(privateKey)
}

export function getAgentPrivateKeys(): Hex[] {
  const env = process.env.AGENT_PRIVATE_KEYS
  if (!env) {
    throw new Error('AGENT_PRIVATE_KEYS is required: comma-separated 0x private keys for 3 agents')
  }

  const keys = env
    .split(',')
    .map((x) => x.trim())
    .filter((x) => x.length > 0)

  if (keys.length < 3) {
    throw new Error('AGENT_PRIVATE_KEYS must provide at least 3 keys')
  }

  for (const key of keys) {
    if (!/^0x[0-9a-fA-F]{64}$/.test(key)) {
      throw new Error(`Invalid private key format in AGENT_PRIVATE_KEYS: ${key}`)
    }
  }

  return keys as Hex[]
}
