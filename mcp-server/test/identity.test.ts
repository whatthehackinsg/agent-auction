import { describe, expect, it } from 'vitest'
import { registerIdentityTool } from '../src/tools/identity.js'
import {
  makeCapturingMcpServer,
  makeConfig,
  parseToolResponse,
  TEST_AGENT_ID,
  TEST_WALLET,
} from './helpers.js'
import type { EngineClient } from '../src/lib/engine.js'

describe('check_identity', () => {
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
})
