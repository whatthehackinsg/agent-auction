---
phase: 3-complete-agent-onboarding
plan: 1
type: execute
wave: 1
depends_on: []
files_modified:
  - .claude/skills/auction/SKILL.md
  - mcp-server/src/tools/identity.ts
  - mcp-server/src/index.ts
  - mcp-server/.env.example
autonomous: true
requirements: [ONBOARD-01, ONBOARD-02, ONBOARD-03]

must_haves:
  truths:
    - "Agent operators have a complete onboarding checklist with exact commands and contract addresses"
    - "Agents can check their ERC-8004 registration and privacy registry status via a single MCP tool"
    - "MCP server .env.example documents all configuration options with descriptions"
  artifacts:
    - path: ".claude/skills/auction/SKILL.md"
      provides: "Complete onboarding prerequisites with ERC-8004, wallet, ZK setup, env config"
      contains: "prepareOnboarding"
    - path: "mcp-server/src/tools/identity.ts"
      provides: "check_identity MCP tool wrapping POST /verify-identity"
      exports: ["registerIdentityTool"]
    - path: "mcp-server/.env.example"
      provides: "All env var documentation for MCP server setup"
      contains: "AGENT_PRIVATE_KEY"
  key_links:
    - from: "mcp-server/src/tools/identity.ts"
      to: "engine POST /verify-identity"
      via: "EngineClient.post()"
      pattern: "engine\\.post.*verify-identity"
    - from: "mcp-server/src/index.ts"
      to: "mcp-server/src/tools/identity.ts"
      via: "registerIdentityTool import + call"
      pattern: "registerIdentityTool"
---

<objective>
Close all agent onboarding gaps: update SKILL.md with complete prerequisite documentation (ERC-8004 registration, wallet setup, ZK proof generation, env config), add a `check_identity` MCP tool that wraps the engine's existing `POST /verify-identity` endpoint, and create `.env.example` for MCP server configuration.

Purpose: Agents currently cannot self-onboard because there is no registration guide, no identity-check tool, and no env config reference. This plan makes the full onboarding path discoverable and verifiable.
Output: Updated SKILL.md, new identity.ts tool, wired into index.ts, .env.example
</objective>

<execution_context>
@/Users/zengy/.claude/get-shit-done/workflows/execute-plan.md
@/Users/zengy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.claude/skills/auction/SKILL.md
@mcp-server/src/index.ts
@mcp-server/src/lib/config.ts
@mcp-server/src/lib/engine.ts
@mcp-server/src/lib/tool-response.ts
@mcp-server/src/tools/discover.ts (pattern reference for tool registration)
@packages/crypto/src/onboarding.ts (prepareOnboarding, registerOnChain API)

<interfaces>
<!-- Key types and contracts the executor needs. Extracted from codebase. -->

From mcp-server/src/lib/config.ts:
```typescript
export interface ServerConfig {
  engineUrl: string
  agentPrivateKey: Hex | null
  agentId: string | null
  port: number
  engineAdminKey: string | null
  agentStateFile: string | null
  baseSepoliaRpc: string | null
}
```

From mcp-server/src/lib/tool-response.ts:
```typescript
export function toolError(code: string, detail: string, suggestion: string)
export function toolSuccess(data: Record<string, unknown>)
```

From mcp-server/src/lib/engine.ts:
```typescript
export class EngineClient {
  async get<T>(path: string): Promise<T>
  async post<T>(path: string, body: unknown): Promise<T>
}
```

Engine POST /verify-identity response shape:
```typescript
{
  verified: boolean        // ERC-8004 wallet matches
  resolvedWallet: string   // on-chain wallet for agentId
  privacyRegistered: boolean  // has Poseidon root on AgentPrivacyRegistry
  poseidonRoot: string | null
}
```

From packages/crypto/src/onboarding.ts:
```typescript
export async function prepareOnboarding(agentId: bigint, capabilityIds: bigint[]): Promise<AgentPrivateState>
export async function registerOnChain(privateState: AgentPrivateState, registryAddress: string, signer: ethers.Signer): Promise<ethers.TransactionReceipt>
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add check_identity MCP tool and .env.example</name>
  <files>mcp-server/src/tools/identity.ts, mcp-server/src/index.ts, mcp-server/.env.example</files>
  <action>
Create `mcp-server/src/tools/identity.ts` with a `registerIdentityTool` function following the exact same pattern as `registerDiscoverTool` in `discover.ts`:

1. **`check_identity` tool** — wraps the engine's existing `POST /verify-identity` endpoint:
   - Input: `agentId` (optional string, defaults to `config.agentId`), `wallet` (optional string, derived from `config.agentPrivateKey` if not provided using viem `privateKeyToAccount`)
   - If neither agentId nor config.agentId available, return `toolError('MISSING_CONFIG', ...)`
   - If neither wallet param nor config.agentPrivateKey available, return `toolError('MISSING_CONFIG', 'wallet address is required', 'Provide wallet parameter or set AGENT_PRIVATE_KEY env var')`
   - POST to `/verify-identity` with `{ agentId, wallet }`
   - Return `toolSuccess()` with the engine response fields: `agentId`, `wallet`, `erc8004Verified` (from `verified`), `privacyRegistered`, `poseidonRoot`, plus a `readiness` object summarizing what's ready and what's missing:
     ```
     readiness: {
       walletConfigured: true,
       erc8004Registered: <verified>,
       privacyRegistryRegistered: <privacyRegistered>,
       readyToParticipate: <verified>,
       readyForZkProofs: <privacyRegistered>,
       missingSteps: [<strings describing what's still needed>]
     }
     ```
   - `missingSteps` examples: "Register on ERC-8004: call selfRegister(agentId) on 0x8004A818BFB912233c491871b3d84c89A494BD9e", "Register on AgentPrivacyRegistry: run prepareOnboarding() then registerOnChain() from @agent-auction/crypto"
   - Wrap engine call in try/catch, return `toolError('ENGINE_ERROR', ...)` on failure

2. **Wire into index.ts** — import `registerIdentityTool` and call it after `registerSettlementTool`. Pass `(server, engine, config)` as arguments (same pattern as bond tools — no nonceTracker needed).

3. **Create `mcp-server/.env.example`**:
   ```
   # Auction Engine
   ENGINE_URL=http://localhost:8787
   ENGINE_ADMIN_KEY=              # Optional: bypasses x402 discovery gates

   # Agent Identity (required for signing actions: join, bid, reveal, bond)
   AGENT_PRIVATE_KEY=0x...        # 64-char hex private key for EIP-712 signing
   AGENT_ID=1                     # Numeric ERC-8004 agent ID

   # ZK Proof Generation (optional — enables generateProof: true on join/bid)
   AGENT_STATE_FILE=./agent-1.json  # Path to agent private state (from prepareOnboarding)
   BASE_SEPOLIA_RPC=https://sepolia.base.org  # RPC for registry root reads

   # Server
   MCP_PORT=3100                  # HTTP port for Streamable HTTP transport
   ```
  </action>
  <verify>
    <automated>cd /Volumes/MainSSD/HomeData/zengy/workspace/auction-design/mcp-server && npx tsc --noEmit</automated>
  </verify>
  <done>
    - `check_identity` tool registered and type-checks
    - Tool returns structured readiness assessment with `missingSteps`
    - `.env.example` documents all 7 env vars with descriptions
    - `index.ts` imports and registers the identity tool
  </done>
</task>

<task type="auto">
  <name>Task 2: Rewrite SKILL.md onboarding section with complete prerequisites</name>
  <files>.claude/skills/auction/SKILL.md</files>
  <action>
Rewrite the `## Onboarding` section of `.claude/skills/auction/SKILL.md` to be a complete, step-by-step guide. Keep ALL existing content below the onboarding section (Tool Reference, Workflow, Key Formats, Error Codes) unchanged. Only modify/expand the onboarding section.

Replace the current `## Onboarding (operator does this before you can use MCP)` section with:

```markdown
## Onboarding

Before participating in auctions, your operator must complete these setup steps. Use `check_identity` to verify readiness at any point.

### Step 1: Create Agent Wallet

Generate a new Ethereum private key for EIP-712 action signing. This wallet is used for all auction interactions (join, bid, reveal).

```bash
# Using cast (Foundry)
cast wallet new

# Or using Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Fund the wallet with Base Sepolia ETH (for gas) and USDC (for bonds).

### Step 2: Register on ERC-8004 Identity Registry

Register your agent on the ERC-8004 Identity Registry to link your agentId to your wallet address. Required when the engine runs with `ENGINE_VERIFY_WALLET=true`.

**Contract:** `0x8004A818BFB912233c491871b3d84c89A494BD9e` (Base Sepolia)

```bash
# Self-register agentId 1 (call from the agent wallet)
cast send 0x8004A818BFB912233c491871b3d84c89A494BD9e \
  "selfRegister(uint256)" 1 \
  --rpc-url https://sepolia.base.org \
  --private-key $AGENT_PRIVATE_KEY
```

Verify registration:
```bash
cast call 0x8004A818BFB912233c491871b3d84c89A494BD9e \
  "ownerOf(uint256)(address)" 1 \
  --rpc-url https://sepolia.base.org
```

### Step 3: Configure MCP Server

Set environment variables (see `.env.example` in mcp-server/):

| Variable | Required | Purpose |
|----------|----------|---------|
| `ENGINE_URL` | Yes | Auction engine URL |
| `AGENT_PRIVATE_KEY` | For signing | 0x-prefixed 64-char hex private key |
| `AGENT_ID` | For signing | Numeric ERC-8004 agent ID |
| `ENGINE_ADMIN_KEY` | No | Bypasses x402 discovery gates |
| `AGENT_STATE_FILE` | For ZK proofs | Path to agent-N.json state file |
| `BASE_SEPOLIA_RPC` | For ZK proofs | RPC URL for registry root reads |
| `MCP_PORT` | No | Server port (default: 3100) |

### Step 4: ZK Privacy Setup (Optional but Recommended)

ZK proofs let you prove registry membership and bid validity without revealing identity.

**4a. Generate agent secrets:**
```typescript
import { prepareOnboarding } from '@agent-auction/crypto'

const state = await prepareOnboarding(
  1n,          // agentId
  [1n, 2n]     // capabilityIds (arbitrary identifiers)
)
// Save state to agent-1.json — this is your AGENT_STATE_FILE
```

**4b. Register on AgentPrivacyRegistry:**
```typescript
import { registerOnChain } from '@agent-auction/crypto'
import { ethers } from 'ethers'

const provider = new ethers.JsonRpcProvider('https://sepolia.base.org')
const signer = new ethers.Wallet(AGENT_PRIVATE_KEY, provider)

await registerOnChain(
  state,
  '0x857E1049A5eE2cCA03a5C95F32089FECe51Ce8ff', // AgentPrivacyRegistry
  signer
)
```

**4c. Set env vars:**
```
AGENT_STATE_FILE=./agent-1.json
BASE_SEPOLIA_RPC=https://sepolia.base.org
```

### Verify Readiness

Use the `check_identity` tool to verify your setup:

```
check_identity()
```

This returns a readiness assessment showing which steps are complete and what's still needed.
```

Also add `check_identity` to the Tool Reference table:

| `check_identity` | Verify ERC-8004 and privacy registry status |

And add `IDENTITY_NOT_FOUND` to the Error Codes table:

| `IDENTITY_NOT_FOUND` | Agent not registered on ERC-8004 | Complete Step 2 of onboarding |
  </action>
  <verify>
    <automated>grep -c "check_identity\|prepareOnboarding\|selfRegister\|AgentPrivacyRegistry\|ERC-8004\|\.env\.example" /Volumes/MainSSD/HomeData/zengy/workspace/auction-design/.claude/skills/auction/SKILL.md</automated>
  </verify>
  <done>
    - SKILL.md onboarding section has 4 numbered steps with exact commands and contract addresses
    - ERC-8004 registration includes cast command with real contract address 0x8004A818...
    - ZK setup references prepareOnboarding and registerOnChain from @agent-auction/crypto
    - check_identity tool appears in Tool Reference table
    - All env vars documented with purpose
    - Verify count returns >= 6 matches confirming all key terms present
  </done>
</task>

</tasks>

<verification>
1. `cd mcp-server && npx tsc --noEmit` passes (identity tool type-checks with existing codebase)
2. `check_identity` appears in tool registration in index.ts
3. `.env.example` exists with all 7 env vars documented
4. SKILL.md contains complete onboarding with ERC-8004, wallet, ZK, env config guidance
5. No existing functionality broken (all other tools still registered)
</verification>

<success_criteria>
- MCP server type-checks with new identity tool
- Agent operators have a complete, copy-paste-ready onboarding guide in SKILL.md
- check_identity tool provides structured readiness assessment via engine's verify-identity endpoint
- .env.example serves as configuration reference for new MCP server deployments
</success_criteria>

<output>
After completion, create `.planning/quick/3-complete-agent-onboarding-process-docs-a/3-SUMMARY.md`
</output>
