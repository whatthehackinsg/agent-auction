# Chainlink CRE Workflow Testing Guide (2026)

## Official Testing Approach

Chainlink recommends a **three-layer testing strategy** for CRE workflows:

### Layer 1: Local Simulation (No DON Required)
**Command**: `cre workflow simulate`

**What it does**:
- Compiles your workflow to WebAssembly (WASM)
- Runs on your local machine
- Makes **real calls** to public testnets and live HTTP endpoints
- Supports all trigger types: Cron, HTTP, EVM Log

**When to use**: Development, debugging, validation before deployment

**Key features**:
- Interactive mode (default): Prompts for trigger selection and input
- Non-interactive mode: Automated testing for CI/CD
- Dry-run by default for onchain writes (use `--broadcast` to actually send)
- No authorization required for simulation (empty config allowed)

---

## Testing Strategies by Trigger Type

### HTTP Trigger Testing

**Interactive mode**:
```bash
cre workflow simulate my-workflow --target staging-settings
# CLI prompts: select HTTP trigger, enter JSON payload
```

**Non-interactive mode** (CI/CD):
```bash
# Inline JSON
cre workflow simulate my-workflow \
  --non-interactive \
  --trigger-index 0 \
  --http-payload '{"userId":"123","action":"purchase","amount":100}' \
  --target staging-settings

# From file
cre workflow simulate my-workflow \
  --non-interactive \
  --trigger-index 0 \
  --http-payload @./test-payload.json \
  --target staging-settings
```

**Test scenarios**:
- Valid request: `{"userId":"123","action":"purchase","amount":100}`
- Invalid input (below minimum): `{"userId":"123","action":"purchase","amount":5}`
- Missing fields: `{"userId":"123","action":"purchase"}` (no amount)

### EVM Log Trigger Testing

**Non-interactive mode**:
```bash
cre workflow simulate my-workflow \
  --non-interactive \
  --trigger-index 2 \
  --evm-tx-hash 0x420721d7d00130a03c5b525b2dbfd42550906ddb3075e8377f9bb5d1a5992f8e \
  --evm-event-index 0 \
  --target staging-settings
```

**Note**: `--trigger-index` selects which handler to run; `--evm-event-index` selects which log in the transaction.

### Cron Trigger Testing

```bash
# Interactive
cre workflow simulate my-workflow --target staging-settings
# Select cron trigger when prompted

# Non-interactive
cre workflow simulate my-workflow \
  --non-interactive \
  --trigger-index 0 \
  --target staging-settings
```

---

## Layer 2: Unit Testing with SDK Test Framework

**Module**: `@chainlink/cre-sdk/test`

The SDK provides a **test-only runtime** for unit testing workflow logic without WASM compilation.

### Core APIs

```typescript
import {
  test,                    // Test harness (wraps bun:test)
  newTestRuntime,          // Create test runtime
  TestRuntime,             // Runtime for tests
  EvmMock,                 // Mock EVM client
  HttpActionsMock,         // Mock HTTP client
  addContractMock,         // Register contract mocks
  registerTestCapability,  // Register custom capability handlers
} from '@chainlink/cre-sdk/test'
```

### Basic Test Pattern

```typescript
import { test, newTestRuntime, EvmMock, addContractMock } from '@chainlink/cre-sdk/test'
import { ClientCapability as EvmClientCapability } from '@cre/generated-sdk/capabilities/blockchain/evm/v1alpha/client_sdk_gen'

test('my workflow reads contract state', async () => {
  // 1. Create mock
  const evmMock = EvmMock.testInstance(11155111n) // Sepolia chain selector
  
  // 2. Register contract mock
  const contractMock = addContractMock(evmMock, {
    address: '0x1234567890123456789012345678901234567890',
    abi: MyContractABI,
  })
  
  // 3. Set handler for view function
  contractMock.balanceOf = (address: string) => {
    return 1000000000000000000n // 1 token
  }
  
  // 4. Create test runtime
  const runtime = newTestRuntime()
  
  // 5. Call your workflow logic
  const capability = new EvmClientCapability()
  const result = capability.callContract(runtime, {
    chainSelector: 11155111n,
    to: '0x1234567890123456789012345678901234567890',
    data: encodeFunctionData({ abi: MyContractABI, functionName: 'balanceOf', args: ['0xabc...'] }),
  }).result()
  
  // 6. Assert
  expect(result.data).toBeDefined()
})
```

### Contract Mock Pattern

```typescript
// For view/pure functions
contractMock.functionName = (...args) => {
  // Return value matching function signature
  return expectedValue
}

// For write operations (via onReport)
contractMock.writeReport = (input: WriteReportMockInput) => {
  const { receiver, report, gasConfig } = input
  // Validate and return WriteReportReply
  return { txHash: '0x...' }
}
```

### Testing with Secrets

```typescript
test('workflow uses secrets', async () => {
  const secrets = new Map([
    ['default', new Map([
      ['API_KEY', 'test-key-123'],
      ['DB_URL', 'postgres://localhost'],
    ])],
  ])
  
  const runtime = newTestRuntime(secrets)
  // Workflow can now access secrets via runtime.getSecret()
})
```

### Testing with Custom Time

```typescript
test('workflow respects time', async () => {
  const runtime = newTestRuntime()
  
  // Set custom time provider
  runtime.setTimeProvider(() => 1704067200000) // Jan 1, 2024
  
  // Workflow logic that depends on time
  const result = myWorkflowLogic(runtime)
  expect(result).toBeDefined()
})
```

### Accessing Logs

```typescript
test('workflow logs correctly', async () => {
  const runtime = newTestRuntime()
  
  // Run workflow
  myWorkflowLogic(runtime)
  
  // Check logs
  const logs = runtime.getLogs()
  expect(logs).toContain('Expected log message')
})
```

---

## Layer 3: Integration Testing

**For deployed workflows**, use the **Local JWT Server** tool:

```bash
npm install @chainlink/cre-http-trigger
```

This tool:
- Runs a local HTTP server
- Handles JWT generation and signing automatically
- Forwards requests to the CRE gateway
- Eliminates manual JWT token creation

**Usage**:
```typescript
import { createLocalServer } from '@chainlink/cre-http-trigger'

const server = await createLocalServer({
  privateKey: '0x...',
  workflowId: 'my-workflow-id',
})

// Send test request
const response = await fetch('http://localhost:3000/trigger', {
  method: 'POST',
  body: JSON.stringify({ userId: '123', action: 'purchase' }),
})
```

---

## Simulation Command Reference

### Basic Syntax
```bash
cre workflow simulate <workflow-name-or-path> [flags]
```

### Common Flags

| Flag | Short | Purpose |
|------|-------|---------|
| `--target` | `-T` | Target environment (staging-settings, etc.) |
| `--non-interactive` | | Skip prompts, use flags instead |
| `--trigger-index` | | Which handler to run (0-based) |
| `--http-payload` | | JSON payload for HTTP trigger |
| `--evm-tx-hash` | | Transaction hash for EVM log trigger |
| `--evm-event-index` | | Event index in transaction |
| `--broadcast` | | Actually send onchain writes (default: dry-run) |
| `--engine-logs` | `-g` | Show internal engine logs |
| `--verbose` | `-v` | Debug-level CLI logging |

### Example: Full CI/CD Pipeline

```bash
#!/bin/bash
set -e

# 1. Lint
npm run lint

# 2. Simulate HTTP trigger
cre workflow simulate settlement-workflow \
  --non-interactive \
  --trigger-index 0 \
  --http-payload @./test-payloads/valid-settlement.json \
  --target staging-settings

# 3. Simulate EVM log trigger
cre workflow simulate settlement-workflow \
  --non-interactive \
  --trigger-index 1 \
  --evm-tx-hash 0x... \
  --evm-event-index 0 \
  --target staging-settings

# 4. Unit tests
npm test

# 5. Deploy (if all pass)
cre workflow deploy settlement-workflow --target production
```

---

## SDK Test Utilities Deep Dive

### Generated Mocks

The SDK auto-generates mocks for all capabilities:

```typescript
import {
  EvmMock,                    // EVM client mock
  HttpActionsMock,            // HTTP client mock
  ConsensusMock,              // Consensus mock
  ConfidentialHttpMock,       // Confidential HTTP mock
} from '@chainlink/cre-sdk/test'
```

Each mock:
- Has a `.testInstance()` static method
- Registers itself automatically when created inside `test()`
- Supports method-level handlers
- Throws clear errors if handler not set

### Example: HTTP Client Mock

```typescript
import { HttpActionsMock } from '@chainlink/cre-sdk/test'
import { HttpClientCapability } from '@cre/generated-sdk/capabilities/networking/http/v1alpha/http_client_sdk_gen'

test('workflow fetches data', async () => {
  const httpMock = HttpActionsMock.testInstance()
  
  httpMock.get = (url: string) => {
    if (url === 'https://api.example.com/data') {
      return {
        statusCode: 200,
        body: JSON.stringify({ price: 42 }),
      }
    }
    throw new Error(`Unexpected URL: ${url}`)
  }
  
  const runtime = newTestRuntime()
  const httpClient = new HttpClientCapability()
  
  const result = httpClient.get(runtime, {
    url: 'https://api.example.com/data',
  }).result()
  
  expect(result.statusCode).toBe(200)
})
```

### Registering Custom Capabilities

```typescript
import { registerTestCapability } from '@chainlink/cre-sdk/test'

test('workflow with custom capability', async () => {
  registerTestCapability('my-custom-capability', (request) => {
    if (request.method === 'MyMethod') {
      return {
        response: {
          case: 'payload',
          value: anyPack(MyResponseSchema, { result: 'success' }),
        },
      }
    }
    return {
      response: {
        case: 'error',
        value: `Unknown method: ${request.method}`,
      },
    }
  })
  
  const runtime = newTestRuntime()
  // Workflow can now call custom capability
})
```

---

## Secrets Management in Tests

### Declaring Secrets (secrets.yaml)

```yaml
secrets:
  - id: API_KEY
    namespace: default
  - id: DB_PASSWORD
    namespace: database
```

### Providing Secrets in Simulation

**Via .env file**:
```bash
# .env
API_KEY=test-key-123
DB_PASSWORD=secret-password
```

**Via environment variables**:
```bash
export API_KEY=test-key-123
export DB_PASSWORD=secret-password
cre workflow simulate my-workflow --target staging-settings
```

### Accessing Secrets in Workflow

```typescript
const apiKey = await runtime.getSecret('API_KEY')
const dbPassword = await runtime.getSecret('DB_PASSWORD', 'database')
```

---

## Testing Onchain Writes

### Dry-Run (Default)

```bash
cre workflow simulate my-workflow --target staging-settings
# Transaction prepared but NOT sent
# Output: "Write report transaction succeeded: 0x0000000000000000000000000000000000000000000000000000000000000000"
```

### Broadcast (Real Transaction)

```bash
# Requires CRE_ETH_PRIVATE_KEY in .env
cre workflow simulate my-workflow --broadcast --target staging-settings
# Transaction actually sent to testnet
# Output: "Write report transaction succeeded: 0x1013abc0b6f345fad15b19a56cabbbaab2a2aa94f81eb3a709058adf18a4f23f"
```

### Unit Test with Mock

```typescript
test('workflow writes to contract', async () => {
  const evmMock = EvmMock.testInstance(84532n) // Base Sepolia
  
  const contractMock = addContractMock(evmMock, {
    address: '0xAuctionEscrow...',
    abi: AuctionEscrowABI,
  })
  
  contractMock.writeReport = (input: WriteReportMockInput) => {
    const { receiver, report, gasConfig } = input
    
    // Validate report
    expect(receiver).toBeDefined()
    expect(report).toBeDefined()
    expect(gasConfig).toBeDefined()
    
    // Return success
    return {
      txHash: '0x...',
      status: 1,
    }
  }
  
  const runtime = newTestRuntime()
  const evm = new EvmClientCapability()
  
  // Call writeReport
  const result = evm.writeReport(runtime, {
    chainSelector: 84532n,
    receiver: '0xAuctionEscrow...',
    report: myReport,
    gasConfig: { gasLimit: 500000n },
  }).result()
  
  expect(result.txHash).toBeDefined()
})
```

---

## Limitations of Simulation

1. **Single-node execution**: Runs locally, not across DON
2. **No actual consensus**: Simulated, not real Byzantine Fault Tolerance
3. **Manual trigger execution**: Cron triggers run immediately, not on schedule
4. **Simplified environment**: Edge cases may only appear in production

---

## Best Practices

### 1. Test Pyramid
- **Unit tests** (70%): Mock all capabilities, test logic in isolation
- **Integration tests** (20%): Simulate with real testnets
- **Smoke tests** (10%): Deploy to staging, verify end-to-end

### 2. Organize Test Payloads
```
my-workflow/
├── index.ts
├── config.staging.json
├── test-payloads/
│   ├── valid-request.json
│   ├── invalid-request.json
│   └── edge-case.json
└── test-payloads.ts (unit tests)
```

### 3. CI/CD Integration
```yaml
# .github/workflows/test.yml
name: Test CRE Workflow
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: oven-sh/setup-bun@v1
      - run: npm install
      - run: npm test
      - run: cre workflow simulate my-workflow --non-interactive --trigger-index 0 --http-payload @./test-payloads/valid.json --target staging-settings
```

### 4. Error Handling
```typescript
test('workflow handles errors gracefully', async () => {
  const httpMock = HttpActionsMock.testInstance()
  
  httpMock.get = () => {
    throw new Error('Network timeout')
  }
  
  const runtime = newTestRuntime()
  
  // Workflow should catch and handle error
  const result = myWorkflowLogic(runtime)
  expect(result.error).toBeDefined()
})
```

---

## Summary: Testing Checklist

- [ ] **Unit tests**: Mock all capabilities, test logic in isolation
- [ ] **Simulation**: Run `cre workflow simulate` for each trigger type
- [ ] **Secrets**: Test with `.env` file in simulation
- [ ] **Onchain writes**: Test dry-run first, then `--broadcast` on testnet
- [ ] **Error cases**: Test invalid inputs, missing fields, network errors
- [ ] **Logs**: Verify expected log messages appear
- [ ] **Time-dependent logic**: Use `runtime.setTimeProvider()`
- [ ] **CI/CD**: Automate simulation in GitHub Actions / GitLab CI
- [ ] **Deployment**: Deploy to staging first, verify end-to-end

---

## References

- **Official Docs**: https://docs.chain.link/cre/guides/operations/simulating-workflows
- **HTTP Trigger Testing**: https://docs.chain.link/cre/guides/workflow/using-triggers/http-trigger/testing-in-simulation
- **SDK Test Module**: `@chainlink/cre-sdk/test`
- **Local JWT Server**: `@chainlink/cre-http-trigger`
- **Examples**: https://github.com/smartcontractkit/cre-sdk-typescript/tree/main/packages/cre-sdk-examples
