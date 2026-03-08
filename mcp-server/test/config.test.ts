import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { loadDefaultEnvFileForStartup } from '../src/lib/config.js'

const ORIGINAL_ENV = { ...process.env }
const ORIGINAL_CWD = process.cwd()

function restoreEnv() {
  for (const key of Object.keys(process.env)) {
    delete process.env[key]
  }
  Object.assign(process.env, ORIGINAL_ENV)
}

afterEach(() => {
  restoreEnv()
  process.chdir(ORIGINAL_CWD)
})

describe('loadDefaultEnvFileForStartup', () => {
  it('loads .env.agentkit.local when present and leaves existing env vars intact', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'auction-mcp-env-'))
    await fs.writeFile(
      path.join(dir, '.env.agentkit.local'),
      [
        '# Supported AgentKit/CDP path',
        'MCP_WALLET_BACKEND=agentkit',
        'ENGINE_URL=https://auction-engine.example.workers.dev',
        'CDP_NETWORK_ID=base-sepolia # inline comment should be ignored',
      ].join('\n'),
      'utf8',
    )

    process.chdir(dir)
    process.env.ENGINE_URL = 'https://override.example'

    const loaded = loadDefaultEnvFileForStartup()

    expect(path.basename(loaded ?? '')).toBe('.env.agentkit.local')
    expect(process.env.MCP_WALLET_BACKEND).toBe('agentkit')
    expect(process.env.ENGINE_URL).toBe('https://override.example')
    expect(process.env.CDP_NETWORK_ID).toBe('base-sepolia')
  })

  it('returns null when the default env file is missing', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'auction-mcp-env-missing-'))
    process.chdir(dir)

    expect(loadDefaultEnvFileForStartup()).toBeNull()
  })
})
