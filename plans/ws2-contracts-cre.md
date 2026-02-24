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
- [x] `forge init contracts`
- [x] Install dependencies:
  ```bash
  forge install eth-infinitism/account-abstraction@v0.7.0
  forge install OpenZeppelin/openzeppelin-contracts
  # For ReceiverTemplate: copy from smartcontractkit/documentation or x402-cre-price-alerts
  ```
- [x] Set `solidity = "0.8.24"` in `foundry.toml` (Cancun EVM target for Base Sepolia)

**AgentAccount.sol** (see amended doc Section 3):
- [x] Simplified: `runtimeSigner` (EOA) + sig/nonce validation only
- [x] `address public runtimeSigner` — set at creation, rotatable via `setRuntimeSigner()`
- [x] `validateUserOp()`: `ECDSA.recover(userOpHash, sig) == runtimeSigner`
- [x] `execute(address, uint256, bytes)` — only callable by EntryPoint
- [x] NO ZK verifier calls (moved to DO)

**AgentAccountFactory.sol:**
- [x] `createAccount(address runtimeSigner, uint256 salt)` — CREATE2
- [x] `getAddress(address runtimeSigner, uint256 salt)` — view, deterministic

**AgentPaymaster.sol** (see amended doc Section 3):
- [x] Method-based gating in `validatePaymasterUserOp()`:
  - `USDC.transfer` to escrow → allowed for any ERC-8004 registered agent (no prior bond required)
  - Other operations → require existing bond via `escrow.bondRecords()`
- [x] `postOp()`: log gas cost for analytics only (MVP)

**AuctionRegistry.sol** (see amended doc Section 7):
- [x] `DOMAIN_SEPARATOR` — `EIP712Domain("AgentAuction", "1", chainId, address(this))`
- [x] `createAuction(bytes32 auctionId, bytes32 manifestHash, ...)` — simple storage write
- [x] `recordResult(AuctionSettlementPacket calldata packet, bytes calldata sequencerSig)` — emits `AuctionEnded`
- [x] `markSettled(bytes32 auctionId)` — `onlyEscrow`
- [x] `cancelExpiredAuction(bytes32 auctionId)` — 72h timeout
- [x] `updateWinnerWallet(...)` — EIP-712 wallet rotation recovery
- [x] State machine: `NONE → OPEN → CLOSED → SETTLED` (or `CLOSED → CANCELLED`)
- [x] `setEscrow(address)` — one-time binding
- [x] NO `anchorHash()`, NO `getAnchors()`, NO `anchorTrails` (all removed)

**AuctionEscrow.sol** (see amended doc Section 8):
- [x] Inherits `ReceiverTemplate` + `ReentrancyGuard`
- [x] `recordBond(auctionId, agentId, depositor, amount, x402TxId)` — `onlyAdmin`, idempotent on txId
- [x] `_processReport(bytes calldata report)` — decode `abi.encode(auctionId, winnerAgentId, winnerWallet, amount)`, O(1) settlement
- [x] `claimRefund(auctionId, agentId)` — pull-based, deposit-time beneficiary
- [x] `withdraw()` — pull pattern
- [x] `adminRefund(...)` — emergency
- [x] `checkSolvency()` — view
- [x] Solvency invariant: `usdc.balanceOf(this) >= totalBonded + totalWithdrawable`

**MockKeystoneForwarder.sol:**
- [x] Calls `onReport(metadata, report)` directly for local dev/testing
- [x] Configurable metadata (workflowId, workflowName, workflowOwner)

**Foundry Tests:**
- [x] `AgentAccount.t.sol`: validateUserOp passes with correct runtimeSigner, fails with wrong signer _(15 tests)_
- [x] `AgentPaymaster.t.sol`: bond deposit allowed for registered agent, non-bond ops require bond _(19 tests)_
- [x] `AuctionRegistry.t.sol`: createAuction → recordResult → markSettled state transitions _(30 tests)_
- [x] `AuctionEscrow.t.sol`: recordBond → processReport → claimRefund → withdraw full flow _(53 tests)_
- [x] ~~`Settlement.t.sol`~~ _(integration tests folded into AuctionEscrow.t.sol instead of separate file)_

**Deliveries:**
- [x] Push all contracts to `contracts/src/`
- [x] Push tests to `contracts/test/`
- [x] Run `forge build` — ABIs available in `contracts/out/`
- [x] ~~Tag: `ws2/contracts-ready`~~ _(no git tags used; delivered via main branch)_

### Day 3-4: Deploy + Wire

```
Priority: CRITICAL — WS-3 needs deployed addresses by end of Day 4
```

**Deploy to Base Sepolia** _(deployed directly via forge script, not Tenderly)_:

Follow the 10-step deployment order from amended doc Section 10:

- [x] Step 1: Verify EntryPoint at `0x0000000071727De22E5E9d8BAf0edAc6f37da032`
- [ ] Step 2: Deploy `AgentPrivacyRegistry` (from WS-1) _(bead pgi — added to Deploy.s.sol Step 6b but NOT deployed on-chain yet)_
  - After deploy: note address for WS-1 proof-generator
- [x] Step 3: Deploy `AgentAccount` (implementation)
- [x] Step 4: Deploy `AgentAccountFactory(entryPoint, agentAccountImpl)`
- [x] Step 5: Deploy `AgentPaymaster(entryPoint)` → stake ETH _(0.01 ETH staked, 0.05 ETH deposited)_
- [x] Step 6: Deploy `AuctionRegistry(sequencerAddress)` → DOMAIN_SEPARATOR set in constructor
- [x] Step 7: Deploy `AuctionEscrow` _(v2 with real KeystoneForwarder `0x82300bd7...`, not MockKeystoneForwarder)_
- [x] Step 8: Wire: `AuctionRegistry.setEscrow(escrowAddress)`

**Post-deploy verification:**
- [x] Verify each contract on ~~Tenderly explorer~~ Basescan _(all verified)_
- [x] Run basic smoke tests via cast (createAuction, check state)

**Write `deployments/base-sepolia.json`:**
- [x] _(deployed addresses + ABIs published)_

**EIP-4337 Bundler setup:**
- [x] Choose bundler: Pimlico or CDP (both support Base Sepolia EntryPoint v0.7) _(Pimlico selected — `api.pimlico.io/v2/84532/rpc`)_
- [x] Configure and test UserOp submission _(AgentAccount + AgentPaymaster full flow confirmed — [tx](https://sepolia.basescan.org/tx/0x43c2d11fec8845a05f0bb6347bd056f4c41b43f52ad3514c7fa2d7cc1faeaa1c))_
- [x] Document bundler endpoint for WS-3 _(deployments/base-sepolia.json, engine/AGENTS.md, docs/developer-guide.md)_

**Export AuctionSettlementPacket TypeScript type:**
- [x] _(contracts/types/index.ts)_

**Deliveries:**
- [x] Push `deployments/base-sepolia.json`
- [x] Push TS types to `contracts/types/`
- [x] ~~Tag: `ws2/deployed`~~ _(no git tags used; delivered via main branch)_

### Day 5-6: CRE Settlement Workflow

**Write CRE Settlement Workflow** (`cre/workflows/settlement/`):

Using `@chainlink/cre-sdk`:

- [x] **Trigger:** EVM Log Trigger on `AuctionEnded` event
  - [x] Contract: AuctionRegistry address
  - [x] Confidence: `FINALIZED` (irreversible fund release — MUST wait for finality)
  - [x] Topics[0]: keccak256 of `AuctionEnded` signature
- [x] **Compute:**
  1. [x] Read auction state from AuctionRegistry via EVMClient _(LAST_FINALIZED_BLOCK_NUMBER)_
  2. [x] Cross-check winner against `getWinner()` — agentId, wallet, AND finalPrice
  3. [x] Fetch ReplayBundleV1 from configured base URL — ~~sha256 verify~~ presence check _(full hash verification is P1)_
  4. [ ] Replay Poseidon hash chain _(deferred to P1)_
  5. [ ] Replay English auction rules: iterate BID events, track highest valid bid _(deferred to P1)_
  6. [x] ~~Derived `winnerAgentId` must match event~~ Cross-verification done via getWinner()
  7. [ ] ~~Read `ownerOf(winnerAgentId)` from ERC-8004~~ _(identity verification handled by contracts, not CRE)_
  8. [ ] ~~Read `getAgentWallet(winnerAgentId)`~~ _(wallet verification via getWinner() instead)_
- [x] **Write:** EVMClient → KeystoneForwarder → `AuctionEscrow.onReport(metadata, report)`
  - `report = abi.encode(bytes32 auctionId, uint256 winnerAgentId, address winnerWallet, uint256 amount)`

**Configure `project.yaml`:**
- [x] Set RPC endpoints (Base Sepolia)
- [x] Pin `@chainlink/cre-sdk` version

**Test locally:**
- [x] `cre workflow simulate` — verify full flow passes _(E2E confirmed: transmissionSuccess=true, tx 0x0b8e9ede...)_
- [x] Integration test in Foundry: full settlement flow _(AuctionEscrow.t.sol covers MockKeystoneForwarder path)_

**Deliveries:**
- [x] Push CRE workflow to `cre/`
- [x] Document: `{ workflowId, workflowName: "auctSettle", workflowOwner }`
- [x] ~~Tag: `ws2/cre-ready`~~ _(no git tags used; delivered via main branch)_

### Day 7-8: E2E Integration + CRE Registration

**Register CRE Workflow (Step 10):**
- [ ] `cre workflow deploy` (registers on Ethereum Mainnet Workflow Registry) _(bead d26 — simulation confirmed, formal registration pending)_
- [ ] Record `workflowId` from deployment output
- [ ] Configure AuctionEscrow _(bead wq4 — blocked on d26; configureCRE() not yet called)_:
  ```bash
  cast send $ESCROW "setExpectedWorkflowId(bytes32)" $WORKFLOW_ID
  cast send $ESCROW "setExpectedWorkflowName(string)" "auctSettle"
  cast send $ESCROW "setExpectedAuthor(address)" $WORKFLOW_OWNER
  ```

**Full E2E settlement test:**
- [x] `createAuction` → agents bond → agents join/bid → close → `recordResult` → `AuctionEnded` event → CRE triggers → `onReport` → verify SETTLED + escrow credits correct _(confirmed on Base Sepolia)_

**Fix bugs surfaced by WS-3 integration:**
- [x] Contract interface mismatches _(3-round security review, 9 bugs fixed)_
- [x] Gas estimation issues
- [x] ABI encoding discrepancies

### Day 9-10: Polish

- [x] Security review: reentrancy, access control, solvency invariant _(3-round review complete)_
- [x] Write contracts + CRE section of README
- [x] Verify all Foundry tests pass _(117/117)_
- [ ] Assist demo video (show settlement tx on Basescan) _(bead 2c3)_

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
