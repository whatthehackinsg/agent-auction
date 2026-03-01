# Technology Stack

**Analysis Date:** 2026-03-02

## Languages

**Primary:**
- TypeScript 5.5+ - Core application logic (engine, MCP server, frontend, crypto library)
- Solidity 0.8.24 - Smart contracts with Cancun EVM support
- Circom 2.2.3 - ZK circuit definitions (RegistryMembership ~12K, BidRange ~5K)

**Secondary:**
- JavaScript/CommonJS - Legacy configuration and test utilities
- Bash/Shell - Build and deployment scripts

## Runtime

**Environment:**
- Node.js 20+ (frontend CI/CD uses Node 20, Chainlink dependency specifies v16.16.0 minimum)
- Bun - CRE settlement workflow runtime
- Cloudflare Workers - Engine runtime (Durable Objects + D1 SQLite)
- Foundry/Solc - Smart contract compilation and testing

**Package Manager:**
- npm (monorepo workspaces) - Primary package manager
- Bun - Lightweight runtime for CRE settlement (package.json with `"type": "module"`)
- Lockfile: `package-lock.json` present across modules

## Frameworks

**Core:**
- Hono 4.12.2 - HTTP framework for Cloudflare Workers (engine API)
- Next.js 16.1.6 - Frontend React application with React 19.2.3
- Express 5.1.0 - MCP server HTTP transport
- Viem 2.46.2 - Ethereum client library (shared across engine, agent-client, CRE, crypto)

**Testing:**
- Vitest 3.2.4 (engine), 2.0.0 (crypto) - Unit and integration tests with real interactions
- Miniflare 4.20260219.0 - Cloudflare Workers local testing/mocking
- Jest/Forge Test - Solidity contract testing via Foundry

**Build/Dev:**
- Wrangler 4.67.0 - Cloudflare Workers CLI and dev server
- TypeScript 5.9.3 - Compilation and type checking across modules
- Forge 0.2.0+ - Solidity build and test runner (via foundry.toml)
- Snarkjs 0.7.5+ - ZK proof generation and verification (Groth16)

## Key Dependencies

**Critical:**
- viem 2.46.2 - Why: Universal Ethereum client with secp256k1 signing, contract ABIs, chain state reads (used in engine, CRE, agent-client, crypto)
- @chainlink/cre-sdk latest - Why: Chainlink Runtime Environment SDK for DON consensus and event-driven settlement workflows
- @x402/core 2.5.0 - Why: x402 micropayment protocol core (discovery gating, payment verification)
- @x402/evm 2.5.0 - Why: x402 EVM chain integration (gas estimation, rate conversions)
- @x402/hono 2.5.0 - Why: x402 Hono middleware for HTTP payment handling
- @x402/fetch 2.5.0 - Why: x402 fetch wrapper for automatic x402 payment on HTTP requests (agent-client)

**Infrastructure:**
- @modelcontextprotocol/sdk 1.27.0 - Why: MCP protocol for AI agent tool communication
- @dynamic-labs/sdk-react-core 4.65.0 - Why: Wallet connection UI for frontend spectators
- @dynamic-labs/ethereum 4.65.0 - Why: EthereumWalletConnectors for Dynamic wallet integration
- snarkjs 0.7.6 - Why: ZK proof verification with inlined circuit vkeys (RegistryMembership, BidRange)
- poseidon-lite 0.3.0 - Why: Zero-dependency Poseidon hashing for CF Workers (poseidon-chain sequencer)
- ethers 6.13.0 - Why: Cryptographic utilities (EIP-712 hashing, nullifier generation)
- permissionless 0.3.4 - Why: Typed UserOp abstraction and intent-based transaction semantics
- @coinbase/cdp-sdk 1.27.0 - Why: Coinbase Developer Platform for agent wallet management (agent-client only)
- zod 3.25.0 - Why: Runtime schema validation (CRE config, MCP tool arguments)

## Configuration

**Environment:**
- Base Sepolia RPC URL (env: `BASE_SEPOLIA_RPC_URL`, default: `https://sepolia.base.org`)
- Sequencer private key (env: `SEQUENCER_PRIVATE_KEY`) - Signs `recordResult` transactions
- Pinata API key (env: `PINATA_API_KEY`) - Optional: IPFS pinning for replay bundles
- Pimlico bundler URL (env: `PIMLICO_BUNDLER_URL`) - UserOp submission for bond deposits via AgentAccount
- Engine admin key (env: `ENGINE_ADMIN_KEY`) - Bypasses x402 gates on internal calls
- MCP server port (env: `MCP_PORT`, default: 3100)
- Dynamic Labs environment ID (env: `NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID`) - Frontend wallet connection

**Build:**
- `contracts/foundry.toml` - Solidity compiler config (0.8.24, Cancun EVM, 200 optimizer runs)
- `engine/wrangler.toml` - Cloudflare Workers config (D1 database, Durable Objects, migrations)
- `frontend/next.config.js` - Next.js build configuration
- `tsconfig.json` (per-module) - TypeScript compiler options (strict mode, ES modules)

## Platform Requirements

**Development:**
- Node.js 20+ (recommended for CI/CD compatibility)
- Foundry (forge, anvil) for smart contract development
- Bun runtime for CRE workflows
- Git for version control

**Production:**
- Cloudflare Workers (engine) - Deployed via wrangler
- Vercel (frontend) - Deployed via GitHub Actions + Vercel CLI
- Base Sepolia testnet - Blockchain execution
- Chainlink DON - CRE settlement execution (externally managed)
- Pinata IPFS (optional) - Replay bundle pinning

---

*Stack analysis: 2026-03-02*
