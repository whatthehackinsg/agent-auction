import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolveBackendWriteTarget } from '../src/lib/agent-target.js'
import {
  describeWriteBackend,
  getEvmWalletProvider,
  resetWalletBackendCacheForTests,
  resolveWriteBackend,
} from '../src/lib/wallet-backend.js'
import { makeConfig, TEST_AGENT_ID, TEST_PRIVATE_KEY, TEST_WALLET } from './helpers.js'

describe('wallet backend selection', () => {
  const agentKitOverrides = {
    cdp: {
      apiKeyId: 'cdp-key-id',
      apiKeySecret: 'cdp-key-secret',
      walletSecret: 'cdp-wallet-secret',
      walletAddress: TEST_WALLET,
      networkId: 'base-sepolia',
    },
    baseSepoliaRpc: 'https://sepolia.base.org',
  } as const

  afterEach(() => {
    resetWalletBackendCacheForTests()
    vi.restoreAllMocks()
  })

  it('selects an explicit backend mode deterministically', () => {
    const agentKitConfig = makeConfig({
      walletBackendMode: 'agentkit',
      ...agentKitOverrides,
    })
    expect(resolveWriteBackend(agentKitConfig)).toMatchObject({
      kind: 'agentkit',
      path: 'supported-agentkit-cdp',
      selectionSource: 'explicit',
      wallet: TEST_WALLET,
    })

    const rawKeyConfig = makeConfig({
      walletBackendMode: 'raw-key',
      ...agentKitOverrides,
    })
    expect(resolveWriteBackend(rawKeyConfig)).toMatchObject({
      kind: 'raw-key',
      path: 'advanced-raw-key',
      selectionSource: 'explicit',
      wallet: TEST_WALLET,
    })
  })

  it('defaults to the supported AgentKit path when both backends are configured', () => {
    const config = makeConfig({
      walletBackendMode: 'auto',
      ...agentKitOverrides,
    })

    expect(resolveWriteBackend(config)).toMatchObject({
      kind: 'agentkit',
      path: 'supported-agentkit-cdp',
      selectionSource: 'auto-default',
    })
  })

  it('keeps read-only config valid when no write backend is configured', () => {
    const config = makeConfig({
      agentPrivateKey: null,
      cdp: {
        apiKeyId: null,
        apiKeySecret: null,
        walletSecret: null,
        walletAddress: null,
        networkId: 'base-sepolia',
      },
    })

    expect(describeWriteBackend(config)).toMatchObject({
      configured: false,
      kind: 'none',
      path: 'read-only',
      supportLevel: 'none',
    })
  })

  it('fails clearly on incomplete AgentKit/CDP config instead of silently falling back', () => {
    const config = makeConfig({
      agentPrivateKey: TEST_PRIVATE_KEY,
      cdp: {
        apiKeyId: 'cdp-key-id',
        apiKeySecret: null,
        walletSecret: null,
        walletAddress: null,
        networkId: 'base-sepolia',
      },
    })

    expect(() => resolveWriteBackend(config)).toThrow(
      /Incomplete AgentKit\/CDP configuration/,
    )
  })

  it('resolves backend-aware write targets for the supported path', () => {
    const config = makeConfig({
      agentStateDir: '/tmp/agents',
      ...agentKitOverrides,
    })

    expect(resolveBackendWriteTarget(config, { agentId: TEST_AGENT_ID })).toMatchObject({
      agentId: TEST_AGENT_ID,
      wallet: TEST_WALLET,
      backend: {
        kind: 'agentkit',
        path: 'supported-agentkit-cdp',
      },
    })
  })

  it('does not cache AgentKit providers across calls', async () => {
    let providerId = 0
    const createAgentKitProvider = vi.fn(async () => {
      providerId += 1
      const id = providerId
      return {
        getAddress: () => TEST_WALLET,
        signTypedData: async () => (`0x${String(id).padStart(64, '0')}` as `0x${string}`),
        sendTransaction: async () => (`0x${String(id).padStart(64, '0')}` as `0x${string}`),
      }
    })

    const config = makeConfig({
      walletBackendMode: 'agentkit',
      ...agentKitOverrides,
    })

    const provider1 = await getEvmWalletProvider(config, { createAgentKitProvider })
    const provider2 = await getEvmWalletProvider(config, { createAgentKitProvider })

    expect(provider1).not.toBe(provider2)
    expect(createAgentKitProvider).toHaveBeenCalledTimes(2)
  })

  it('keeps caching the advanced raw-key bridge', async () => {
    const config = makeConfig({
      walletBackendMode: 'raw-key',
      agentPrivateKey: TEST_PRIVATE_KEY,
      baseSepoliaRpc: 'https://sepolia.base.org',
    })

    const provider1 = await getEvmWalletProvider(config)
    const provider2 = await getEvmWalletProvider(config)

    expect(provider1).toBe(provider2)
  })
})
