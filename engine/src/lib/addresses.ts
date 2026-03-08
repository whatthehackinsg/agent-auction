/** Deployed contract addresses on Base Sepolia (chainId 84532) */
export const ADDRESSES = {
  mockUSDC: '0xfEE786495d165b16dc8e68B6F8281193e041737d' as `0x${string}`,
  identityRegistry: '0x8004A818BFB912233c491871b3d84c89A494BD9e' as `0x${string}`,
  auctionRegistry: '0xB2FB10e98B2707A4C27434665E3C864ecaea0b7F' as `0x${string}`,
  auctionEscrow: '0xb23D3bca2728e407A3b8c8ab63C8Ed6538c4bca2' as `0x${string}`,
  agentPrivacyRegistry: '0x5b4f09A5D5188dCe1b1ba0caeDBcEb52CaCD1902' as `0x${string}`,
  nftEscrow: '0x110fA3cc158621a85BfCcCA7F7B093356FCea020' as `0x${string}`,
  keystoneForwarder: '0x82300bd7c3958625581cc2F77bC6464dcEcDF3e5' as `0x${string}`,
  sequencer: '0x633ec0e633AA4d8BbCCEa280331A935747416737' as `0x${string}`,
} as const

export const CHAIN_CONFIG = {
  chainId: 84532,
  rpcUrl: 'https://sepolia.base.org',
  usdcDecimals: 6,
} as const

/** EIP-712 domain for AuctionRegistry signature verification */
export const EIP712_DOMAIN = {
  name: 'AgentAuction' as const,
  version: '1' as const,
  chainId: 84532,
  verifyingContract: ADDRESSES.auctionRegistry,
} as const
