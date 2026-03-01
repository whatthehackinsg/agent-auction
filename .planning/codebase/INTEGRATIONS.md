# External Integrations

**Analysis Date:** 2026-03-02

## APIs & External Services

**Blockchain:**
- Base Sepolia RPC - On-chain contract reads/writes
  - SDK/Client: viem (publicClient/walletClient)
  - Config: `BASE_SEPOLIA_RPC_URL` env var, default `https://sepolia.base.org`

**Chainlink Runtime Environment (CRE):**
- Settlement trigger & verification
  - SDK: @chainlink/cre-sdk
  - Flow: AuctionEnded event → CRE workflow → DON signs report → KeystoneForwarder → onReport()
  - Config files: `cre/workflows/settlement/config.json` (simulation), `cre/project.yaml` (RPC)

**x402 Micropayments:**
- Discovery gating on auction list/detail endpoints
  - SDK: @x402/core, @x402/evm, @x402/hono
  - Facilitator: x402.org facilitator (default: https://www.x402.org/facilitator)
  - Auth: x402 payment receipt via HTTP headers
  - Routes: GET /auctions, GET /auctions/:id (gated when ENGINE_X402_DISCOVERY=true)
  - Prices: Configurable via ENGINE_X402_DISCOVERY_PRICE, ENGINE_X402_DETAIL_PRICE (default $0.001 each)
  - Receiver: ENGINE_X402_RECEIVER_ADDRESS - Wallet to collect x402 payments

**EIP-4337 Bundler (Pimlico):**
- UserOp submission for agent bond deposits (legacy path)
  - SDK: permissionless
  - URL: PIMLICO_BUNDLER_URL (e.g., https://api.pimlico.io/v2/84532/rpc?apikey=...)
  - Fallbacks: BUNDLER_URL_FALLBACKS (comma-separated)
  - Usage: `engine/scripts/agent-userop-demo.ts`, `engine/scripts/permissionless-userop-demo.ts`

**IPFS Pinning (Pinata):**
- Replay bundle archival (optional, best-effort)
  - SDK/Client: Pinata HTTP API (https://api.pinata.cloud/pinning/pinFileToIPFS)
  - Auth: Bearer token from PINATA_API_KEY env var
  - Implementation: `engine/src/lib/ipfs.ts` (pinToIpfs function)
  - Fallback: If PINATA_API_KEY not set or request fails, returns { cid: null } without error

## Data Storage

**Databases:**
- Cloudflare D1 (SQLite)
  - Binding: AUCTION_DB (configured in wrangler.toml)
  - Database ID: 931d6378-238f-4849-919b-f76d083485b7
  - Client: Cloudflare D1 native queries via Durable Objects
  - Purpose: Persistent auction metadata, room state, bond tracking

**File Storage:**
- IPFS (via Pinata) - Optional replay bundle pinning
- Local filesystem only for development/testing

**Caching:**
- Cloudflare Durable Objects DO storage - Primary state durability
  - Sequencer state in `AuctionRoom` DO
  - Poseidon hash chain log (monotonic `seq` values)
  - Event replay bundle hashes

## Authentication & Identity

**Auth Provider:**
- Custom ERC-8004 (agent registry) + EIP-712 signing
  - Implementation: `packages/crypto/src/eip712-typed-data.ts` (message hashing), `packages/crypto/src/onboarding.ts` (agent registration)
  - On-chain registry: ERC-8004 Identity Registry at `0x8004A818BFB912233c491871b3d84c89A494BD9e` (Base Sepolia)
  - Signing: secp256k1 private keys, signature verification via ecrecover
  - Identity verification: ENGINE_VERIFY_WALLET=true reads `ownerOf(agentId)` to verify wallet ownership

**Wallet Authentication (Frontend):**
- Dynamic Labs SDK (react-core)
  - Environment ID: NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID
  - Connectors: EthereumWalletConnectors for MetaMask, WalletConnect, etc.
  - Purpose: Read-only spectator authentication (no write actions from UI)

**MCP Server Authentication:**
- Optional agent private key for signing actions (AGENT_PRIVATE_KEY, AGENT_ID)
  - Tools requiring signing: join, bid, bond
  - Read-only tools (discover, details, events) work without authentication

## Monitoring & Observability

**Error Tracking:**
- Not detected in codebase

**Logs:**
- Console logging (console.info, console.error)
- Cloudflare Workers stdout/stderr captured by platform
- x402 events logged as JSON: `{ component: 'x402', event: string, ...payload }`
- CRE settlement watcher logs via `bun run scripts/settlement-watcher.ts` stdout

**Event Monitoring:**
- Auction event log via Durable Objects (internal sequencer)
- On-chain events: AuctionCreated, AuctionEnded emitted by AuctionRegistry
- WebSocket subscriptions: Two-tier (public masked, participant full data)

## CI/CD & Deployment

**Hosting:**
- Cloudflare Workers + Durable Objects (engine) - Deployed via wrangler
- Vercel (frontend) - Deployed via GitHub Actions
- Local/self-hosted (MCP server, agent-client) - Manual deployment

**CI Pipeline:**
- GitHub Actions - Only frontend deployment automated
  - Workflow: `.github/workflows/deploy-frontend.yml`
  - Trigger: Push to main with changes in frontend/** or workflow file
  - Steps: Node 20 setup → Vercel CLI install → vercel pull → vercel build → vercel deploy
  - Secrets used: VERCEL_TOKEN, VERCEL_ORG_ID, VERCEL_PROJECT_ID
- Manual deployment for engine (wrangler deploy) and CRE (cre workflow deploy)

**Contract Deployment:**
- Foundry forge deploy pattern in deployment scripts
- Target: Base Sepolia (chainId 84532)
- Deployer account: 0x633ec0e633AA4d8BbCCEa280331A935747416737

## Environment Configuration

**Required env vars (engine):**
- `SEQUENCER_PRIVATE_KEY` - 0x-prefixed 32-byte hex for signing recordResult
- `BASE_SEPOLIA_RPC_URL` - RPC endpoint (default: https://sepolia.base.org)

**Optional env vars (engine):**
- `PINATA_API_KEY` - Pinata JWT for IPFS replay bundle pinning
- `ENGINE_ADMIN_KEY` - Shared secret to bypass x402 gates on internal calls
- `ENGINE_REQUIRE_PROOFS` - Set 'true' to reject null ZK proofs on JOIN/BID
- `ENGINE_VERIFY_WALLET` - Set 'true' to verify wallet via ERC-8004 on JOIN
- `ENGINE_X402_DISCOVERY` - Set 'true' to enable x402 payment gating on discovery routes
- `ENGINE_X402_DISCOVERY_PRICE` - Price for /auctions list (default: $0.001)
- `ENGINE_X402_DETAIL_PRICE` - Price for /auctions/:id (default: $0.001)
- `X402_RECEIVER_ADDRESS` - Wallet address to receive x402 micropayments
- `X402_FACILITATOR_URL` - x402 facilitator endpoint (default: https://www.x402.org/facilitator)

**Required env vars (contracts deploy):**
- `DEPLOYER_PRIVATE_KEY` - 0x-prefixed 32-byte hex for contract deployment
- `BASE_SEPOLIA_RPC` - RPC URL for Base Sepolia

**Optional env vars (contracts deploy):**
- `BASESCAN_API_KEY` - For Basescan contract verification

**Required env vars (CRE):**
- CRE SDK env vars (see `cre/project.yaml`)
- RPC URLs for verification phase

**Required env vars (MCP server):**
- `ENGINE_URL` - Engine base URL (default: http://localhost:8787)
- `AGENT_PRIVATE_KEY` - Optional 0x-prefixed 64-char hex for signing actions
- `AGENT_ID` - Optional numeric ERC-8004 agent ID (required if AGENT_PRIVATE_KEY set)
- `MCP_PORT` - Server port (default: 3100)
- `ENGINE_ADMIN_KEY` - Optional admin key to bypass x402 gates

**Required env vars (agent-client):**
- `BASE_SEPOLIA_RPC` - RPC URL
- `ENGINE_URL` - Engine base URL
- `AGENT_PRIVATE_KEYS` - Comma-separated list of 0x-prefixed 32-byte hex keys (min 3 for demo)
- `PIMLICO_BUNDLER_URL` - Optional bundler URL for UserOp demo

**Frontend env vars:**
- `NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID` - Dynamic Labs environment ID (public)
- `NEXT_PUBLIC_AUCTION_ENGINE_URL` - Optional engine URL override (public)

**Secrets location:**
- Development: `.env` files (git-ignored, see `.gitignore`)
- CI/CD: GitHub Secrets (VERCEL_TOKEN, VERCEL_ORG_ID, VERCEL_PROJECT_ID)
- Production: Cloudflare Workers environment variables (via wrangler.toml vars/secrets)

## Webhooks & Callbacks

**Incoming:**
- POST /actions - EIP-712 signed action payloads (join, bid, bond)
- POST /verify-identity - ERC-8004 wallet ownership verification
- CRE KeystoneForwarder callback → AuctionEscrow.onReport() - Settlement transaction

**Outgoing:**
- Engine → AuctionRegistry.recordResult() - Record auction result on-chain
- Engine → AuctionRegistry.createAuction() - Record new auction on-chain
- Engine → AuctionEscrow.recordBond() - Record bond deposit from receipts
- CRE → KeystoneForwarder.report() - Send settlement report
- Frontend → Engine WebSocket - Subscribe to auction events (masked or full)
- Agent-client → Engine HTTP API - Fetch auctions, post bids/joins/bonds
- MCP server → Engine HTTP API - Same as agent-client

## Verifiable Event Ordering

**Mechanism:**
- Poseidon hash chain in Durable Objects (`AuctionRoom`)
- Each event hashes to previous event via `hash(prev_hash, event_data)` using poseidon-lite
- Monotonic `seq` numbers per room prevent gaps/reordering
- Final hash committed on-chain via AuctionRegistry.recordResult(finalLogHash)

---

*Integration audit: 2026-03-02*
