# CRE Settlement Workflow Testing — Quick Start

**For**: Testing your AuctionEscrow settlement workflow with CRE  
**Based on**: Real patterns from `smartcontractkit/cre-sdk-typescript` (Feb 2026)

---

## 1. QUICK COMMANDS

### Test Locally (Interactive)
```bash
cre workflow simulate ./settlement-workflow --target staging-settings
```

### Test in CI (Non-Interactive)
```bash
cre workflow simulate ./settlement-workflow \
  --non-interactive \
  --trigger-index 0 \
  --evm-tx-hash 0x<settlement-event-tx> \
  --evm-event-index 0 \
  --target staging-settings
```

### Broadcast to Testnet
```bash
cre workflow simulate ./settlement-workflow \
  --broadcast \
  --target staging-settings
```

---

## 2. SETTLEMENT WORKFLOW STRUCTURE

```typescript
// settlement-workflow/main.ts
import { cre, Runner, getNetwork } from "@chainlink/cre-sdk";
import { keccak256, toHex } from "viem";

type Config = {
  auctionRegistryAddress: string;
  auctionEscrowAddress: string;
  chainSelectorName: string;
  gasLimit: string;
};

const SETTLEMENT_REQUESTED_SIGNATURE = "SettlementRequested(uint256)";

const initWorkflow = (config: Config) => {
  const network = getNetwork({
    chainFamily: "evm",
    chainSelectorName: config.chainSelectorName,
    isTestnet: true,
  });

  if (!network) {
    throw new Error(`Network not found: ${config.chainSelectorName}`);
  }

  const evmClient = new cre.capabilities.EVMClient(network.chainSelector.selector);
  const eventHash = keccak256(toHex(SETTLEMENT_REQUESTED_SIGNATURE));

  return [
    cre.handler(
      evmClient.logTrigger({
        addresses: [config.auctionEscrowAddress],
        topics: [{ values: [eventHash] }],
        confidence: "CONFIDENCE_LEVEL_FINALIZED",
      }),
      onSettlementRequested
    ),
  ];
};

const onSettlementRequested = async (runtime: Runtime<Config>) => {
  runtime.log("Processing settlement...");
  
  // 1. Read auction state from AuctionRegistry
  // 2. Verify winner and bond amounts
  // 3. Generate settlement report
  // 4. Submit via CRE (onReport callback)
  
  return { success: true };
};

export async function main() {
  const runner = await Runner.newRunner<Config>();
  await runner.run(initWorkflow);
}
```

---

## 3. UNIT TEST (Bun)

```typescript
// settlement-workflow/__tests__/settlement.test.ts
import { describe, expect } from 'bun:test'
import { EvmMock, newTestRuntime, test } from '@chainlink/cre-sdk/test'
import { addContractMock } from '@chainlink/cre-sdk/test'

const CHAIN_SELECTOR = 84532n // Base Sepolia
const AUCTION_ESCROW = '0x...'
const AUCTION_REGISTRY = '0x...'

describe('Settlement Workflow', () => {
  test('processes settlement event correctly', () => {
    const evmMock = EvmMock.testInstance(CHAIN_SELECTOR)
    
    // Mock AuctionRegistry read
    const registryMock = addContractMock(evmMock, {
      address: AUCTION_REGISTRY,
      abi: AuctionRegistryABI,
    })
    
    registryMock.getAuction = (auctionId) => ({
      state: 2, // CLOSED
      winnerWallet: '0xwinner...',
      bondAmount: 1000000000000000000n,
    })
    
    // Mock AuctionEscrow read
    const escrowMock = addContractMock(evmMock, {
      address: AUCTION_ESCROW,
      abi: AuctionEscrowABI,
    })
    
    escrowMock.getBond = (agentId) => ({
      amount: 1000000000000000000n,
      timestamp: 1234567890n,
    })
    
    const runtime = newTestRuntime()
    
    // Run settlement logic
    const result = onSettlementRequested(runtime)
    
    expect(result.success).toBe(true)
  })
})
```

---

## 4. E2E TEST SCRIPT

```bash
#!/usr/bin/env bash
# scripts/e2e/test-settlement.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
WORKFLOW_DIR="$ROOT_DIR/settlement-workflow"
OUTPUT_FILE="$(mktemp)"

cleanup() { rm -f "$OUTPUT_FILE"; }
trap cleanup EXIT

cd "$WORKFLOW_DIR"
cp -n .env.example .env 2>/dev/null || true

echo "🧪 Testing settlement workflow..."

# Use a real settlement event from Base Sepolia testnet
SETTLEMENT_TX="0x<real-settlement-event-tx>"
SETTLEMENT_EVENT_INDEX="0"

cre workflow simulate . \
  --non-interactive \
  --trigger-index 0 \
  --evm-tx-hash "$SETTLEMENT_TX" \
  --evm-event-index "$SETTLEMENT_EVENT_INDEX" \
  --target staging-settings \
  > "$OUTPUT_FILE" 2>&1

cat "$OUTPUT_FILE"

# Validation checks
echo ""
echo "✓ Validating settlement workflow output..."

CHECKS=(
  'USER LOG.*Processing settlement|Settlement processing started'
  'USER LOG.*Reading auction state|Auction state retrieved'
  'USER LOG.*Winner wallet:|Winner wallet identified'
  'USER LOG.*Generating report|Report generated'
  'USER LOG.*Report submitted|Report submitted to chain'
  'Workflow Simulation Result:|Workflow completed'
  '"success"|success'
)

FAILED=0
for check in "${CHECKS[@]}"; do
  pattern="${check%%|*}"
  label="${check##*|}"
  if ! grep -q "$pattern" "$OUTPUT_FILE"; then
    echo "❌ ERROR: Expected '$label' not found"
    FAILED=1
  else
    echo "✓ Found: $label"
  fi
done

if [ $FAILED -eq 0 ]; then
  echo "✅ All settlement tests passed!"
  exit 0
else
  echo "❌ Settlement tests failed"
  exit 1
fi
```

---

## 5. CI/CD INTEGRATION

Add to `.github/workflows/ci.yml`:

```yaml
- name: E2E - Test Settlement Workflow
  env:
    CRE_API_KEY: ${{ secrets.CRE_CLI_API_KEY }}
  run: ./scripts/e2e/test-settlement.sh
```

---

## 6. WORKFLOW CONFIG

```yaml
# settlement-workflow/workflow.yaml
staging-settings:
  user-workflow:
    workflow-name: "settlement-workflow-staging"
  workflow-artifacts:
    workflow-path: "./main.ts"
    config-path: "./config.staging.json"
    secrets-path: "../secrets.yaml"

production-settings:
  user-workflow:
    workflow-name: "settlement-workflow-production"
  workflow-artifacts:
    workflow-path: "./main.ts"
    config-path: "./config.production.json"
    secrets-path: ""
```

```json
// settlement-workflow/config.staging.json
{
  "auctionRegistryAddress": "0x...",
  "auctionEscrowAddress": "0x...",
  "chainSelectorName": "base-testnet-sepolia",
  "gasLimit": "500000"
}
```

---

## 7. TESTING LAYERS

| Layer | Tool | Command | When |
|-------|------|---------|------|
| **Unit** | Bun Test | `bun test` | During development |
| **Integration** | CRE Simulate | `cre workflow simulate` | Before commit |
| **E2E** | Bash Script | `./scripts/e2e/test-settlement.sh` | In CI/CD |
| **Smoke** | Manual | `cre workflow simulate --broadcast` | Pre-deployment |

---

## 8. EXPECTED OUTPUT

```
Workflow compiled

🚀 Workflow simulation ready. Please select a trigger:
1. evm:ChainSelector:84532@LogTrigger

Running trigger evm
[USER LOG] Processing settlement...
[USER LOG] Reading auction state from registry
[USER LOG] Winner wallet: 0xwinner...
[USER LOG] Bond amount: 1000000000000000000
[USER LOG] Generating settlement report
[USER LOG] Report submitted to chain
[USER LOG] Settlement complete

Workflow Simulation Result:
{
  "success": true,
  "auctionId": 123,
  "winnerWallet": "0xwinner...",
  "bondAmount": "1000000000000000000"
}

Execution finished signal received
```

---

## 9. DEBUGGING

### Enable Engine Logs
```bash
cre workflow simulate ./settlement-workflow \
  --engine-logs \
  --target staging-settings
```

### Verbose CLI Output
```bash
cre workflow simulate ./settlement-workflow \
  --verbose \
  --target staging-settings
```

### Dry-Run Before Broadcast
```bash
# First: dry-run (default)
cre workflow simulate ./settlement-workflow --target staging-settings

# Then: broadcast to testnet
cre workflow simulate ./settlement-workflow --broadcast --target staging-settings
```

---

## 10. COMMON ISSUES

| Issue | Solution |
|-------|----------|
| `Network not found` | Verify `chainSelectorName` in config matches CRE's supported networks |
| `No implementation provided` | Set mock handler: `mock.callContract = () => {...}` |
| `CRE_ETH_PRIVATE_KEY not set` | Add to `.env`: `CRE_ETH_PRIVATE_KEY=0x...` |
| `Transaction failed` | Check gas limit in config; increase if needed |
| `Report not submitted` | Verify `onReport` callback is implemented in AuctionEscrow |

---

## 11. NEXT STEPS

1. **Create workflow structure**:
   ```bash
   mkdir -p settlement-workflow/{__tests__,scripts}
   touch settlement-workflow/{main.ts,workflow.yaml,config.staging.json}
   ```

2. **Implement settlement logic** in `main.ts`

3. **Write unit tests** in `__tests__/settlement.test.ts`

4. **Create E2E script** in `scripts/e2e/test-settlement.sh`

5. **Add to CI** in `.github/workflows/ci.yml`

6. **Test locally**:
   ```bash
   cre workflow simulate ./settlement-workflow --target staging-settings
   ```

7. **Deploy to staging** and verify with real events

---

## 12. REFERENCES

- Full guide: `docs/solutions/cre-testing-patterns-2026.md`
- CRE Docs: https://docs.chain.link/cre
- SDK: https://github.com/smartcontractkit/cre-sdk-typescript
- Bootcamp: https://github.com/smartcontractkit/cre-bootcamp-2026
