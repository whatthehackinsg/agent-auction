# ZK & Cryptography Fix — Deployment Steps

This document covers the end-to-end deployment sequence for the ZK & Cryptography fixes (Phases 1–5). Work through each phase in order; each phase's output is a prerequisite for the next.

---

## Prerequisites

- Node ≥ 20, npm, bun installed
- Foundry (`forge`, `cast`) installed — `curl -L https://foundry.paradigm.xyz | bash && foundryup`
- Circom 2.2.3 installed — `npm i -g circom` (required only for Phase 1)
- snarkjs — available in `circuits/node_modules/.bin/snarkjs` (already a dev dependency)
- Base Sepolia RPC endpoint (e.g. Alchemy or public node)
- Deployer EOA private key with Base Sepolia ETH for gas
- Wrangler auth: `npx wrangler login`

---

## Phase 1 — Recompile the RegistryMembership Circuit

> **When to do this**: after the `salt` dead input is removed and the `pathIndices` boolean constraint is added to `circuits/src/RegistryMembership.circom` (already done in code).

### 1.1 — Compile the circuit

```bash
cd circuits
circom src/RegistryMembership.circom --r1cs --wasm --sym -o ./out/RegistryMembership
```

Outputs:
- `out/RegistryMembership/RegistryMembership.r1cs`
- `out/RegistryMembership_js/RegistryMembership.wasm`
- `out/RegistryMembership/RegistryMembership.sym`

### 1.2 — Run Phase 2 trusted setup

Reuse the existing Powers of Tau (pot20) — the circuit has fewer than 2^20 constraints.

```bash
# Generate initial .zkey from r1cs + ptau
./node_modules/.bin/snarkjs groth16 setup \
  out/RegistryMembership/RegistryMembership.r1cs \
  ptau/pot20_final.ptau \
  keys/RegistryMembership_0000.zkey

# Phase 2 contribution (any entropy string; use a strong random one in production)
./node_modules/.bin/snarkjs zkey contribute \
  keys/RegistryMembership_0000.zkey \
  keys/registry_member_final.zkey \
  --name="phase2-contributor" -v -e="$(openssl rand -hex 32)"

# Export verification key JSON
./node_modules/.bin/snarkjs zkey export verificationkey \
  keys/registry_member_final.zkey \
  keys/registry_member_vkey.json
```

### 1.3 — Copy the new WASM to packages/crypto

```bash
# Find where wasmPath("RegistryMembership") resolves — typically:
cp out/RegistryMembership_js/RegistryMembership.wasm \
   ../packages/crypto/src/wasm/RegistryMembership.wasm
```

If `packages/crypto` uses a different resolution path, check `packages/crypto/src/proof-generator.ts` → `wasmPath()`.

### 1.4 — Update the inlined MEMBERSHIP_VKEY in the engine

```bash
cat keys/registry_member_vkey.json
```

Open `engine/src/lib/crypto.ts` and replace the `MEMBERSHIP_VKEY` object literal with the new JSON content.

> The `nPublic` value stays `3` — public signals are unchanged (REGISTRY_ROOT, CAPABILITY_COMMITMENT, NULLIFIER).

### 1.5 — Rebuild and test crypto package

```bash
cd packages/crypto
npm run build
npm test   # 56 tests — all should pass with new wasm
```

---

## Phase 2 — Redeploy AgentPrivacyRegistry Contract

> The contract has a new constructor, new `register()` signature (4 args), new struct fields, and new getters. A new deployment is required.

### 2.1 — Set environment variables

```bash
export BASE_SEPOLIA_RPC="https://sepolia.base.org"   # or your Alchemy endpoint
export PRIVATE_KEY="0x..."                            # deployer EOA private key
```

### 2.2 — Build and test contracts

```bash
cd contracts
forge build
forge test   # 144 tests — update any that called register() with 2 args first
```

If tests fail due to register() signature change, update the affected test files to pass the new 4 arguments:
```solidity
registry.register(agentId, commit, poseidonRoot, capCommitment);
```

### 2.3 — Deploy

```bash
forge script script/Deploy.s.sol \
  --rpc-url $BASE_SEPOLIA_RPC \
  --private-key $PRIVATE_KEY \
  --broadcast \
  --verify \
  --etherscan-api-key $BASESCAN_API_KEY
```

Note the new `AgentPrivacyRegistry` address from the output.

### 2.4 — Update engine addresses

Open `engine/src/lib/addresses.ts` and replace:
```ts
agentPrivacyRegistry: '0x857E1049A5eE2cCA03a5C95F32089FECe51Ce8ff',
```
with:
```ts
agentPrivacyRegistry: '<NEW_ADDRESS>',
```

Also update `docs/zk-fix-deployment-steps.md` and `CLAUDE.md` with the new address.

---

## Phase 3 — Re-Register Test Agents

> Agents registered against the old contract address are invalid. Re-register them against the new contract.

### 3.1 — Ensure crypto package is built

```bash
cd packages/crypto
npm run build
```

### 3.2 — Run registration script

```bash
cd packages/crypto
BASE_SEPOLIA_RPC=$BASE_SEPOLIA_RPC \
PRIVATE_KEY=$PRIVATE_KEY \
npx tsx scripts/register-test-agents.ts
```

This script:
1. Builds fresh private onboarding state for each test agent → derives `capabilityMerkleRoot` (Poseidon root) and `capabilityCommitment`
2. Submits the per-agent privacy registration to the new contract with the derived commitments
3. Writes updated agent state JSON to `packages/crypto/agent-N.json`

### 3.3 — Verify on-chain

```bash
# For each agent (replace <agentId> and <NEW_ADDRESS>)
cast call <NEW_ADDRESS> "getAgentPoseidonRoot(uint256)(bytes32)" <agentId> \
  --rpc-url $BASE_SEPOLIA_RPC
```

The returned value must be non-zero. A zero value means registration did not persist.

---

## Phase 4 — Redeploy Engine to Cloudflare

### 4.1 — Run engine tests locally first

```bash
cd engine
npm test
```

Expected: 184/185 pass. The single failure in `bond-watcher.test.ts` is a pre-existing deprecated stub and can be ignored.

### 4.2 — Set Cloudflare secrets

```bash
# Engine admin key (for bypassing x402 on admin endpoints)
npx wrangler secret put ENGINE_ADMIN_KEY

# If using proof enforcement
echo "true" | npx wrangler secret put ENGINE_REQUIRE_PROOFS
echo "true" | npx wrangler secret put ENGINE_VERIFY_WALLET
```

### 4.3 — Deploy

```bash
cd engine
npm run deploy
```

Wrangler will deploy the Worker and create/migrate the D1 database if needed.

### 4.4 — Smoke test

```bash
# Health check
curl https://your-engine.workers.dev/health

# Check agent's Poseidon root is readable (should be non-zero)
curl https://your-engine.workers.dev/agents/1/root
```

---

## Phase 5 — MCP Server

### 5.1 — Build and type-check

```bash
cd mcp-server
npx tsc --noEmit
```

### 5.2 — Set environment variables

```bash
export ENGINE_URL="https://your-engine.workers.dev"
export AGENT_PRIVATE_KEY="0x..."
export AGENT_ID="1"
export AGENT_STATE_FILE="packages/crypto/agent-1.json"   # for automatic JOIN/BID proof generation
```

### 5.3 — Start

```bash
cd mcp-server
npm start
```

Default port: `3100`. Health check: `curl http://localhost:3100/health`.

### 5.4 — Verify sealed-bid tools

Test the new tools with the MCP client or a curl test against the engine:
- `place_bid` with `sealed: true` on the normal path (or an advanced `proofPayload` override) → must return `action: "BID_COMMIT"` with `revealSalt`
- `reveal_bid` with the returned `bid` and `revealSalt` → must return `action: "REVEAL"`

---

## Summary Order

```
1. Recompile circuit + new trusted setup  (Phase 1)
2. Update MEMBERSHIP_VKEY in engine       (Phase 1)
3. Rebuild packages/crypto + run tests    (Phase 1)
4. Deploy new AgentPrivacyRegistry        (Phase 2)
5. Update engine/src/lib/addresses.ts     (Phase 2)
6. Re-register test agents                (Phase 3)
7. Deploy engine to Cloudflare            (Phase 4)
8. Start / redeploy MCP server            (Phase 5)
```

Steps 1–3 and 4 can be done in parallel. Step 5 depends on 4. Step 6 depends on 4+5. Steps 7–8 depend on all prior steps.

---

## Rollback

If the new engine breaks auctions in progress:

```bash
# Roll back to previous Worker version
npx wrangler rollback

# Restore old AgentPrivacyRegistry address in addresses.ts
# Redeploy engine with old address
npm run deploy
```

Agent re-registration against the old contract is not needed for rollback — the old agents are still valid on the old contract.
