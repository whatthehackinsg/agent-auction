# Testing Patterns

**Analysis Date:** 2026-03-02

## Test Framework

**JavaScript/TypeScript:**

**Test Runners:**
- **Vitest** (primary for Node.js, Cloudflare Workers)
  - Version: 2.0–4.x depending on module (engine uses 3.2.4, crypto uses 2.0.0)
  - Config: `vitest.config.ts` in `engine/` and `packages/crypto/`
  - Lightweight, fast, ESM-native

- **Bun** (CRE settlement workflow)
  - Built-in test runner with `bun:test` module
  - Used in `cre/workflows/settlement.test.ts`

**Assertion Library:**
- Vitest built-in assertions (no external library needed)
- `expect()` API with Jest-compatible matchers
- Bun test: `describe`, `test`, `expect` from `bun:test`

**Run Commands:**
```bash
# Crypto package
cd packages/crypto
npm test                           # Run all tests (requires --experimental-vm-modules)
npm run test:watch                 # Watch mode

# Engine (Cloudflare Workers)
cd engine
npm run test                       # Run all tests
npm run test:watch                 # Watch mode
npm run typecheck                  # Type checking

# CRE settlement
cd cre
bun test                           # Run all tests
```

**Solidity (Foundry):**
```bash
cd contracts
forge test                         # Run all 144 tests
forge test --match-contract Escrow # Run specific test contract
forge test --match-test testDeposit # Run specific test
forge test -vvv                    # Verbose with stack traces
```

## Test File Organization

**Location:**
- **TypeScript**: Co-located in `test/` directory at module root
  - `engine/test/` — separate from `engine/src/`
  - `packages/crypto/test/` — separate from `packages/crypto/src/`
  - `cre/workflows/settlement.test.ts` — co-located with workflow source

- **Solidity**: `contracts/test/` directory with `.t.sol` suffix
  - `contracts/test/AuctionRegistry.t.sol` for `contracts/src/AuctionRegistry.sol`

**Naming:**
- `*.test.ts` for Vitest files
- `*.t.sol` for Foundry test files
- Bun uses `*.test.ts` with `bun:test` imports

**Structure:**
```
engine/
├── src/
│   ├── auction-room.ts
│   ├── handlers/
│   │   └── actions.ts
│   └── lib/
│       └── bond-watcher.ts
└── test/
    ├── setup.ts              # Shared utilities
    ├── auction-room.test.ts
    ├── actions.test.ts
    ├── bond-watcher.test.ts
    └── websocket.test.ts
```

## Test Structure

**Vitest Suite Organization:**
```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'

describe('AuctionRoom DO', () => {
  let state: ReturnType<typeof createMockState>
  let env: ReturnType<typeof createMockEnv>
  let room: AuctionRoom

  beforeEach(async () => {
    state = createMockState()
    env = createMockEnv()
    room = new AuctionRoom(state, env)
    await new Promise((r) => setTimeout(r, 0))  // Flush microtasks
  })

  it('should validate action', async () => {
    // Test code
  })
})
```

**Bun Test Structure:**
```typescript
import { describe, expect } from "bun:test"
import { test, newTestRuntime, EvmMock } from "@chainlink/cre-sdk/test"

const BASE_CONFIG = {
  chainSelectorName: "ethereum-testnet-sepolia-base-1",
  auctionRegistryAddress: "0xFEc7a05707AF85C6b248314E20FF8EfF590c3639",
  // ... config
}

describe('CRE Settlement', () => {
  test('should process AuctionEnded event', async (ctx) => {
    // Test code
  })
})
```

**Foundry Test Structure:**
```solidity
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {AuctionRegistry} from "../src/AuctionRegistry.sol";

contract AuctionRegistryTest is Test {
    AuctionRegistry registry;
    address sequencer;
    address owner;

    function setUp() public {
        sequencer = vm.addr(0xA11CE);
        owner = address(this);
        registry = new AuctionRegistry(sequencer);
    }

    function test_constructor_setsDomainSeparator() public view {
        bytes32 ds = registry.DOMAIN_SEPARATOR();
        assertTrue(ds != bytes32(0), "Domain separator should be set");
    }
}
```

**Patterns:**
- Setup in `beforeEach()` / `setUp()` for test isolation
- Teardown in `afterEach()` for cleanup (e.g., removing env vars)
- One logical assertion per test (test name describes what is tested)
- Clear test names: `test_{method}_{condition}_{expectation}`

## Mocking

**Framework (TypeScript):** Vitest built-in mocking (or manual mock objects)

**Patterns:**

Mock Durable Object Storage (manual, since Vitest 4.x incompatible with workers pool):
```typescript
function createMockStorage() {
  const store = new Map<string, unknown>()
  return {
    get: async <T = unknown>(key: string): Promise<T | undefined> => {
      return store.get(key) as T | undefined
    },
    put: async (key: string, value: unknown): Promise<void> => {
      store.set(key, value)
    },
    delete: async (key: string): Promise<boolean> => {
      return store.delete(key)
    },
    list: async (): Promise<Map<string, unknown>> => {
      return new Map(store)
    },
    _store: store,  // Expose for assertions
  } as unknown as DurableObjectStorage & { _store: Map<string, unknown> }
}
```

Mock DurableObjectState:
```typescript
function createMockState() {
  const storage = createMockStorage()
  const acceptedWebSockets: unknown[] = []

  return {
    storage,
    id: {
      toString: () => 'test-do-id',
      equals: (other: { toString: () => string }) => other.toString() === 'test-do-id',
      name: 'test-auction',
    },
    blockConcurrencyWhile: async <T>(callback: () => Promise<T>): Promise<T> => callback(),
    acceptWebSocket: (ws: unknown) => acceptedWebSockets.push(ws),
    getWebSockets: () => [] as unknown[],
    waitUntil: () => {},
    _acceptedWebSockets: acceptedWebSockets,
  } as unknown as DurableObjectState & { _acceptedWebSockets: unknown[] }
}
```

Mock D1Database:
```typescript
env: ReturnType<typeof createMockEnv> = {
  AUCTION_DB: {} as D1Database,
  AUCTION_ROOM: {} as DurableObjectNamespace,
}
```

**CRE Mocks (Bun):**
```typescript
import { EvmMock, HttpActionsMock, newTestRuntime } from "@chainlink/cre-sdk/test"

const runtime = newTestRuntime() as unknown as Runtime<typeof BASE_CONFIG>
runtime.config = { ...BASE_CONFIG }

// Mock EVM calls and HTTP actions via SDK test utilities
```

**Solidity Mocks:**
- No mocking framework; use `Test` base class helpers
- Prank user: `vm.prank(address)` sets next call to impersonate user
- Set block data: `vm.warp(timestamp)`, `vm.roll(blockNumber)`
- Expect reverts: `vm.expectRevert(Error.selector)` or `vm.expectRevert("message")`

**What to Mock:**
- External service calls (HTTP, EVM, database)
- Time-dependent operations (block.timestamp mocks)
- Random values (use deterministic test data)
- Large or expensive operations (IPFS pinning, deployment)

**What NOT to Mock:**
- Core business logic (validate, hash, settle)
- Type conversions and utility functions
- Database schema (use real in-memory schema)
- Cryptographic operations (real signing, hashing)

## Fixtures and Factories

**Test Data:**
```typescript
const TEST_AUCTION_ID = '0x' + 'aa'.repeat(32)
const TEST_WALLET = '0x1234567890abcdef1234567890abcdef12345678'
const TEST_AGENT = '12345'

function makeAction(overrides?: Partial<ActionRequest>): ActionRequest {
  return {
    type: ActionType.JOIN,
    agentId: TEST_AGENT,
    wallet: TEST_WALLET,
    amount: '0',
    nonce: 0,
    signature: '0x' + '00'.repeat(65),
    ...overrides,
  }
}

function makeAuctionEndedLog() {
  const winnerAgentTopic = toHex(MOCK_WINNER_AGENT_ID, { size: 32 })
  return {
    topics: [AUCTION_ENDED_SIGNATURE, MOCK_AUCTION_ID, winnerAgentTopic],
    data: encodeAbiParameters(...)
  }
}
```

**Location:**
- Shared fixtures in `test/setup.ts` (engine module)
- Per-test file fixtures at top of file (crypto, CRE)
- Helper functions (`create*`, `make*`) for generating test objects

**Randomization:**
```typescript
export function randomAuctionId(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return '0x' + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
}

export function randomWallet(): string {
  const bytes = new Uint8Array(20)
  crypto.getRandomValues(bytes)
  return '0x' + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
}
```

## Coverage

**Requirements:** Not enforced (no coverage thresholds in config)

**View Coverage (if enabled):**
```bash
# Would need to add coverage option to vitest.config.ts
npm run test -- --coverage
```

**Coverage gaps:**
- Frontend (Next.js): No tests observed
- MCP server: No unit tests observed
- Smart contracts: 144 tests (good coverage per recent commits)

## Test Types

**Unit Tests:**
- **Scope**: Single function/method in isolation
- **Approach**: Mock dependencies, test pure logic
- **Example**: `checkNonce()` validates nonce sequencing
- **Location**: `engine/test/actions.test.ts`, `packages/crypto/test/eip712.test.ts`

**Integration Tests:**
- **Scope**: Multiple components working together
- **Approach**: Real or semi-real dependencies (mock only external services)
- **Example**: AuctionRoom with mocked D1/DO storage, but real action handlers
- **Location**: `engine/test/auction-room.test.ts`, `engine/test/auction-mechanics.test.ts`

**E2E Tests:**
- **Framework**: Not formalized; CRE settlement workflow is closest (triggers on-chain events)
- **Approach**: Real blockchain interaction via Foundry fork or testnet
- **Example**: `cre/workflows/settlement.test.ts` (uses mock EVM but full CRE SDK)
- **Location**: `contracts/test/` (Foundry tests are end-to-end contract interactions)

**Contract Tests (Foundry):**
- 144 tests across AuctionRegistry, AuctionEscrow, NftEscrow
- Test state machines, signature verification, settlement logic
- Uses `vm` cheatcodes for time manipulation and user impersonation

## Common Patterns

**Async Testing:**
```typescript
it('accepts nonce 0 for first action', async () => {
  await expect(
    checkNonce(TEST_AGENT, ActionType.JOIN, 0, storage)
  ).resolves.toBeUndefined()

  expect(storage._store.get(`nonce:${TEST_AGENT}:JOIN`)).toBeUndefined()
})

it('rejects non-zero nonce for first action', async () => {
  await expect(
    checkNonce(TEST_AGENT, ActionType.JOIN, 1, storage)
  ).rejects.toThrow('expected 0')
})
```

**Error Testing:**
```typescript
// Vitest
it('should throw on invalid action', async () => {
  await expect(() => validateAction(invalidAction)).rejects.toThrow('expected 0')
})

// Foundry
function test_setEscrow_revertsZeroAddress() public {
    AuctionRegistry fresh = new AuctionRegistry(sequencer);
    vm.expectRevert(AuctionRegistry.ZeroAddress.selector);
    fresh.setEscrow(address(0));
}
```

**State Verification:**
```typescript
// After action, verify state changed
await checkNonce(TEST_AGENT, ActionType.JOIN, 0, storage)
await commitValidationMutation({ agentId: TEST_AGENT, actionType: ActionType.JOIN, nonce: 0 }, storage)
await checkNonce(TEST_AGENT, ActionType.JOIN, 1, storage)  // Should accept nonce 1

expect(storage._store.get(`nonce:${TEST_AGENT}:JOIN`)).toBe(1)
```

**Roundtrip Testing:**
```typescript
it('roundtrips: sign with wallet, verify recovers signer', async () => {
  const wallet = ethers.Wallet.createRandom()
  const message = { auctionId: 1, amount: 500, nonce: 0, deadline: 9999999 }
  const { domain, types, value } = encodeTypedData(TEST_DOMAIN, 'Bid', message)

  const sig = await wallet.signTypedData(domain, types, value)
  const recovered = verifyEIP712Signature(TEST_DOMAIN, 'Bid', message, sig)

  expect(recovered.toLowerCase()).toBe(wallet.address.toLowerCase())
})
```

**Determinism Testing:**
```typescript
it('is deterministic', () => {
  const msg = { auctionId: 1, amount: 500, nonce: 0, deadline: 9999999 }
  const a = hashTypedData(TEST_DOMAIN, 'Bid', msg)
  const b = hashTypedData(TEST_DOMAIN, 'Bid', msg)
  expect(Buffer.from(a).toString('hex')).toBe(Buffer.from(b).toString('hex'))
})
```

**Vector Testing (via JSON fixtures):**
```typescript
import vectors from './poseidon-vectors.json'

describe('poseidonHash', () => {
  for (const v of vectors) {
    it(`matches test vector: ${v.name}`, async () => {
      const inputs = v.inputs.map((x: string) => BigInt(x))
      const result = await poseidonHash(inputs)
      expect(result.toString()).toBe(v.expectedOutput)
    })
  }
})
```

## Special Test Utilities

**Miniflare (Cloudflare Workers testing):**
```typescript
export function createTestMiniflare(): Miniflare {
  return new Miniflare({
    modules: true,
    script: `export default { fetch() { return new Response('ok'); } }`,
    d1Databases: { AUCTION_DB: 'test-auction-db' },
  })
}

// Apply schema to D1
export async function applySchema(db: D1Database): Promise<void> {
  const raw = readSchema()
  const statements = raw.split('\n').filter(line => !line.trimStart().startsWith('--')).join('\n').split(';')
  for (const stmt of statements) {
    await db.prepare(stmt).run()
  }
}
```

**Foundry Cheatcodes:**
```solidity
vm.prank(address)                    // Next call from address
vm.warp(timestamp)                   // Set block.timestamp
vm.roll(blockNumber)                 // Set block number
vm.expectRevert(Error.selector)      // Expect next call to revert
vm.sign(privateKey, digest)          // Sign message
```

---

*Testing analysis: 2026-03-02*
