import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { registerIdentityTool } from '../src/tools/identity.js'
import {
  makeCapturingMcpServer,
  makeConfig,
  parseToolResponse,
  TEST_AGENT_ID,
  TEST_WALLET,
} from './helpers.js'
import type { EngineClient } from '../src/lib/engine.js'

const agentKitConfig = {
  agentPrivateKey: null,
  cdp: {
    apiKeyId: 'cdp-key-id',
    apiKeySecret: 'cdp-key-secret',
    walletSecret: 'cdp-wallet-secret',
    walletAddress: TEST_WALLET,
    networkId: 'base-sepolia',
  },
  baseSepoliaRpc: 'https://base-sepolia.example',
} as const

describe('check_identity', () => {
  const tempDirs: string[] = []

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it('points missing steps at register_identity instead of legacy selfRegister guidance', async () => {
    const { mockServer, getHandler } = makeCapturingMcpServer()
    const mockEngine = {
      get: async () => ({}),
      post: async (path: string) => {
        if (path !== '/verify-identity') {
          throw new Error(`Unexpected POST ${path}`)
        }

        return {
          verified: false,
          resolvedWallet: TEST_WALLET,
          privacyRegistered: false,
          poseidonRoot: null,
        }
      },
    } as unknown as EngineClient

    registerIdentityTool(mockServer, mockEngine, makeConfig())
    const handler = getHandler()

    const result = await handler({ agentId: TEST_AGENT_ID })
    const body = parseToolResponse(result)

    expect(body.success).toBe(true)
    expect(body.readiness).toMatchObject({
      readyToParticipate: false,
      erc8004Registered: false,
      privacyRegistryRegistered: false,
    })

    const missingSteps = (body.readiness as { missingSteps: string[] }).missingSteps
    expect(missingSteps).toHaveLength(1)
    expect(missingSteps[0]).toContain('register_identity')
    expect(missingSteps[0]).not.toContain('selfRegister')
  })

  it('guides privacy-missing agents toward the current MCP recovery path', async () => {
    const { mockServer, getHandler } = makeCapturingMcpServer()
    const mockEngine = {
      get: async () => ({}),
      post: async (path: string) => {
        if (path !== '/verify-identity') {
          throw new Error(`Unexpected POST ${path}`)
        }

        return {
          verified: true,
          resolvedWallet: TEST_WALLET,
          privacyRegistered: false,
          poseidonRoot: null,
        }
      },
    } as unknown as EngineClient

    registerIdentityTool(mockServer, mockEngine, makeConfig())
    const handler = getHandler()

    const result = await handler({ agentId: TEST_AGENT_ID })
    const body = parseToolResponse(result)

    expect(body.success).toBe(true)
    expect(body.readiness).toMatchObject({
      readyToParticipate: false,
      erc8004Registered: true,
      privacyRegistryRegistered: false,
    })

    const missingSteps = (body.readiness as { missingSteps: string[] }).missingSteps
    expect(missingSteps).toHaveLength(1)
    expect(missingSteps[0]).toContain('register_identity')
    expect(missingSteps[0]).not.toContain('prepareOnboarding')
    expect(missingSteps[0]).not.toContain('registerOnChain')
  })

  it('returns an empty missingSteps list for ready agents', async () => {
    const { mockServer, getHandler } = makeCapturingMcpServer()
    const mockEngine = {
      get: async () => ({}),
      post: async (path: string) => {
        if (path !== '/verify-identity') {
          throw new Error(`Unexpected POST ${path}`)
        }

        return {
          verified: true,
          resolvedWallet: TEST_WALLET,
          privacyRegistered: true,
          poseidonRoot: '0x1234',
        }
      },
    } as unknown as EngineClient

    registerIdentityTool(mockServer, mockEngine, makeConfig())
    const handler = getHandler()

    const result = await handler({ agentId: TEST_AGENT_ID })
    const body = parseToolResponse(result)

    expect(body.success).toBe(true)
    expect(body.readiness).toMatchObject({
      readyToParticipate: true,
      missingSteps: [],
    })
    expect(body.poseidonRoot).toBe('0x1234')
  })

  it('resolves the wallet from the supported AgentKit backend when no raw private key is configured', async () => {
    const { mockServer, getHandler } = makeCapturingMcpServer()
    const mockEngine = {
      get: async () => ({}),
      post: async (requestPath: string, payload: unknown) => {
        if (requestPath !== '/verify-identity') {
          throw new Error(`Unexpected POST ${requestPath}`)
        }

        expect(payload).toMatchObject({
          agentId: TEST_AGENT_ID,
          wallet: TEST_WALLET,
        })

        return {
          verified: false,
          resolvedWallet: TEST_WALLET,
          privacyRegistered: false,
          poseidonRoot: null,
        }
      },
    } as unknown as EngineClient

    registerIdentityTool(
      mockServer,
      mockEngine,
      makeConfig({
        ...agentKitConfig,
      }),
    )
    const handler = getHandler()

    const result = await handler({ agentId: TEST_AGENT_ID })
    const body = parseToolResponse(result)

    expect(body.success).toBe(true)
    expect(body.wallet).toBe(TEST_WALLET)
    expect(body.walletBackend).toBe('supported-agentkit-cdp')
  })

  it('distinguishes missing compatible ZK state from identity setup and surfaces explicit attach mode', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'check-identity-agentkit-'))
    tempDirs.push(tempDir)

    const { mockServer, getHandler } = makeCapturingMcpServer()
    const mockEngine = {
      get: async () => ({}),
      post: async (requestPath: string) => {
        if (requestPath !== '/verify-identity') {
          throw new Error(`Unexpected POST ${requestPath}`)
        }

        return {
          verified: true,
          resolvedWallet: TEST_WALLET,
          privacyRegistered: true,
          poseidonRoot: '0x1234',
        }
      },
    } as unknown as EngineClient

    registerIdentityTool(
      mockServer,
      mockEngine,
      makeConfig({
        ...agentKitConfig,
        agentId: TEST_AGENT_ID,
        agentStateDir: tempDir,
      }),
    )
    const handler = getHandler()

    const result = await handler({})
    const body = parseToolResponse(result)

    expect(body.success).toBe(true)
    expect(body.readiness).toMatchObject({
      walletConfigured: true,
      erc8004Registered: true,
      privacyRegistryRegistered: true,
      readyToParticipate: false,
      zkState: {
        status: 'missing',
        attachRequired: true,
        stateFilePath: path.resolve(tempDir, `agent-${TEST_AGENT_ID}.json`),
      },
    })
    expect(body.attach).toMatchObject({
      supported: true,
      required: true,
      mode: 'attach-existing',
    })

    const missingSteps = (body.readiness as {
      missingSteps: string[]
      zkState: { status: string }
    }).missingSteps
    expect(missingSteps).toHaveLength(1)
    expect(missingSteps[0]).toContain('attachExisting')
    expect(missingSteps[0]).toContain(TEST_AGENT_ID)
  })
})
