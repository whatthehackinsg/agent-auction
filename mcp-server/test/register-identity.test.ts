import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { encodeAbiParameters, encodeEventTopics, zeroAddress, type Hex } from 'viem'
import type { EngineClient } from '../src/lib/engine.js'
import {
  BASE_SEPOLIA_CONTRACTS,
  erc8004Abi,
  type BaseSepoliaClients,
} from '../src/lib/onchain.js'
import {
  makeCapturingMcpServer,
  makeConfig,
  makeFakeReceipt,
  makeFakeTxHash,
  makeOnchainClients,
  makeReadinessResponse,
  parseToolResponse,
  TEST_WALLET,
} from './helpers.js'

const { buildRegistrationDataUri, registerRegisterIdentityTool } = await import(
  '../src/tools/register-identity.js'
)

function makeVerifyEngine(options?: {
  readiness?: ReturnType<typeof makeReadinessResponse>
  postImpl?: (path: string, body: unknown) => Promise<unknown>
}): {
  mockEngine: EngineClient
  verifyCalls: Array<{ path: string; body: unknown }>
} {
  const verifyCalls: Array<{ path: string; body: unknown }> = []
  const readiness = options?.readiness ?? makeReadinessResponse()

  return {
    mockEngine: {
      post: async (path: string, body: unknown) => {
        verifyCalls.push({ path, body })
        if (options?.postImpl) {
          return options.postImpl(path, body)
        }
        if (path === '/verify-identity') {
          return readiness
        }
        throw new Error(`Unexpected POST ${path}`)
      },
      get: async (_path: string) => {
        return {}
      },
    } as unknown as EngineClient,
    verifyCalls,
  }
}

function makeRegisteredReceipt(agentId: bigint, agentURI: string, txHash: Hex) {
  const topics = encodeEventTopics({
    abi: erc8004Abi,
    eventName: 'Registered',
    args: {
      agentId,
      owner: TEST_WALLET as `0x${string}`,
      agentURI,
    },
  })

  const data = encodeAbiParameters(
    [{ name: 'agentURI', type: 'string' }],
    [agentURI],
  )

  return makeFakeReceipt({
    transactionHash: txHash,
    logs: [
      {
        address: BASE_SEPOLIA_CONTRACTS.identityRegistry,
        topics,
        data,
        blockHash: makeFakeTxHash('21'),
        blockNumber: 1n,
        transactionHash: txHash,
        transactionIndex: 0,
        logIndex: 0,
        removed: false,
      } as any,
    ],
  })
}

function makeTransferOnlyReceipt(agentId: bigint, txHash: Hex) {
  const topics = encodeEventTopics({
    abi: erc8004Abi,
    eventName: 'Transfer',
    args: {
      from: zeroAddress,
      to: TEST_WALLET as `0x${string}`,
      tokenId: agentId,
    },
  })

  return makeFakeReceipt({
    transactionHash: txHash,
    logs: [
      {
        address: BASE_SEPOLIA_CONTRACTS.identityRegistry,
        topics,
        data: '0x',
        blockHash: makeFakeTxHash('23'),
        blockNumber: 1n,
        transactionHash: txHash,
        transactionIndex: 0,
        logIndex: 0,
        removed: false,
      } as any,
    ],
  })
}

describe('buildRegistrationDataUri', () => {
  it('builds a self-contained JSON data URI instead of legacy agent:// metadata', () => {
    const uri = buildRegistrationDataUri({
      wallet: TEST_WALLET,
      name: 'Alpha Agent',
      description: 'Executes auction tasks',
      capabilityIds: [1n, 7n],
      now: new Date('2026-03-06T08:00:00.000Z'),
      extraMetadata: {
        team: 'whatthehack',
      },
    })

    expect(uri.startsWith('data:application/json;base64,')).toBe(true)
    expect(uri.startsWith('agent://')).toBe(false)

    const encoded = uri.slice('data:application/json;base64,'.length)
    const decoded = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'))

    expect(decoded).toMatchObject({
      schema: 'agent-auction.identity/v1',
      name: 'Alpha Agent',
      description: 'Executes auction tasks',
      wallet: TEST_WALLET,
      capabilities: ['1', '7'],
      team: 'whatthehack',
    })
  })
})

describe('register_identity', () => {
  const tempDirs: string[] = []

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it('mints with register(string), saves agent state, and returns readiness for the minted agent', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'register-identity-'))
    tempDirs.push(tempDir)

    const identityTxHash = makeFakeTxHash('11')
    const privacyTxHash = makeFakeTxHash('22')
    const mintedAgentId = 42n

    const { clients, writeCalls } = makeOnchainClients({
      writeContractImpl: async (_args) => {
        return writeCalls.length === 1 ? identityTxHash : privacyTxHash
      },
      waitForReceiptImpl: async (hash) => {
        if (hash === identityTxHash) {
          const pendingWrite = writeCalls[0] as { args: [string] }
          return makeRegisteredReceipt(mintedAgentId, pendingWrite.args[0], hash)
        }
        return makeFakeReceipt({ transactionHash: hash })
      },
    })
    const { mockEngine, verifyCalls } = makeVerifyEngine()
    const { mockServer, getHandler } = makeCapturingMcpServer()

    registerRegisterIdentityTool(
      mockServer,
      mockEngine,
      makeConfig({
        baseSepoliaRpc: 'https://base-sepolia.example',
        agentStateDir: tempDir,
      }),
      {
        createClients: () => clients,
        now: () => new Date('2026-03-06T08:00:00.000Z'),
      },
    )

    const handler = getHandler()
    const result = await handler({
      name: 'Alpha Agent',
      description: 'Autonomous auction agent',
      capabilityIds: ['1', '7'],
    })

    const body = parseToolResponse(result)
    expect(body.success).toBe(true)
    expect(body.agentId).toBe('42')
    expect(body.wallet).toBe(TEST_WALLET)
    expect(body.resolvedWallet).toBe(TEST_WALLET)
    expect(body.erc8004TxHash).toBe(identityTxHash)
    expect(body.privacyTxHash).toBe(privacyTxHash)
    expect(body.stateFilePath).toBe(path.resolve(tempDir, 'agent-42.json'))
    expect(body.readiness).toMatchObject({
      walletConfigured: true,
      erc8004Registered: true,
      privacyRegistryRegistered: true,
      readyToParticipate: true,
      missingSteps: [],
    })
    expect(body.warning).toBeUndefined()

    expect(fs.existsSync(body.stateFilePath as string)).toBe(true)
    const savedState = JSON.parse(fs.readFileSync(body.stateFilePath as string, 'utf8'))
    expect(savedState.agentId).toBe('42n')
    expect(savedState.capabilities).toEqual([{ capabilityId: '1n' }, { capabilityId: '7n' }])

    expect(verifyCalls).toEqual([
      {
        path: '/verify-identity',
        body: {
          agentId: '42',
          wallet: TEST_WALLET,
        },
      },
    ])

    expect(writeCalls).toHaveLength(2)
    const identityWrite = writeCalls[0] as {
      functionName: string
      args: [string]
    }
    expect(identityWrite.functionName).toBe('register')
    expect(identityWrite.args[0].startsWith('data:application/json;base64,')).toBe(true)
    expect(identityWrite.args[0].startsWith('agent://')).toBe(false)
  })

  it('falls back to the ERC-721 mint Transfer log when Registered is absent', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'register-identity-transfer-'))
    tempDirs.push(tempDir)

    const identityTxHash = makeFakeTxHash('41')
    const privacyTxHash = makeFakeTxHash('42')
    const mintedAgentId = 1513n

    const { clients, writeCalls } = makeOnchainClients({
      writeContractImpl: async (_args) => {
        return writeCalls.length === 1 ? identityTxHash : privacyTxHash
      },
      waitForReceiptImpl: async (hash) => {
        if (hash === identityTxHash) {
          return makeTransferOnlyReceipt(mintedAgentId, hash)
        }
        return makeFakeReceipt({ transactionHash: hash })
      },
    })
    const { mockEngine } = makeVerifyEngine()
    const { mockServer, getHandler } = makeCapturingMcpServer()

    registerRegisterIdentityTool(
      mockServer,
      mockEngine,
      makeConfig({
        baseSepoliaRpc: 'https://base-sepolia.example',
        agentStateDir: tempDir,
      }),
      {
        createClients: () => clients,
        now: () => new Date('2026-03-06T08:00:00.000Z'),
      },
    )

    const handler = getHandler()
    const result = await handler({})

    const body = parseToolResponse(result)
    expect(body.success).toBe(true)
    expect(body.agentId).toBe(mintedAgentId.toString())
    expect(body.wallet).toBe(TEST_WALLET)
    expect(body.stateFilePath).toBe(path.resolve(tempDir, `agent-${mintedAgentId.toString()}.json`))
  })

  it('returns actionable config errors before any on-chain writes happen', async () => {
    const createClients = vi.fn<() => BaseSepoliaClients>()
    const { mockEngine } = makeVerifyEngine()
    const { mockServer, getHandler } = makeCapturingMcpServer()

    registerRegisterIdentityTool(
      mockServer,
      mockEngine,
      makeConfig({
        baseSepoliaRpc: null,
      }),
      {
        createClients,
      },
    )

    const handler = getHandler()
    const result = await handler({})
    const body = parseToolResponse(result)

    expect(body.success).toBe(false)
    expect(body.error).toMatchObject({
      code: 'MISSING_CONFIG',
    })
    expect((body.error as Record<string, unknown>).detail).toContain('BASE_SEPOLIA_RPC')
    expect(createClients).not.toHaveBeenCalled()
  })

  it('returns recovered success with warning metadata when reconciliation proves the minted agent is ready', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'register-identity-fail-'))
    tempDirs.push(tempDir)

    const identityTxHash = makeFakeTxHash('31')
    const mintedAgentId = 77n
    const { clients, writeCalls } = makeOnchainClients({
      writeContractImpl: async () => {
        return writeCalls.length === 1 ? identityTxHash : makeFakeTxHash('32')
      },
      waitForReceiptImpl: async (hash) => {
        if (hash === identityTxHash) {
          const identityWrite = writeCalls[0] as { args: [string] }
          return makeRegisteredReceipt(mintedAgentId, identityWrite.args[0], hash)
        }
        throw new Error('privacy registry reverted')
      },
    })
    const { mockEngine, verifyCalls } = makeVerifyEngine({
      readiness: makeReadinessResponse({
        verified: true,
        privacyRegistered: true,
        poseidonRoot: '0xbeef',
      }),
    })
    const { mockServer, getHandler } = makeCapturingMcpServer()

    registerRegisterIdentityTool(
      mockServer,
      mockEngine,
      makeConfig({
        baseSepoliaRpc: 'https://base-sepolia.example',
        agentStateDir: tempDir,
      }),
      {
        createClients: () => clients,
      },
    )

    const handler = getHandler()
    const result = await handler({})
    const body = parseToolResponse(result)

    expect(body.success).toBe(true)
    expect(body.agentId).toBe('77')
    expect(body.erc8004TxHash).toBe(identityTxHash)
    expect(body.stateFilePath).toBe(path.resolve(tempDir, 'agent-77.json'))
    expect(body.readiness).toMatchObject({
      walletConfigured: true,
      erc8004Registered: true,
      privacyRegistryRegistered: true,
      readyToParticipate: true,
      missingSteps: [],
      poseidonRoot: '0xbeef',
    })
    expect(body.warning).toMatchObject({
      code: 'ONBOARDING_RECOVERED',
      verifiedBy: '/verify-identity',
      recoveredFrom: 'PRIVACY_BOOTSTRAP_FAILED',
    })
    expect((body.warning as Record<string, unknown>).detail).toEqual(
      expect.stringContaining('/verify-identity'),
    )
    expect((body.warning as Record<string, unknown>).detail).toEqual(
      expect.stringContaining('ready to participate'),
    )
    expect((body.warning as Record<string, unknown>).limitations).toEqual([
      'This confirms ERC-8004 ownership, AgentPrivacyRegistry visibility, and local state-file presence. It does not prove join_auction has already succeeded.',
    ])
    expect(fs.existsSync(path.resolve(tempDir, 'agent-77.json'))).toBe(true)
    expect(verifyCalls).toEqual([
      {
        path: '/verify-identity',
        body: {
          agentId: '77',
          wallet: TEST_WALLET,
        },
      },
    ])
  })

  it('returns recovery details and nextAction when reconciliation still shows incomplete onboarding', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'register-identity-incomplete-'))
    tempDirs.push(tempDir)

    const identityTxHash = makeFakeTxHash('51')
    const mintedAgentId = 88n
    const { clients, writeCalls } = makeOnchainClients({
      writeContractImpl: async () => {
        return writeCalls.length === 1 ? identityTxHash : makeFakeTxHash('52')
      },
      waitForReceiptImpl: async (hash) => {
        if (hash === identityTxHash) {
          const identityWrite = writeCalls[0] as { args: [string] }
          return makeRegisteredReceipt(mintedAgentId, identityWrite.args[0], hash)
        }
        throw new Error('privacy registry reverted')
      },
    })
    const { mockEngine } = makeVerifyEngine({
      readiness: makeReadinessResponse({
        verified: true,
        privacyRegistered: false,
        poseidonRoot: null,
      }),
    })
    const { mockServer, getHandler } = makeCapturingMcpServer()

    registerRegisterIdentityTool(
      mockServer,
      mockEngine,
      makeConfig({
        baseSepoliaRpc: 'https://base-sepolia.example',
        agentStateDir: tempDir,
      }),
      {
        createClients: () => clients,
      },
    )

    const handler = getHandler()
    const result = await handler({})
    const body = parseToolResponse(result)

    expect(body.success).toBe(false)
    expect(body.error).toMatchObject({
      code: 'PRIVACY_BOOTSTRAP_FAILED',
    })
    expect(body.nextAction).toBe(
      'Run check_identity(agentId="88") and only continue to deposit_bond -> join_auction once readiness.readyToParticipate is true.',
    )
    expect(body.partial).toMatchObject({
      agentId: '88',
      erc8004TxHash: identityTxHash,
      stateFilePath: path.resolve(tempDir, 'agent-88.json'),
      localStateFileExists: true,
      wallet: TEST_WALLET,
      readiness: {
        walletConfigured: true,
        erc8004Registered: true,
        privacyRegistryRegistered: false,
        readyToParticipate: false,
      },
    })
  })

  it('fails closed when readiness is true but the local state file is missing', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'register-identity-state-file-'))
    tempDirs.push(tempDir)

    const identityTxHash = makeFakeTxHash('61')
    const mintedAgentId = 99n
    const blockedParent = path.join(tempDir, 'blocked-parent')
    const requestedStateFilePath = path.join(blockedParent, 'agent-99.json')
    fs.writeFileSync(blockedParent, 'not-a-directory', 'utf8')

    const { clients, writeCalls } = makeOnchainClients({
      writeContractImpl: async () => {
        return writeCalls.length === 1 ? identityTxHash : makeFakeTxHash('62')
      },
      waitForReceiptImpl: async (hash) => {
        if (hash === identityTxHash) {
          const identityWrite = writeCalls[0] as { args: [string] }
          return makeRegisteredReceipt(mintedAgentId, identityWrite.args[0], hash)
        }
        return makeFakeReceipt({ transactionHash: hash })
      },
    })
    const { mockEngine } = makeVerifyEngine({
      readiness: makeReadinessResponse({
        verified: true,
        privacyRegistered: true,
      }),
    })
    const { mockServer, getHandler } = makeCapturingMcpServer()

    registerRegisterIdentityTool(
      mockServer,
      mockEngine,
      makeConfig({
        baseSepoliaRpc: 'https://base-sepolia.example',
        agentStateDir: tempDir,
      }),
      {
        createClients: () => clients,
      },
    )

    const handler = getHandler()
    const result = await handler({
      stateFilePath: requestedStateFilePath,
    })
    const body = parseToolResponse(result)

    expect(body.success).toBe(false)
    expect(body.error).toMatchObject({
      code: 'STATE_PERSIST_FAILED',
    })
    expect(body.nextAction).toBe(
      `Re-run register_identity with a writable stateFilePath so the agent state file exists locally before deposit_bond -> join_auction. Expected path: ${path.resolve(requestedStateFilePath)}`,
    )
    expect(body.partial).toMatchObject({
      agentId: '99',
      erc8004TxHash: identityTxHash,
      stateFilePath: path.resolve(requestedStateFilePath),
      localStateFileExists: false,
      wallet: TEST_WALLET,
      readiness: {
        walletConfigured: true,
        erc8004Registered: true,
        privacyRegistryRegistered: true,
        readyToParticipate: true,
      },
    })
    expect(writeCalls).toHaveLength(1)
  })
})
