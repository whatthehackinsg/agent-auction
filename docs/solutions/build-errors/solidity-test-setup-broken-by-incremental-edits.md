---
title: Solidity test setUp() broken by incremental AI edits — orphaned constructor args and missing function declaration
date: 2026-02-23
category: build-errors
tags: [solidity, foundry, forge, setUp, BasePaymaster, EIP-4337, incremental-edit]
severity: medium
time_to_solve: 15
---

# Solidity Test setUp() Broken by Incremental Edits

## Symptom

`forge test` fails with a compilation error:

```
Error (2314): Expected ';' but got ','
  --> test/AgentPaymaster.t.sol:70:49:
   |
70 |             IEntryPoint(address(mockEntryPoint)),
   |                                                 ^
```

The test file (`AgentPaymaster.t.sol`) had its `setUp()` function structurally broken after multiple incremental line-level edits across sessions. Three specific corruptions:

1. The `function setUp() public {` declaration line was **deleted entirely**
2. The `usdc = new MockUSDCToken();` initialization was **missing**
3. The `paymaster = new AgentPaymaster(` constructor call was **missing** — only its arguments remained as orphaned expression statements

The resulting code looked like:

```solidity
    bytes32 auctionId = keccak256("auction-1");
        mockEntryPoint = new MockEntryPoint();
        identityRegistry = new MockIdentityRegistry();
        mockEscrow = new MockEscrowBonds();
            IEntryPoint(address(mockEntryPoint)),   // ← orphaned arg
            IERC20(address(usdc)),                  // ← orphaned arg
            IERC8004Registry(address(identityRegistry))
        );
```

Additionally, 10 occurrences of `vm.prank(ENTRY_POINT)` referenced a `ENTRY_POINT` constant that had been removed when switching from `vm.etch`-based EntryPoint mocking to a proper `MockEntryPoint` contract.

## Root Cause

**Incremental line-level edits across multiple sessions caused line drift and partial overwrites.** Specifically:

1. The original file used `address constant ENTRY_POINT = 0x0000...032` with `vm.etch()` to stub the EntryPoint
2. A mid-session refactor replaced this with a `MockEntryPoint` contract (because `BasePaymaster`'s constructor calls `IEntryPoint.supportsInterface()`, which `vm.etch(hex"00")` can't handle)
3. During the refactor, the `setUp()` function declaration and two initialization lines were accidentally dropped by an edit operation that replaced a range of lines but didn't include the function header
4. The `ENTRY_POINT` constant was removed but its 10 usages in test functions were not updated in the same edit pass

**This is a class of bug specific to AI line-editing tools**: when an edit tool replaces lines N–M, it can accidentally swallow lines adjacent to the intended edit range, especially function declarations that sit right before the lines being modified.

## Solution

### Fix 1: Restore setUp() structure

Add back the missing function declaration and initialization lines:

```solidity
    bytes32 auctionId = keccak256("auction-1");

    function setUp() public {          // ← was missing
        mockEntryPoint = new MockEntryPoint();
        usdc = new MockUSDCToken();    // ← was missing
        identityRegistry = new MockIdentityRegistry();
        mockEscrow = new MockEscrowBonds();

        paymaster = new AgentPaymaster(  // ← was missing
            IEntryPoint(address(mockEntryPoint)),
            IERC20(address(usdc)),
            IERC8004Registry(address(identityRegistry))
        );
```

### Fix 2: Replace all ENTRY_POINT references

```bash
sed -i '' 's/vm\.prank(ENTRY_POINT)/vm.prank(address(mockEntryPoint))/g' test/AgentPaymaster.t.sol
```

10 occurrences replaced across test functions for `validatePaymasterUserOp` and `postOp`.

### Verification

```bash
forge test --match-contract AgentPaymasterTest -vv
# Result: 14/14 tests pass
```

## What Didn't Work

1. **ast-grep replace** — `ast_grep_replace(pattern='vm.prank(ENTRY_POINT)', rewrite='vm.prank(address(mockEntryPoint))')` returned "No matches found" because the Solidity AST parser couldn't parse the file while it had the compilation error in setUp(). The structural fix had to come first.

2. **Line-level edits for the setUp fix** — The first edit attempt using `replace_lines` on the correct range succeeded in adding the missing lines BUT dropped the `function setUp() public {` declaration due to off-by-one in the range. Required a second `insert_between` edit to add the function declaration back.

## Prevention

1. **After any multi-line edit to a Solidity file, immediately run `forge build`** — don't batch multiple edits before compiling. Catch structural breaks early.

2. **When refactoring a constant/variable used in many places, do the global replacement FIRST (in a working file), THEN modify the declaration** — not the other way around. Removing the declaration first leaves the file in an uncompilable state where AST-based tools can't help.

3. **When editing setUp() or constructor functions, always verify the function signature line is preserved** — it's the most common casualty of range-based edits because it sits at the boundary between state variable declarations and function body.

4. **Use `sed` for simple global text replacements instead of AST tools when the file may have syntax errors** — `sed` works on raw text and doesn't require a parseable AST.

## References

- EIP-4337 BasePaymaster: requires `IEntryPoint.supportsInterface()` in constructor — can't use `vm.etch(addr, hex"00")` for testing
- Foundry `vm.etch` docs: https://book.getfoundry.sh/cheatcodes/etch
- Account Abstraction v0.7: `PackedUserOperation` struct, `BasePaymaster._validatePaymasterUserOp()` pattern
