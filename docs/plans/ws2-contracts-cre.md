# WS-2: Smart Contracts + CRE Settlement

**Owner:** AI Engineer 1
**Directories owned:** `contracts/` (except `AgentPrivacyRegistry.sol`), `cre/`, `deployments/`
**Source of truth:** `docs/full_contract_arch(amended).md` Sections 2-3, 7-10

---

## Mission

Build, test, and deploy all Solidity contracts to Base Sepolia. Write and register the CRE Settlement Workflow. You are the sole authority on on-chain state — every contract ABI, deployed address, and CRE configuration flows through you.

---

## What You Deliver

| Artifact | Consumer | Deadline | Format |
|----------|----------|----------|--------|
| Contract ABIs | WS-3 (engine) | Day 2 | Foundry `out/` JSON artifacts |
| `MockKeystoneForwarder.sol` | Self (tests) + WS-3 (local dev) | Day 3 | Solidity |
| `deployments/base-sepolia.json` | WS-3 (engine config) | Day 4 | JSON: `{ contractName: { address, abi } }` |
| `AuctionSettlementPacket` TS type | WS-3 (DO builds packet) | Day 4 | TypeScript type definition |
| EIP-4337 bundler endpoint | WS-3 (agent client) | Day 4 | URL string |
| CRE workflow config | WS-3 (escrow setExpected*) | Day 6 | `{ workflowId, workflowName, workflowOwner }` |

---

## What You Receive

| Artifact | From | Expected | Purpose |
|----------|------|----------|---------|
| `AgentPrivacyRegistry.sol` | WS-1 | Day 2 | Deploy alongside other contracts |
| Poseidon test vectors | WS-1 | Day 4 | Foundry cross-language verification |
| `replay-bundle.ts` | WS-1 | Day 6 | CRE workflow uses same serialization |

---

## Day-by-Day Tasks

### Day 1-2: Write All Contracts

```
Priority: CRITICAL — WS-3 needs ABIs by end of Day 2
```

**Project setup:**
- [ ] `forge init contracts`
- [ ] Install dependencies:
  ```bash
  forge install eth-infinitism/account-abstraction@v0.7.0
  forge install OpenZeppelin/openzeppelin-contracts
  # For ReceiverTemplate: copy from smartcontractkit/documentation or x402-cre-price-alerts
  ```
- [ ] Set `solidity = "0.8.24"` in `foundry.toml` (Cancun EVM target for Base Sepolia)

**AgentAccount.sol** (see amended doc Section 3):
- [ ] Simplified: `runtimeSigner` (EOA) + sig/nonce validation only
- [ ] `address public runtimeSigner` — set at creation, rotatable via `setRuntimeSigner()`
- [ ] `validateUserOp()`: `ECDSA.recover(userOpHash, sig) == runtimeSigner`
- [ ] `execute(address, uint256, bytes)` — only callable by EntryPoint
- [ ] NO ZK verifier calls (moved to DO)

**AgentAccountFactory.sol:**
- [ ] `createAccount(address runtimeSigner, uint256 salt)` — CREATE2
- [ ] `getAddress(address runtimeSigner, uint256 salt)` — view, deterministic

**AgentPaymaster.sol** (see amended doc Section 3):
- [ ] Method-based gating in `validatePaymasterUserOp()`:
  - `USDC.transfer` to escrow → allowed for any ERC-8004 registered agent (no prior bond required)
  - Other operations → require existing bond via `escrow.bondRecords()`
- [ ] `postOp()`: log gas cost for analytics only (MVP)

**AuctionRegistry.sol** (see amended doc Section 7):
- [ ] `DOMAIN_SEPARATOR` — `EIP712Domain("AgentAuction", "1", chainId, address(this))`
- [ ] `createAuction(bytes32 auctionId, bytes32 manifestHash, ...)` — simple storage write
- [ ] `recordResult(AuctionSettlementPacket calldata packet, bytes calldata sequencerSig)` — emits `AuctionEnded`
- [ ] `markSettled(bytes32 auctionId)` — `onlyEscrow`
- [ ] `cancelExpiredAuction(bytes32 auctionId)` — 72h timeout
- [ ] `updateWinnerWallet(...)` — EIP-712 wallet rotation recovery
- [ ] State machine: `NONE → OPEN → CLOSED → SETTLED` (or `CLOSED → CANCELLED`)
- [ ] `setEscrow(address)` — one-time binding
- [ ] NO `anchorHash()`, NO `getAnchors()`, NO `anchorTrails` (all removed)

**AuctionEscrow.sol** (see amended doc Section 8):
- [ ] Inherits `ReceiverTemplate` + `ReentrancyGuard`
- [ ] `recordBond(auctionId, agentId, depositor, amount, x402TxId)` — `onlyAdmin`, idempotent on txId
- [ ] `_processReport(bytes calldata report)` — decode `abi.encode(auctionId, winnerAgentId, winnerWallet, amount)`, O(1) settlement
- [ ] `claimRefund(auctionId, agentId)` — pull-based, deposit-time beneficiary
- [ ] `withdraw()` — pull pattern
- [ ] `adminRefund(...)` — emergency
- [ ] `checkSolvency()` — view
- [ ] Solvency invariant: `usdc.balanceOf(this) >= totalBonded + totalWithdrawable`

**MockKeystoneForwarder.sol:**
- [ ] Calls `onReport(metadata, report)` directly for local dev/testing
- [ ] Configurable metadata (workflowId, workflowName, workflowOwner)

**Foundry Tests:**
- [ ] `AgentAccount.t.sol`: validateUserOp passes with correct runtimeSigner, fails with wrong signer
- [ ] `AgentPaymaster.t.sol`: bond deposit allowed for registered agent, non-bond ops require bond
- [ ] `AuctionRegistry.t.sol`: createAuction → recordResult → markSettled state transitions
- [ ] `AuctionEscrow.t.sol`: recordBond → processReport → claimRefund → withdraw full flow
- [ ] `Settlement.t.sol`: integration test via MockKeystoneForwarder

**Deliveries:**
- [ ] Push all contracts to `contracts/src/`
- [ ] Push tests to `contracts/test/`
- [ ] Run `forge build` — ABIs available in `contracts/out/`
- [ ] Tag: `ws2/contracts-ready`

### Day 3-4: Deploy + Wire

```
Priority: CRITICAL — WS-3 needs deployed addresses by end of Day 4
```

**Deploy to Base Sepolia (Tenderly Virtual TestNet):**

Follow the 10-step deployment order from amended doc Section 10:

- [ ] Step 1: Verify EntryPoint at `0x0000000071727De22E5E9d8BAf0edAc6f37da032`
  ```bash
  cast code 0x0000000071727De22E5E9d8BAf0edAc6f37da032 --rpc-url $BASE_SEPOLIA_RPC
  ```
- [ ] Step 2: Deploy `AgentPrivacyRegistry` (from WS-1)
  - After deploy: note address for WS-1 proof-generator
- [ ] Step 3: Deploy `AgentAccount` (implementation)
- [ ] Step 4: Deploy `AgentAccountFactory(entryPoint, agentAccountImpl)`
- [ ] Step 5: Deploy `AgentPaymaster(entryPoint)` → stake ETH:
  ```bash
  cast send $PAYMASTER "addStake(uint32)" 86400 --value 0.1ether --rpc-url $BASE_SEPOLIA_RPC
  cast send $PAYMASTER "deposit()" --value 0.5ether --rpc-url $BASE_SEPOLIA_RPC
  ```
- [ ] Step 6: Deploy `AuctionRegistry(sequencerAddress)` → DOMAIN_SEPARATOR set in constructor
- [ ] Step 7: Deploy `AuctionEscrow(mockForwarderAddress, admin, usdc, registry, identityRegistry)`
- [ ] Step 8: Wire: `AuctionRegistry.setEscrow(escrowAddress)`

**Post-deploy verification:**
- [ ] Verify each contract on Tenderly explorer
- [ ] Run basic smoke tests via cast (createAuction, check state)

**Write `deployments/base-sepolia.json`:**
```json
{
  "chainId": 84532,
  "entryPoint": "0x0000000071727De22E5E9d8BAf0edAc6f37da032",
  "agentPrivacyRegistry": "0x...",
  "agentAccount": "0x...",
  "agentAccountFactory": "0x...",
  "agentPaymaster": "0x...",
  "auctionRegistry": "0x...",
  "auctionEscrow": "0x...",
  "mockKeystoneForwarder": "0x...",
  "usdc": "0x...",
  "identityRegistry": "0x8004A818BFB912233c491871b3d84c89A494BD9e",
  "sequencerAddress": "0x...",
  "bundlerEndpoint": "https://..."
}
```

**EIP-4337 Bundler setup:**
- [ ] Choose bundler: Pimlico or CDP (both support Base Sepolia EntryPoint v0.7)
- [ ] Configure and test UserOp submission
- [ ] Document bundler endpoint for WS-3

**Export AuctionSettlementPacket TypeScript type:**
```typescript
export interface AuctionSettlementPacket {
  auctionId: `0x${string}`;
  manifestHash: `0x${string}`;
  roomConfigHash: `0x${string}`;
  finalLogHash: `0x${string}`;
  replayContentHash: `0x${string}`;
  eventCount: bigint;
  closeSeq: bigint;
  winnerAgentId: bigint;
  winnerWallet: `0x${string}`;
  finalPrice: bigint;
  engineVersionHash: `0x${string}`;
  closeTime: bigint;
}
```

**Deliveries:**
- [ ] Push `deployments/base-sepolia.json`
- [ ] Push TS types to `contracts/types/`
- [ ] Tag: `ws2/deployed`

### Day 5-6: CRE Settlement Workflow

**Write CRE Settlement Workflow** (`cre/workflows/settlement.ts`):

Using `@chainlink/cre-sdk`:

- [ ] **Trigger:** EVM Log Trigger on `AuctionEnded` event
  - Contract: AuctionRegistry address
  - Confidence: `FINALIZED` (irreversible fund release — MUST wait for finality)
  - Encode addresses + topics using `hexToBase64()` from SDK
  - Topics[0]: `keccak256("AuctionEnded(bytes32,uint256,address,uint256,bytes32,bytes32)")`
- [ ] **Compute:**
  1. Read `finalLogHash` and `replayContentHash` from AuctionRegistry via EVMClient
  2. Fetch ReplayBundleV1 from configured base URL (`https://api.platform.com/replay/{auctionId}`)
  3. `sha256(bundleBytes) == replayContentHash` — reject if mismatch
  4. Replay Poseidon hash chain: for each event, recompute `eventHash` → final hash must equal `finalLogHash`
  5. Replay English auction rules: iterate BID events, track highest valid bid
  6. Derived `winnerAgentId` must match event's `winnerAgentId` — reject if mismatch
  7. Read `ownerOf(winnerAgentId)` from ERC-8004 — must not revert
  8. Read `getAgentWallet(winnerAgentId)` — must match `winnerWallet` from event
- [ ] **Write:** EVMClient → KeystoneForwarder → `AuctionEscrow.onReport(metadata, report)`
  - `report = abi.encode(bytes32 auctionId, uint256 winnerAgentId, address winnerWallet, uint256 amount)`

**Configure `project.yaml`:**
- [ ] Set RPC endpoints (Base Sepolia for execution, Ethereum Mainnet for workflow registration)
- [ ] Pin `@chainlink/cre-sdk` version

**Test locally:**
- [ ] `cre workflow simulate` — verify full flow passes
- [ ] Integration test in Foundry: `createAuction → recordResult → MockKeystoneForwarder.onReport → verify SETTLED state + escrow balances`

**Deliveries:**
- [ ] Push CRE workflow to `cre/`
- [ ] Document: `{ workflowId, workflowName: "auctSettle", workflowOwner }`
- [ ] Tag: `ws2/cre-ready`

### Day 7-8: E2E Integration + CRE Registration

**Register CRE Workflow (Step 10):**
- [ ] `cre workflow deploy` (registers on Ethereum Mainnet Workflow Registry)
- [ ] Record `workflowId` from deployment output
- [ ] Configure AuctionEscrow:
  ```bash
  cast send $ESCROW "setExpectedWorkflowId(bytes32)" $WORKFLOW_ID
  cast send $ESCROW "setExpectedWorkflowName(string)" "auctSettle"
  cast send $ESCROW "setExpectedAuthor(address)" $WORKFLOW_OWNER
  ```

**Full E2E settlement test:**
- [ ] `createAuction` → agents bond → agents join/bid (via WS-3 engine) → close → `recordResult` → `AuctionEnded` event → CRE triggers → `onReport` → verify SETTLED + escrow credits correct

**Fix bugs surfaced by WS-3 integration:**
- [ ] Contract interface mismatches
- [ ] Gas estimation issues
- [ ] ABI encoding discrepancies

### Day 9-10: Polish

- [ ] Security review: reentrancy, access control, solvency invariant
- [ ] Write contracts + CRE section of README
- [ ] Verify all Foundry tests pass
- [ ] Assist demo video (show Tenderly settlement tx)

---

## Technical References

| Item | Source |
|------|--------|
| EIP-4337 EntryPoint v0.7 | `0x0000000071727De22E5E9d8BAf0edAc6f37da032` |
| ERC-8004 Base Sepolia IdentityRegistry | `0x8004A818BFB912233c491871b3d84c89A494BD9e` |
| ERC-8004 Base Sepolia ReputationRegistry | `0x8004B663056A597Dffe9eCcC1965A193B7388713` |
| ReceiverTemplate | smartcontractkit/documentation or x402-cre-price-alerts repo |
| CRE SDK | `@chainlink/cre-sdk` (check npm for latest) |
| CRE EVM Log Trigger docs | https://docs.chain.link/cre/reference/sdk/triggers/evm-log-trigger-ts |
| Forwarder Directory | https://docs.chain.link/cre/guides/workflow/using-evm-client/forwarder-directory |
| Workflow Registry (Mainnet) | `0x4Ac54353FA4Fa961AfcC5ec4B118596d3305E7e5` |
| Account Abstraction contracts | `@account-abstraction/contracts@0.7.0` |

---

## If Behind — What to Cut

1. **Use Coinbase Base Paymaster** (`0xf5d253B62543C6Ef526309D497f619CeF95aD430`) instead of custom AgentPaymaster — saves ~0.5 day
2. **Skip `updateWinnerWallet`** — wallet rotation recovery is edge case
3. **Simplify `_processReport`** — skip cross-check guards, just release bonds
4. **Skip CRE deploy** — use `cre workflow simulate` for demo, show simulation output
5. **Use MockKeystoneForwarder** for the demo — call `onReport` directly from a script
