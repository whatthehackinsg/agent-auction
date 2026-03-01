# Coding Conventions

**Analysis Date:** 2026-03-02

## Naming Patterns

**Files:**
- TypeScript files: `camelCase.ts` (e.g., `auction-room.ts`, `eip712-typed-data.ts`)
- React components: PascalCase with `.tsx` (e.g., `Badge.tsx`, `DoodleXBadge.tsx`)
- Hooks: `useXxx.ts` pattern (e.g., `useAuctions.ts`, `useAuctionRoom.ts`)
- Solidity contracts: PascalCase `.sol` (e.g., `AuctionRegistry.sol`, `AuctionEscrow.sol`)
- Test files: `*.test.ts` or `*.spec.sol` (e.g., `auction-room.test.ts`, `AuctionRegistry.t.sol`)
- Utility modules: `lowercase-kebab.ts` (e.g., `bond-watcher.ts`, `inclusion-receipt.ts`)

**Functions:**
- Regular functions and methods: `camelCase` (e.g., `fetchAuctions`, `validateAction`, `computeEventHash`)
- Factory functions: `create*` prefix (e.g., `createMockStorage()`, `createTestMiniflare()`, `createX402Middleware()`)
- Getter/checker functions: `get*`, `is*`, `has*` prefixes (e.g., `getX402Handler()`, `isRecord()`, `hasX402Receipt()`)
- Async handlers: `handle*` prefix (e.g., `handleJoin()`, `handleBid()`, `handleDeliver()`)
- Private/internal helper functions: underscore prefix in Solidity (e.g., `_checkSequencer()`, `_checkAdmin()`)

**Variables:**
- camelCase for local variables, parameters, and properties
- CONSTANT_CASE for immutable constants (Solidity) or module-level constants
- Single letter or short names for loop variables: `i`, `v`, `key`, `value`
- Hex addresses/bytes32: `0x` prefix, kept as string or bytes type (e.g., `ZERO_HASH_HEX = '0x' + '00'.repeat(32)`)
- Agent/wallet identifiers: agentId (bigint/uint256), wallet (0x address)

**Types:**
- Interfaces: `I` prefix in Solidity (e.g., `IAuctionTypes`, `IReceiver`, `IERC20`)
- Type aliases: PascalCase, exported at module level
- Generic type parameters: `T`, `K`, `V` convention
- Enums: PascalCase values (e.g., `ActionType.JOIN`, `ActionState.OPEN`)

## Code Style

**Formatting:**
- **TypeScript/JavaScript**: ESLint with Next.js base config
  - Config: `frontend/eslint.config.mjs` (flat config format)
  - Tab width: Not explicitly set (ESLint default or Prettier)
  - String quotes: Single quotes by convention (observed in codebase)
  - Indentation: 2 spaces (React/Next.js standard)

- **Solidity**: Foundry `forge fmt`
  - Config: `contracts/foundry.toml`
  - Tab width: 4
  - Line length: 120
  - Bracket spacing: false
  - Int types: "long" (use `uint256` not `uint`)
  - Quote style: double quotes
  - Number underscores: thousands separator
  - Multiline function headers: attributes first

**Linting:**
- **Frontend**: ESLint with `eslint-config-next/core-web-vitals` and TypeScript support
  - Enforces Next.js best practices
  - Type checking enabled via `eslint-config-next/typescript`
  - Ignore patterns: `.next/`, `out/`, `build/`, `next-env.d.ts`

- **Solidity**: Foundry built-in linting (no external linter configured)

## Import Organization

**Order (TypeScript/JavaScript):**
1. Node.js built-in modules (`'node:fs'`, `'node:path'`)
2. Third-party packages (`'viem'`, `'hono'`, `'@openzeppelin/contracts'`)
3. Internal modules from same package (`'../lib/api'`, `'./types/engine'`)
4. Relative sibling imports (`'./utils'`)

**Example from `engine/src/index.ts`:**
```typescript
import { Hono, type Context, type Next } from 'hono'
import { cors } from 'hono/cors'
import { AuctionRoom } from './auction-room'
import { toHex, keccak256, encodePacked } from 'viem'
import { serializeReplayBundle, computeContentHash } from './lib/replay-bundle'
```

**Path Aliases:**
- Frontend: `@/*` resolves to `src/*` (configured in `tsconfig.json`)
- Used for absolute imports: `import { fetcher } from '@/lib/api'`

**Solidity Imports:**
- Remappings configured in `foundry.toml`:
  - `forge-std/` → `lib/forge-std/src/`
  - `@openzeppelin/contracts/` → `lib/openzeppelin-contracts/contracts/`
  - `@chainlink/contracts/` → `lib/chainlink/contracts/`

## Error Handling

**Pattern in TypeScript:**
```typescript
// Explicit error checking with instanceof
const message = err instanceof Error ? err.message : 'unknown error'
return new Response(JSON.stringify({ error: message }), { status: 400 })

// Throw with descriptive messages
throw new Error('auctionId not set')
throw new Error('auction is closed')
```

**Solidity Custom Errors:**
- Error names are nouns or adjective phrases (e.g., `ZeroAddress`, `AuctionNotOpen`, `InvalidSequencerSig`)
- Define as `error` not `require()` (Solidity 0.8.4+)
- Grouped in "Errors" section before modifiers
- Example from `AuctionRegistry.sol`:
```solidity
error OnlySequencer();
error OnlyEscrow();
error AuctionAlreadyExists();
error InvalidSequencerSig();
```

**Validation:**
- Early return pattern with descriptive errors
- Input validation before state changes
- Null/undefined checks with ternary fallbacks: `data?.auctions ?? []`

## Logging

**Framework:** `console` (no logging library)

**Patterns:**
- Info: `console.info(JSON.stringify({ component: 'x402', event, ...payload }))`
- Error: Log with context object: `{ component: 'name', error: message }`
- Structured logging with JSON (observed in x402 event logging)
- No console.log in production code; use console.info/console.error

**When to Log:**
- Critical path events (payments, settlements, auctions closing)
- Configuration issues or warnings
- Error recovery and fallbacks
- Do NOT log sensitive data (private keys, agent wallets from server side—masked in WebSocket)

## Comments

**When to Comment:**
- Function purposes with JSDoc/TSDoc blocks (parameters, return types, errors)
- Complex algorithm explanations (e.g., Poseidon hashing, CRE settlement logic)
- Non-obvious design decisions and invariants
- Mark workarounds with `FIX:` or `NOTE:` (observed: `// FIX: changed from string to bytes10`)
- Section headers with `// ── Section Name ──`

**JSDoc/TSDoc:**
- Used for public functions and exports
- Include `@param`, `@returns`, `@throws` when necessary
- Example from crypto library:
```typescript
/**
 * Compute the EIP-712 typed data hash for a speech act.
 * Returns the 32-byte digest that gets signed.
 */
export function hashTypedData(domain: EIP712Domain, speechAct: string, message: unknown): Uint8Array
```

- Solidity: NatSpec format (triple-slash `///`)
```solidity
/// @title AuctionRegistry — Simplified auction state machine
/// @notice Manages auction lifecycle: NONE → OPEN → CLOSED → SETTLED (or CANCELLED).
/// @dev Ref: full_contract_arch(amended).md Section 7
```

## Function Design

**Size:**
- Prefer small, focused functions (< 50 lines common)
- Extract helpers for complex logic (e.g., `normalizeRoomConfig()`, `actionTypeToNumber()`)
- Use early returns to reduce nesting

**Parameters:**
- Max 4-5 parameters; use object parameter for > 3 related fields
- TypeScript: explicit type annotations (no implicit `any`)
- Solidity: use struct for multiple related fields (e.g., `AuctionSettlementPacket`)

**Return Values:**
- Explicit return types in TypeScript/Solidity
- Return objects for multiple related values: `{ domain, types, value }`
- Nullable returns: use `| undefined` or `| null` explicitly
- Async functions return `Promise<T>`

## Module Design

**Exports:**
- Barrel files (`index.ts`) re-export key types and functions
- Example from `frontend/src/hooks/index.ts`: exports all hook functions
- Selective exports, not `export *` (except in barrel files)

**Barrel Files:**
- `src/hooks/index.ts` — re-exports all custom hooks
- `src/lib/index.ts` or direct imports preferred for utilities
- Reduces import paths: `import { useAuctions } from '@/hooks'` instead of `@/hooks/useAuctions`

**File Organization:**
- One primary class/function per file (with helpers)
- Related tests co-located or in `test/` directory
- Type definitions in separate `types/` directory or inline in module files
- Lib/utilities in `lib/` or `utils/` subdirectory

## Visibility Modifiers (Solidity)

- `public` for state variables and functions meant to be called externally
- `internal` for contract-only helpers (inherited contracts can call)
- `private` for strict encapsulation
- View/pure for read-only functions

## Other Conventions

**Strings vs Hex:**
- Use hex strings for cryptographic values: `'0x' + '00'.repeat(32)` for zero hash
- Keep auctionId as bytes32/hex, addresses as `0x...` format
- Encode numeric values in strings for JSON: `deposit_amount: string`

**Constants vs Variables:**
- All-caps for module-level constants: `ZERO_HASH_HEX`, `CANCEL_TIMEOUT_SEC`
- Regular case for class/instance constants
- Magic numbers extracted to named constants

**TypeScript strictness:**
- `strict: true` in `tsconfig.json` (all projects)
- No implicit `any`
- Explicit null checks: `value !== null`, `value !== undefined`

---

*Convention analysis: 2026-03-02*
