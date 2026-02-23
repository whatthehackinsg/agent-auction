# CRE Workflow Testing Patterns & Examples (2026)

**Source**: Analysis of `smartcontractkit/cre-sdk-typescript` and `smartcontractkit/cre-bootcamp-2026`

---

## 1. SIMULATION TESTING (Primary Method)

### 1.1 Basic Simulation Command

```bash
# Interactive mode (prompts for trigger selection)
cre workflow simulate <workflow-path> --target <target-name>

# Example
cre workflow simulate ./src/workflows/hello-world --target staging-settings
```

**Output**:
```
Workflow compiled
🚀 Workflow simulation ready. Please select a trigger:
1. [email protected] Trigger
2. [email protected] Trigger
3. evm:ChainSelector:[email protected] LogTrigger

Enter your choice (1-3):
```

### 1.2 Non-Interactive Simulation (CI/CD)

```bash
# Cron trigger (no additional flags needed)
cre workflow simulate ./my-workflow \
  --non-interactive \
  --trigger-index 0 \
  --target staging-settings

# HTTP trigger with payload
cre workflow simulate ./my-workflow \
  --non-interactive \
  --trigger-index 1 \
  --http-payload '{"key":"value"}' \
  --target staging-settings

# HTTP trigger with file
cre workflow simulate ./my-workflow \
  --non-interactive \
  --trigger-index 1 \
  --http-payload @./payload.json \
  --target staging-settings

# EVM log trigger
cre workflow simulate ./my-workflow \
  --non-interactive \
  --trigger-index 2 \
  --evm-tx-hash 0x9394cc015736e536da215c31e4f59486a8d85f4cfc3641e309bf00c34b2bf410 \
  --evm-event-index 0 \
  --target staging-settings
```

### 1.3 Broadcast Flag (Real Transactions)

```bash
# Dry run (default) - prepares transaction but doesn't broadcast
cre workflow simulate ./my-workflow --target staging-settings

# Broadcast to testnet - requires CRE_ETH_PRIVATE_KEY in .env
cre workflow simulate ./my-workflow \
  --broadcast \
  --target staging-settings
```

### 1.4 Additional Flags

```bash
# Enable engine logging for debugging
cre workflow simulate ./my-workflow --engine-logs --target staging-settings

# Verbose CLI logging
cre workflow simulate ./my-workflow --verbose --target staging-settings
```

---

## 2. E2E TEST SCRIPTS (CI/CD Pattern)

### 2.1 Example: Hello-World E2E Test

**File**: `scripts/e2e/simulate-hello-world.sh`

```bash
#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
EXAMPLES_DIR="$ROOT_DIR/packages/cre-sdk-examples"
OUTPUT_FILE="$(mktemp)"

cleanup() { rm -f "$OUTPUT_FILE"; }
trap cleanup EXIT

cd "$EXAMPLES_DIR"
cp -n .env.example .env 2>/dev/null || true

echo "Running hello-world workflow simulation..."
cre workflow simulate ./src/workflows/hello-world > "$OUTPUT_FILE" 2>&1
cat "$OUTPUT_FILE"

# --- Validation ---
echo ""
echo "Validating simulation output..."

CHECKS=(
  'USER LOG.*Hello world! Workflow triggered|[USER LOG] Hello world! Workflow triggered.'
  'Workflow Simulation Result:|Workflow Simulation Result:'
  '"Hello world!"|"Hello world!"'
  'Execution finished signal received|Execution finished signal received'
)

for check in "${CHECKS[@]}"; do
  pattern="${check%%|*}"
  label="${check##*|}"
  if ! grep -q "$pattern" "$OUTPUT_FILE"; then
    echo "❌ ERROR: Expected '$label' not found"
    exit 1
  fi
  echo "✓ Found: $label"
done

echo "✅ All validation checks passed!"
```

### 2.2 Example: Log-Trigger E2E Test

**File**: `scripts/e2e/simulate-log-trigger.sh`

```bash
#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
EXAMPLES_DIR="$ROOT_DIR/packages/cre-sdk-examples"
OUTPUT_FILE="$(mktemp)"

cleanup() { rm -f "$OUTPUT_FILE"; }
trap cleanup EXIT

cd "$EXAMPLES_DIR"
cp -n .env.example .env 2>/dev/null || true

echo "Running log-trigger workflow simulation..."
SIM_EXIT=0
cre workflow simulate ./src/workflows/log-trigger \
  --non-interactive \
  --trigger-index 0 \
  --evm-tx-hash 0x9394cc015736e536da215c31e4f59486a8d85f4cfc3641e309bf00c34b2bf410 \
  --evm-event-index 0 \
  > "$OUTPUT_FILE" 2>&1 || SIM_EXIT=$?
cat "$OUTPUT_FILE"

if [ "$SIM_EXIT" -ne 0 ]; then
  echo "❌ ERROR: cre workflow simulate exited with code $SIM_EXIT"
  exit "$SIM_EXIT"
fi

# --- Validation ---
echo ""
echo "Validating simulation output..."

CHECKS=(
  'Running trigger.*evm|Running trigger evm'
  'USER LOG.*Running LogTrigger|[USER LOG] Running LogTrigger'
  'USER LOG.*Contract address: 0x1d598672486ecb50685da5497390571ac4e93fdc|[USER LOG] Contract address'
  'USER LOG.*Topics: 0xc799f359194674b273986b8c03283265390f642b631c04e6526b99d0d8f4c38d|[USER LOG] Topics'
  'USER LOG.*Tx hash: 0x9394cc015736e536da215c31e4f59486a8d85f4cfc3641e309bf00c34b2bf410|[USER LOG] Tx hash'
  'USER LOG.*Block number: 9559751|[USER LOG] Block number: 9559751'
  'USER LOG.*Block timestamp:|[USER LOG] Block timestamp'
  'Workflow Simulation Result:|Workflow Simulation Result:'
  '"success"|"success"'
  'Execution finished signal received|Execution finished signal received'
)

for check in "${CHECKS[@]}"; do
  pattern="${check%%|*}"
  label="${check##*|}"
  if ! grep -q "$pattern" "$OUTPUT_FILE"; then
    echo "❌ ERROR: Expected '$label' not found"
    exit 1
  fi
  echo "✓ Found: $label"
done

echo "✅ All validation checks passed!"
```

---

## 3. UNIT TESTING (Bun Test Framework)

### 3.1 Test Setup

**Runtime**: Bun (v1.2.21+)  
**Framework**: `bun:test` (built-in)  
**Test Files**: `*.test.ts` or `*.spec.ts`

### 3.2 Mock Integration Test Example

**File**: `packages/cre-sdk/src/sdk/test/mock-integration.test.ts`

```typescript
import { test as bunTest, describe, expect } from 'bun:test'
import { BasicTestActionMock, EvmMock, newTestRuntime, test } from '@chainlink/cre-sdk/test'
import { ClientCapability as EvmClientCapability } from '@cre/generated-sdk/capabilities/blockchain/evm/v1alpha/client_sdk_gen'
import { BasicActionCapability } from '@cre/generated-sdk/capabilities/internal/basicaction/v1/basicaction_sdk_gen'

const MOCK_OUTSIDE_TEST_ERROR =
	"Capability mocks must be used within the CRE test framework's test() method."

const NO_IMPL_PATTERN =
	/PerformAction: no implementation provided; set the mock's performAction property to define the return value/

describe('Generated capability mocks', () => {
	test('invoking capability without setting handler throws clear error', async () => {
		BasicTestActionMock.testInstance() // registers mock; do not set performAction
		const runtime = newTestRuntime()
		const capability = new BasicActionCapability()

		const response = capability.performAction(runtime, { inputThing: true })
		expect(() => response.result()).toThrow(NO_IMPL_PATTERN)
	})

	test('handler receives decoded input exactly as passed at call site', async () => {
		const expectedInputValue = true
		const mock = BasicTestActionMock.testInstance()
		let receivedInputThing: boolean | undefined
		mock.performAction = (input) => {
			receivedInputThing = input.inputThing
			return { adaptedThing: 'test-output' }
		}
		const runtime = newTestRuntime()
		const capability = new BasicActionCapability()

		capability.performAction(runtime, { inputThing: expectedInputValue }).result()

		expect(receivedInputThing).toBeDefined()
		expect(receivedInputThing).toBe(expectedInputValue)
	})

	test('returned output matches handler return value exactly', async () => {
		const expectedOutputValue = 'custom-adapted-result'
		const mock = BasicTestActionMock.testInstance()
		mock.performAction = () => {
			return { adaptedThing: expectedOutputValue }
		}
		const runtime = newTestRuntime()
		const capability = new BasicActionCapability()

		const result = capability.performAction(runtime, { inputThing: false }).result()

		expect(result.adaptedThing).toBe(expectedOutputValue)
	})

	test('both callCapability and awaitCapability paths return identical handler result', async () => {
		const expectedOutput = 'result-from-handler'
		const inputValue = true
		const mock = BasicTestActionMock.testInstance()
		mock.performAction = (input) => {
			expect(input.inputThing).toBe(inputValue)
			return { adaptedThing: expectedOutput }
		}
		const runtime = newTestRuntime()
		const cap = new BasicActionCapability()

		const result1 = cap.performAction(runtime, { inputThing: inputValue }).result()
		expect(result1.adaptedThing).toBe(expectedOutput)

		const result2 = cap.performAction(runtime, { inputThing: inputValue }).result()
		expect(result2.adaptedThing).toBe(expectedOutput)
	})

	test('calling testInstance twice returns same instance', async () => {
		const instance1 = BasicTestActionMock.testInstance()
		const instance2 = BasicTestActionMock.testInstance()
		expect(instance1).toBe(instance2)
	})
})

describe('Tag-aware capability mocks (EVM with chain selectors)', () => {
	test('testInstance with same chain selector returns same instance', async () => {
		const chainSelector = 11155111n // Sepolia
		const instance1 = EvmMock.testInstance(chainSelector)
		const instance2 = EvmMock.testInstance(chainSelector)
		expect(instance1).toBe(instance2)
	})

	test('testInstance with different chain selectors returns different instances', async () => {
		const sepoliaSelector = 11155111n
		const mumbaiSelector = 80001n
		const sepoliaInstance = EvmMock.testInstance(sepoliaSelector)
		const mumbaiInstance = EvmMock.testInstance(mumbaiSelector)
		expect(sepoliaInstance).not.toBe(mumbaiInstance)
	})

	test('different chain selectors register under distinct capability IDs', async () => {
		const sepoliaSelector = 11155111n
		const mumbaiSelector = 80001n

		const sepoliaMock = EvmMock.testInstance(sepoliaSelector)
		const mumbaiMock = EvmMock.testInstance(mumbaiSelector)

		sepoliaMock.callContract = () => ({ data: 'AQID' }) // base64 for [1, 2, 3]
		mumbaiMock.callContract = () => ({ data: 'BAUG' }) // base64 for [4, 5, 6]

		const runtime = newTestRuntime()
		const sepoliaCapability = new EvmClientCapability(sepoliaSelector)
		const mumbaiCapability = new EvmClientCapability(mumbaiSelector)

		const sepoliaResult = sepoliaCapability
			.callContract(runtime, { call: { to: '', data: '' } })
			.result()
		const mumbaiResult = mumbaiCapability
			.callContract(runtime, { call: { to: '', data: '' } })
			.result()

		expect(sepoliaResult.data).toEqual(new Uint8Array([1, 2, 3]))
		expect(mumbaiResult.data).toEqual(new Uint8Array([4, 5, 6]))
	})
})

bunTest('mock throws when used outside CRE test()', () => {
	expect(() => BasicTestActionMock.testInstance()).toThrow(MOCK_OUTSIDE_TEST_ERROR)
})
```

### 3.3 EVM Contract Mock Test Example

**File**: `packages/cre-sdk/src/sdk/test/evm-contract-mock.test.ts`

```typescript
import { describe, expect } from 'bun:test'
import type { GasConfigJson } from '@cre/generated/capabilities/blockchain/evm/v1alpha/client_pb'
import type { ReportResponseJson } from '@cre/generated/sdk/v1alpha/sdk_pb'
import { type Abi, type Address, encodeFunctionData } from 'viem'
import { newTestRuntime, test } from '../testutils/test-runtime'
import { addContractMock, type ContractMock } from './evm-contract-mock'
import { EvmMock } from './generated'

const MOCK_ADDRESS_A: Address = '0x1234567890123456789012345678901234567890'
const MOCK_ADDRESS_B: Address = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd'
const CHAIN_SELECTOR = 16015286601757825753n // ethereum-testnet-sepolia

const SimpleABI = [
	{
		inputs: [{ internalType: 'address[]', name: 'addresses', type: 'address[]' }],
		name: 'getNativeBalances',
		outputs: [{ internalType: 'uint256[]', name: '', type: 'uint256[]' }],
		stateMutability: 'view',
		type: 'function',
	},
	{
		inputs: [],
		name: 'typeAndVersion',
		outputs: [{ internalType: 'string', name: '', type: 'string' }],
		stateMutability: 'view',
		type: 'function',
	},
] as const satisfies Abi

describe('addContractMock', () => {
	describe('callContract routing', () => {
		test('routes calls by address and decodes/encodes correctly', () => {
			const evmMock = EvmMock.testInstance(CHAIN_SELECTOR)

			const mock = addContractMock(evmMock, {
				address: MOCK_ADDRESS_A,
				abi: SimpleABI,
			})

			mock.getNativeBalances = (addresses: unknown) => {
				return [500000000000000000n]
			}

			const runtime = newTestRuntime()
			const capability = new EvmClientCapability(CHAIN_SELECTOR)

			const result = capability
				.callContract(runtime, {
					call: {
						to: MOCK_ADDRESS_A,
						data: encodeFunctionData({
							abi: SimpleABI,
							functionName: 'getNativeBalances',
							args: [['0x1111111111111111111111111111111111111111']],
						}),
					},
				})
				.result()

			expect(result.data).toEqual(new Uint8Array([/* encoded result */]))
		})
	})
})
```

---

## 4. CI/CD INTEGRATION (GitHub Actions)

### 4.1 Full CI Workflow

**File**: `.github/workflows/ci.yml`

```yaml
name: CI
permissions:
  contents: read

on:
  pull_request:
    types: [opened, synchronize, reopened]
  push:
    branches: [main]

jobs:
  lint-format:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@08c6903cd8c0fde910a37f88322edcfb5dd907a8
        with:
          submodules: recursive
          token: ${{ secrets.GITHUB_TOKEN }}

      - name: Setup Bun
        uses: oven-sh/setup-bun@735343b667d3e6f658f44d0eca948eb6282f2b76
        with:
          bun-version: latest

      - name: Install dependencies
        run: bun install --frozen-lockfile

      - name: Check formatting & linting
        run: |
          if ! bun turbo run check:ci; then
            echo ""
            echo "=========================================="
            echo "Formatting or linting issues detected!"
            echo "Did you forget to run 'bun full-checks' (or 'bun check') before pushing?"
            echo "=========================================="
            exit 1
          fi

  full-checks:
    needs: lint-format
    runs-on: ubuntu-latest

    defaults:
      run:
        shell: zsh {0}

    steps:
      - name: Checkout code
        uses: actions/checkout@08c6903cd8c0fde910a37f88322edcfb5dd907a8
        with:
          submodules: recursive
          token: ${{ secrets.GITHUB_TOKEN }}

      - name: Install zsh
        run: |
          sudo apt-get update
          sudo apt-get install -y zsh
          if ! grep -q "^$(which zsh)$" /etc/shells; then
            echo "$(which zsh)" | sudo tee -a /etc/shells
          fi
          sudo chsh -s "$(which zsh)" $USER
        shell: bash {0}

      - name: Setup Rust (stable) with wasm target
        uses: actions-rust-lang/setup-rust-toolchain@1780873c7b576612439a134613cc4cc74ce5538c
        with:
          toolchain: stable
          target: wasm32-wasip1
          override: true

      - name: Setup Bun
        uses: oven-sh/setup-bun@735343b667d3e6f658f44d0eca948eb6282f2b76
        with:
          bun-version: latest

      - name: Cache Bun dependencies
        uses: actions/cache@v4
        with:
          path: ~/.bun/install/cache
          key: ${{ runner.os }}-bun-${{ hashFiles('**/bun.lock') }}

      - name: Install dependencies
        run: bun install --frozen-lockfile

      - name: Full checks
        run: bun full-checks

      - name: Install CRE CLI
        run: |
          chmod +x scripts/setup-cre-cli.sh
          sudo scripts/setup-cre-cli.sh

      - name: Verify CRE CLI installation
        run: cre version

      - name: E2E - Simulate hello-world workflow
        env:
          CRE_API_KEY: ${{ secrets.CRE_CLI_API_KEY }}
        run: ./scripts/e2e/simulate-hello-world.sh

      - name: E2E - Simulate star-wars workflow
        env:
          CRE_API_KEY: ${{ secrets.CRE_CLI_API_KEY }}
        run: ./scripts/e2e/simulate-star-wars.sh

      - name: E2E - Simulate log-trigger workflow
        env:
          CRE_API_KEY: ${{ secrets.CRE_CLI_API_KEY }}
        run: ./scripts/e2e/simulate-log-trigger.sh
```

### 4.2 Full-Checks Script

**File**: `scripts/full-checks.sh`

```bash
#!/bin/zsh

set -e

echo "🚀 Running full checks for CRE SDK TypeScript packages..."

run_in_package() {
  local package_dir=$1
  local command=$2
  
  echo "📦 Running '$command' in $package_dir..."
  cd "packages/$package_dir"
  bun run "$command"
  cd ../..
}

# cre-sdk-javy-plugin package
run_in_package "cre-sdk-javy-plugin" "build"
run_in_package "cre-sdk-javy-plugin" "typecheck"
run_in_package "cre-sdk-javy-plugin" "check"

# cre-sdk package
run_in_package "cre-sdk" "compile:cre-setup"
run_in_package "cre-sdk" "build"
run_in_package "cre-sdk" "generate:sdk"
run_in_package "cre-sdk" "typecheck"
run_in_package "cre-sdk" "check"
run_in_package "cre-sdk" "test"
run_in_package "cre-sdk" "test:standard"

# cre-sdk-examples package
run_in_package "cre-sdk-examples" "check"
run_in_package "cre-sdk-examples" "typecheck"

echo "✅ All checks completed successfully!"
```

### 4.3 Root Package.json Scripts

**File**: `package.json`

```json
{
  "scripts": {
    "build": "turbo run build",
    "check": "turbo run check",
    "check:ci": "turbo run check:ci",
    "format": "turbo run format",
    "full-checks": "./scripts/full-checks.sh",
    "lint": "turbo run lint",
    "typecheck": "turbo run typecheck"
  }
}
```

### 4.4 SDK Package.json Test Scripts

**File**: `packages/cre-sdk/package.json`

```json
{
  "scripts": {
    "build": "bun run clean && bun run compile:build && bun run build:types && bun run fix-imports",
    "check": "biome check --write ${BIOME_PATHS:-.}",
    "check:ci": "biome ci .",
    "full-checks": "bun generate:sdk && bun build && bun typecheck && bun check && bun test && bun test:standard",
    "test": "bun test",
    "test:standard": "./scripts/run-standard-tests.sh",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  }
}
```

---

## 5. WORKFLOW CONFIGURATION

### 5.1 Workflow YAML Structure

**File**: `workflow.yaml`

```yaml
# Staging target
staging-settings:
  user-workflow:
    workflow-name: "my-workflow-staging"
  workflow-artifacts:
    workflow-path: "./main.ts"
    config-path: "./config.staging.json"
    secrets-path: "../secrets.yaml"

# Production target
production-settings:
  user-workflow:
    workflow-name: "my-workflow-production"
  workflow-artifacts:
    workflow-path: "./main.ts"
    config-path: "./config.production.json"
    secrets-path: ""
```

### 5.2 Config File Structure

**File**: `config.staging.json`

```json
{
  "schedule": "0 */5 * * * *",
  "apiUrl": "https://api.example.com/data",
  "evms": [
    {
      "marketAddress": "0x1234567890123456789012345678901234567890",
      "chainSelectorName": "ethereum-testnet-sepolia",
      "gasLimit": "500000"
    }
  ]
}
```

---

## 6. WORKFLOW EXAMPLES

### 6.1 Hello-World Workflow

**File**: `src/workflows/hello-world/index.ts`

```typescript
import { CronCapability, handler, Runner, type Runtime } from '@chainlink/cre-sdk'
import { z } from 'zod'

const configSchema = z.object({
	schedule: z.string(),
})

type Config = z.infer<typeof configSchema>

const onCronTrigger = (runtime: Runtime<Config>): string => {
	runtime.log('Hello world! Workflow triggered.')
	return 'Hello world!'
}

const initWorkflow = (config: Config) => {
	const cron = new CronCapability()

	return [handler(cron.trigger({ schedule: config.schedule }), onCronTrigger)]
}

export async function main() {
	const runner = await Runner.newRunner<Config>({ configSchema })
	await runner.run(initWorkflow)
}
```

### 6.2 HTTP Fetch Workflow

**File**: `src/workflows/http-fetch/index.ts`

```typescript
import {
	CronCapability,
	consensusMedianAggregation,
	HTTPClient,
	type HTTPSendRequester,
	handler,
	ok,
	Runner,
	type Runtime,
	text,
} from '@chainlink/cre-sdk'
import { z } from 'zod' 

const configSchema = z.object({
	schedule: z.string(),
	apiUrl: z.string(),
})

type Config = z.infer<typeof configSchema>

const fetchMathResult = (sendRequester: HTTPSendRequester, config: Config) => {
	const response = sendRequester.sendRequest({ url: config.apiUrl, method: 'GET' }).result()

	if (!ok(response)) {
		throw new Error(`HTTP request failed with status: ${response.statusCode}`)
	}

	const responseText = text(response)
	return Number.parseFloat(responseText)
}

const onCronTrigger = (runtime: Runtime<Config>) => {
	const offchainValue = new HTTPClient()
		.sendRequest(
			runtime,
			fetchMathResult,
			consensusMedianAggregation(),
		)(runtime.config)
		.result()

	runtime.log('Successfully fetched offchain value')
	return offchainValue
}

const initWorkflow = (config: Config) => {
	const cron = new CronCapability()
	return [handler(cron.trigger({ schedule: config.schedule }), onCronTrigger)]
}

export async function main() {
	const runner = await Runner.newRunner<Config>({ configSchema })
	await runner.run(initWorkflow)
}
```

### 6.3 Log-Trigger Workflow

**File**: `src/workflows/log-trigger/index.ts`

```typescript
import { cre, Runner, getNetwork } from "@chainlink/cre-sdk";
import { keccak256, toHex } from "viem";
import { onHttpTrigger } from "./httpCallback";
import { onLogTrigger } from "./logCallback";

type Config = {
  geminiModel: string;
  evms: Array<{
    marketAddress: string;
    chainSelectorName: string;
    gasLimit: string;
  }>;
};

const SETTLEMENT_REQUESTED_SIGNATURE = "SettlementRequested(uint256,string)";

const initWorkflow = (config: Config) => {
  const httpCapability = new cre.capabilities.HTTPCapability();
  const httpTrigger = httpCapability.trigger({});

  const network = getNetwork({
    chainFamily: "evm",
    chainSelectorName: config.evms[0].chainSelectorName,
    isTestnet: true,
  });

  if (!network) {
    throw new Error(`Network not found: ${config.evms[0].chainSelectorName}`);
  }

  const evmClient = new cre.capabilities.EVMClient(network.chainSelector.selector);
  const eventHash = keccak256(toHex(SETTLEMENT_REQUESTED_SIGNATURE));

  return [
    cre.handler(httpTrigger, onHttpTrigger),
    cre.handler(
      evmClient.logTrigger({
        addresses: [config.evms[0].marketAddress],
        topics: [{ values: [eventHash] }],
        confidence: "CONFIDENCE_LEVEL_FINALIZED",
      }),
      onLogTrigger
    ),
  ];
};

export async function main() {
  const runner = await Runner.newRunner<Config>();
  await runner.run(initWorkflow);
}
```

---

## 7. TESTING CHECKLIST FOR SETTLEMENT WORKFLOWS

### 7.1 Unit Tests (Bun Test)

- [ ] Mock EVM contract calls with `EvmMock.testInstance(chainSelector)`
- [ ] Test capability handlers with `newTestRuntime()`
- [ ] Verify input/output encoding/decoding
- [ ] Test error handling and edge cases
- [ ] Validate consensus aggregation logic

### 7.2 Integration Tests (Simulation)

- [ ] Test HTTP trigger with sample payloads
- [ ] Test EVM log trigger with real transaction hashes
- [ ] Verify on-chain read operations
- [ ] Test on-chain write operations (dry-run first)
- [ ] Validate report generation and submission

### 7.3 E2E Tests (CI/CD)

- [ ] Run non-interactive simulations in CI
- [ ] Validate output against expected patterns
- [ ] Test with real testnet RPC endpoints
- [ ] Verify transaction broadcasting (with `--broadcast`)
- [ ] Check gas estimation and limits

### 7.4 Smoke Tests (Pre-Deployment)

- [ ] Simulate with production config
- [ ] Verify all secrets are loaded correctly
- [ ] Test with real API endpoints
- [ ] Validate on-chain state changes
- [ ] Check for any runtime errors or warnings

---

## 8. KEY TESTING PATTERNS FOR YOUR SETTLEMENT WORKFLOW

### 8.1 Mock CRE Report Submission

```typescript
import { test, EvmMock, newTestRuntime } from '@chainlink/cre-sdk/test'

test('settlement workflow submits report correctly', () => {
  const chainSelector = 84532n // Base Sepolia
  const evmMock = EvmMock.testInstance(chainSelector)
  
  // Mock the onReport callback
  evmMock.writeReport = (metadata, report) => {
    // Verify report structure
    expect(report).toBeDefined()
    return { transactionHash: '0x...' }
  }
  
  const runtime = newTestRuntime()
  // Run your settlement workflow
  // Verify report was submitted
})
```

### 8.2 E2E Settlement Test Script

```bash
#!/usr/bin/env bash
set -euo pipefail

echo "Testing settlement workflow..."

cre workflow simulate ./settlement-workflow \
  --non-interactive \
  --trigger-index 0 \
  --evm-tx-hash 0x<settlement-event-tx-hash> \
  --evm-event-index 0 \
  --broadcast \
  --target staging-settings > output.log 2>&1

# Validate settlement was recorded
if grep -q "Settlement recorded" output.log; then
  echo "✅ Settlement recorded successfully"
else
  echo "❌ Settlement recording failed"
  cat output.log
  exit 1
fi

# Validate winner wallet was set
if grep -q "Winner wallet set" output.log; then
  echo "✅ Winner wallet set correctly"
else
  echo "❌ Winner wallet not set"
  exit 1
fi

echo "✅ All settlement tests passed!"
```

### 8.3 Simulation Output Validation

```bash
# Expected output patterns for settlement workflow
CHECKS=(
  'USER LOG.*Processing settlement|Settlement processing started'
  'USER LOG.*Winner wallet:|Winner wallet identified'
  'USER LOG.*Report submitted:|Report submitted to chain'
  'Workflow Simulation Result:|Workflow completed'
  'Execution finished signal received|Execution finished'
)

for check in "${CHECKS[@]}"; do
  pattern="${check%%|*}"
  label="${check##*|}"
  if ! grep -q "$pattern" "$OUTPUT_FILE"; then
    echo "❌ ERROR: Expected '$label' not found"
    exit 1
  fi
  echo "✓ Found: $label"
done
```

---

## 9. ENVIRONMENT SETUP

### 9.1 Prerequisites

```bash
# Install CRE CLI
curl -fsSL https://install.chain.link/cre | bash

# Verify installation
cre version

# Login to CRE
cre auth login

# Set environment variables
export CRE_ETH_PRIVATE_KEY=0x<your-private-key>
export CRE_API_KEY=<your-api-key>
```

### 9.2 Project Setup

```bash
# Create new CRE project
cre project init my-project
cd my-project

# Create workflow
cre workflow create settlement-workflow

# Install dependencies
bun install

# Copy .env.example to .env
cp .env.example .env
```

### 9.3 Local Testing

```bash
# Run simulation interactively
cre workflow simulate ./settlement-workflow --target staging-settings

# Run with specific trigger
cre workflow simulate ./settlement-workflow \
  --non-interactive \
  --trigger-index 0 \
  --target staging-settings

# Run unit tests
bun test

# Run all checks
bun full-checks
```

---

## 10. REFERENCES

- **CRE Docs**: https://docs.chain.link/cre
- **Simulation Guide**: https://docs.chain.link/cre/guides/operations/simulating-workflows
- **HTTP Trigger Testing**: https://docs.chain.link/cre/guides/workflow/using-triggers/http-trigger/testing-in-simulation
- **SDK Repository**: https://github.com/smartcontractkit/cre-sdk-typescript
- **Bootcamp**: https://github.com/smartcontractkit/cre-bootcamp-2026
- **CRE CLI Reference**: https://docs.chain.link/cre/reference/cli/workflow

