import { createPublicClient, createWalletClient, http, getContract } from 'viem'
import { baseSepolia } from 'viem/chains'
import { privateKeyToAccount } from 'viem/accounts'
import { ADDRESSES, CHAIN_CONFIG } from './addresses'

// Minimal ABIs — only the functions we need
const auctionRegistryAbi = [
  // Read functions
  { name: 'getAuctionState', type: 'function', stateMutability: 'view', inputs: [{ name: 'auctionId', type: 'bytes32' }], outputs: [{ name: '', type: 'uint8' }] },
  { name: 'getWinner', type: 'function', stateMutability: 'view', inputs: [{ name: 'auctionId', type: 'bytes32' }], outputs: [{ name: 'agentId', type: 'uint256' }, { name: 'wallet', type: 'address' }, { name: 'amount', type: 'uint256' }] },
  // Write functions (matching AuctionRegistry.sol)
  { name: 'createAuction', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'auctionId', type: 'bytes32' }, { name: 'manifestHash', type: 'bytes32' }, { name: 'roomConfigHash', type: 'bytes32' }, { name: 'reservePrice', type: 'uint256' }, { name: 'depositAmount', type: 'uint256' }, { name: 'deadline', type: 'uint256' }], outputs: [] },
  { name: 'recordResult', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'packet', type: 'tuple', components: [{ name: 'auctionId', type: 'bytes32' }, { name: 'manifestHash', type: 'bytes32' }, { name: 'finalLogHash', type: 'bytes32' }, { name: 'replayContentHash', type: 'bytes32' }, { name: 'winnerAgentId', type: 'uint256' }, { name: 'winnerWallet', type: 'address' }, { name: 'winningBidAmount', type: 'uint256' }, { name: 'closeTimestamp', type: 'uint64' }] }, { name: 'sequencerSig', type: 'bytes' }], outputs: [] },
  // Events
  { name: 'AuctionCreated', type: 'event', inputs: [{ name: 'auctionId', type: 'bytes32', indexed: true }, { name: 'manifestHash', type: 'bytes32', indexed: false }, { name: 'reservePrice', type: 'uint256', indexed: false }, { name: 'depositAmount', type: 'uint256', indexed: false }, { name: 'deadline', type: 'uint256', indexed: false }] },
  { name: 'AuctionEnded', type: 'event', inputs: [{ name: 'auctionId', type: 'bytes32', indexed: true }, { name: 'winnerAgentId', type: 'uint256', indexed: true }, { name: 'winnerWallet', type: 'address', indexed: false }, { name: 'finalPrice', type: 'uint256', indexed: false }, { name: 'finalLogHash', type: 'bytes32', indexed: false }, { name: 'replayContentHash', type: 'bytes32', indexed: false }] },
] as const

const auctionEscrowAbi = [
  { name: 'recordBond', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'auctionId', type: 'bytes32' }, { name: 'agentId', type: 'uint256' }, { name: 'depositor', type: 'address' }, { name: 'amount', type: 'uint256' }, { name: 'txHash', type: 'bytes32' }, { name: 'logIndex', type: 'uint256' }], outputs: [] },
  { name: 'getBondAmount', type: 'function', stateMutability: 'view', inputs: [{ name: 'auctionId', type: 'bytes32' }, { name: 'agentId', type: 'uint256' }], outputs: [{ name: '', type: 'uint256' }] },
  { name: 'claimRefund', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'auctionId', type: 'bytes32' }, { name: 'agentId', type: 'uint256' }], outputs: [] },
] as const

/** ERC-8004 Identity Registry — agents self-register, engine reads ownerOf / getAgentWallet */
const erc8004RegistryAbi = [
  { name: 'ownerOf', type: 'function', stateMutability: 'view', inputs: [{ name: 'tokenId', type: 'uint256' }], outputs: [{ name: '', type: 'address' }] },
  { name: 'getAgentWallet', type: 'function', stateMutability: 'view', inputs: [{ name: 'agentId', type: 'uint256' }], outputs: [{ name: '', type: 'address' }] },
] as const

/** AgentPrivacyRegistry — per-agent Poseidon roots (all-Poseidon, no keccak256 global root) */
const agentPrivacyRegistryAbi = [
  { name: 'getAgentPoseidonRoot', type: 'function', stateMutability: 'view', inputs: [{ name: 'agentId', type: 'uint256' }], outputs: [{ name: '', type: 'bytes32' }] },
  { name: 'getAgentCapabilityCommitment', type: 'function', stateMutability: 'view', inputs: [{ name: 'agentId', type: 'uint256' }], outputs: [{ name: '', type: 'bytes32' }] },
] as const

const erc20Abi = [
  { name: 'transfer', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }] },
  { name: 'approve', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }] },
  { name: 'balanceOf', type: 'function', stateMutability: 'view', inputs: [{ name: 'account', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
  { name: 'Transfer', type: 'event', inputs: [{ name: 'from', type: 'address', indexed: true }, { name: 'to', type: 'address', indexed: true }, { name: 'value', type: 'uint256', indexed: false }] },
] as const


// Public client for read operations
export const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http(CHAIN_CONFIG.rpcUrl),
})

// Wallet client factory for write operations (needs private key)
export function createSequencerClient(privateKey: `0x${string}`) {
  const account = privateKeyToAccount(privateKey)
  return createWalletClient({
    account,
    chain: baseSepolia,
    transport: http(CHAIN_CONFIG.rpcUrl),
  })
}

// Typed contract instances (read-only via publicClient)
export const auctionRegistry = getContract({
  address: ADDRESSES.auctionRegistry,
  abi: auctionRegistryAbi,
  client: publicClient,
})

export const auctionEscrow = getContract({
  address: ADDRESSES.auctionEscrow,
  abi: auctionEscrowAbi,
  client: publicClient,
})

export const mockUSDC = getContract({
  address: ADDRESSES.mockUSDC,
  abi: erc20Abi,
  client: publicClient,
})

export const identityRegistry = getContract({
  address: ADDRESSES.identityRegistry,
  abi: erc8004RegistryAbi,
  client: publicClient,
})

export const agentPrivacyRegistry = getContract({
  address: ADDRESSES.agentPrivacyRegistry,
  abi: agentPrivacyRegistryAbi,
  client: publicClient,
})

// Export ABIs for use in walletClient write operations
export {
  auctionRegistryAbi,
  auctionEscrowAbi,
  erc20Abi,
  erc8004RegistryAbi,
  agentPrivacyRegistryAbi,
}
