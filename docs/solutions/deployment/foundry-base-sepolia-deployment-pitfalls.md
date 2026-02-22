---
title: Foundry deployment to Base Sepolia — common pitfalls (env vars, verification, Paymaster funding)
date: 2026-02-23
category: deployment
tags: [foundry, forge-script, base-sepolia, basescan, verify-contract, eip-4337, paymaster]
severity: medium
time_to_solve: 30
---

# Foundry Deployment to Base Sepolia — Common Pitfalls

## Symptom

Three separate failures during `forge script` deployment to Base Sepolia:

### 1. Private key not found
```
Error: script failed: vm.envUint: environment variable "DEPLOYER_PRIVATE_KEY" not found
```

### 2. Private key missing 0x prefix
```
Error: script failed: vm.envUint: failed parsing $DEPLOYER_PRIVATE_KEY as type `uint256`: missing hex prefix ("0x") for hex string
```

### 3. Basescan verification rate limited
```
Error: Encountered an error verifying this contract:
Response: `NOTOK`
Details: `Max calls per sec rate limit reached (3/sec)`
```

### 4. Paymaster stake/deposit silently skipped
```
SKIP: Paymaster stake/deposit (insufficient ETH or zero config)
```

## Root Cause

### 1. `source .env` doesn't export variables
Foundry's `vm.envUint()` reads from **process environment**, not shell variables. Running `source .env` sets shell-local variables but doesn't `export` them, so the `forge` child process can't see them.

### 2. `vm.envUint` requires `0x` prefix for hex strings
Foundry's `vm.envUint("DEPLOYER_PRIVATE_KEY")` parses the value as a `uint256`. Private keys exported from MetaMask are bare hex (no `0x` prefix). Foundry requires the `0x` prefix to parse hex strings as uint256.

### 3. Basescan free tier limits to 3 API calls/second
Running `forge verify-contract` for multiple contracts in parallel (via `&`) fires all requests simultaneously, exceeding the Basescan rate limit.

### 4. Deploy script balance check is conservative
In `Deploy.s.sol` line 152:
```solidity
if (stakeAmount > 0 && address(vm.addr(config.deployerKey)).balance >= stakeAmount + depositAmount) {
```
Default stakeAmount (0.01) + depositAmount (0.05) = 0.06 ETH. If wallet has less (e.g., 0.059 ETH after deployment gas), the condition fails and funding is silently skipped with a log message.

## Solution

### 1. Use `set -a` before sourcing `.env`
```bash
set -a              # Auto-export all variables
source .env
set +a              # Stop auto-exporting
forge script script/Deploy.s.sol --rpc-url "$BASE_SEPOLIA_RPC" --broadcast
```

### 2. Add `0x` prefix to private key in `.env`
```bash
# Wrong
DEPLOYER_PRIVATE_KEY=abc123def456...

# Correct
DEPLOYER_PRIVATE_KEY=0xabc123def456...
```

### 3. Verify contracts sequentially, not in parallel
```bash
# Wrong — hits rate limit
forge verify-contract 0xAAA ... --watch &
forge verify-contract 0xBBB ... --watch &
forge verify-contract 0xCCC ... --watch &
wait

# Correct — one at a time
forge verify-contract 0xAAA src/Contract.sol:Contract \
  --chain-id 84532 --etherscan-api-key "$BASESCAN_API_KEY" --watch
# wait for completion, then next...
```

Note: Use paths relative to the Foundry project root (e.g., `src/Contract.sol`), NOT full paths. Running from `contracts/` workdir means `src/...` not `contracts/src/...`.

### 4. Fund Paymaster separately after deployment
```bash
# addStake (0.01 ETH, 1-day unstake delay)
cast send 0xPAYMASTER_ADDRESS "addStake(uint32)" 86400 \
  --value 0.01ether --rpc-url "$BASE_SEPOLIA_RPC" --private-key "$DEPLOYER_PRIVATE_KEY"

# deposit (0.05 ETH)
cast send 0xPAYMASTER_ADDRESS "deposit()" \
  --value 0.05ether --rpc-url "$BASE_SEPOLIA_RPC" --private-key "$DEPLOYER_PRIVATE_KEY"
```

Or set env vars to 0 during deployment to skip intentionally, then fund later:
```bash
PAYMASTER_STAKE_ETH=0 PAYMASTER_DEPOSIT_ETH=0 forge script script/Deploy.s.sol --broadcast ...
```

## Bonus: Wrong RPC network

Always verify your RPC URL before deploying. If `.env` has `BASE_SEPOLIA_RPC` pointing to mainnet (`https://base-mainnet.g.alchemy.com/...`), you'll deploy to mainnet and spend real money.

Quick sanity check:
```bash
source .env
echo "${BASE_SEPOLIA_RPC:0:40}"  # Should contain 'sepolia'
cast chain-id --rpc-url "$BASE_SEPOLIA_RPC"  # Should return 84532
```

## What Didn't Work

1. **`--private-key` flag on forge script without also exporting env vars** — `HelperConfig.s.sol` still calls `vm.envUint("DEPLOYER_PRIVATE_KEY")` internally, so the env var must exist even if you pass `--private-key` on the CLI.
2. **Parallel `forge verify-contract` with `&`** — Basescan's 3/sec rate limit kills all requests. Must be sequential.
3. **`forge script --verify --resume`** — Requires `--broadcast` flag to be present alongside `--resume`; can't use `--resume` alone for verification-only reruns.

## Prevention

1. Create a `.env.example` with clear comments:
   ```bash
   # REQUIRED: Private key with 0x prefix
   DEPLOYER_PRIVATE_KEY=0x...
   # REQUIRED: Base Sepolia RPC (NOT mainnet!)
   BASE_SEPOLIA_RPC=https://base-sepolia.g.alchemy.com/v2/YOUR_KEY
   # OPTIONAL: For contract verification on Basescan
   BASESCAN_API_KEY=...
   ```
2. Add `[etherscan]` section to `foundry.toml` for automatic verification during `--broadcast --verify`.
3. Add a pre-deploy balance check script or assertion in Deploy.s.sol.
4. Always run `cast chain-id --rpc-url $RPC` before deploying to verify network.

## References

- Foundry Book — forge script: https://book.getfoundry.sh/reference/forge/forge-script
- Foundry Book — forge verify-contract: https://book.getfoundry.sh/reference/forge/forge-verify-contract
- Basescan API rate limits: https://docs.basescan.org/api-endpoints
- EIP-4337 BasePaymaster — addStake/deposit: https://github.com/eth-infinitism/account-abstraction