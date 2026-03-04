# Phase 1: Fix NFT Support Gaps - Research

**Researched:** 2026-03-04
**Domain:** ERC-721 tokenURI resolution, NFT metadata surfacing across engine/MCP/frontend, NftEscrow on-chain reads
**Confidence:** HIGH

## Summary

This phase closes gaps between the existing NFT infrastructure (NftEscrow contract, D1 schema columns, basic image display) and the rich NFT metadata experience needed for hackathon judges and agents. The core gap is that the engine currently stores `nft_contract`, `nft_token_id`, and `nft_chain_id` in D1 but never resolves the actual NFT metadata (name, description, image) from the on-chain `tokenURI()`. The frontend shows images only when a custom `item_image_cid` is manually uploaded, and the MCP tools return `hasNft: boolean` without any descriptive metadata. NftEscrow deposit status is never checked by the engine.

The solution is straightforward: add a tokenURI resolution step in the engine at auction creation time, cache the resolved metadata in D1, and propagate it through all existing API responses. The NftEscrow contract is already deployed and the engine already uses viem `publicClient` for on-chain reads -- we just need to add the NftEscrow ABI and a new read helper. No new contracts, no new API routes, no new MCP tools -- just enrichment of existing data flows.

**Primary recommendation:** Add engine-side tokenURI resolution at POST /auctions (with D1 columns for cached name/description/imageUrl), add NftEscrow deposit status reads, and propagate both through existing GET endpoints, MCP tools, and frontend components.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Resolve ERC-721 tokenURI() to get native NFT metadata as fallback when no custom image is uploaded
- Resolution happens engine-side at auction creation time, cached in D1 -- all consumers (MCP, frontend, WebSocket) benefit automatically
- Extract image + name + description from tokenURI JSON (the essential trio)
- Custom-uploaded image takes priority over tokenURI-resolved image; tokenURI is fallback only
- Update MCP tool descriptions to explicitly mention NFT fields in schemas
- Enrich existing tools (get_auction_details) with resolved NFT metadata -- no new dedicated tool
- Add NFT escrow deposit status to get_auction_details response
- discover_auctions returns richer NFT summary: nftName + nftImageUrl alongside hasNft boolean
- Auction detail page: image + name + collection link -- clean but informative
- Auction list page: show resolved NFT name below thumbnail in cards
- Add OpenSea marketplace link alongside explorer link for supported chains
- Show NFT escrow deposit badge ("NFT Deposited") on detail page when NftEscrow confirms custody
- Both MCP discover_auctions and frontend get NFT filtering
- MCP: hasNft filter parameter on discover_auctions
- Frontend: NFT toggle/tab on auctions list page

### Claude's Discretion
- tokenURI parsing edge cases (data URIs, non-standard metadata, IPFS resolution strategy)
- Exact UI styling/placement of NFT metadata elements
- Caching strategy and TTL for resolved tokenURI data
- Error handling when tokenURI is unreachable or returns invalid data
- OpenSea URL construction per chain

### Deferred Ideas (OUT OF SCOPE)
- On-chain NFT metadata traits/rarity display -- P1 enhancement
- Blur marketplace integration -- OpenSea sufficient for now
- Multi-image gallery/carousel per auction -- single image sufficient
- NFT collection aggregation view -- future feature
- Real-time tokenURI re-resolution (metadata updates) -- cache at creation is sufficient
</user_constraints>

## Standard Stack

### Core (already in project)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| viem | existing | On-chain reads (tokenURI, NftEscrow.deposits) | Already used in engine for all chain reads |
| Hono | existing | Engine HTTP framework | Already used for all engine routes |
| SWR | existing | Frontend data fetching | Already used in useAuctions/useAuctionDetail hooks |
| Zod | existing | MCP input validation | Already used in all MCP tools |

### Supporting (no new deps needed)
| Library | Purpose | Notes |
|---------|---------|-------|
| Cloudflare Workers `fetch()` | Fetch tokenURI JSON from IPFS/HTTP | Built-in, no import needed |
| `atob()` / `Buffer` | Decode base64 data URIs | Built-in in CF Workers runtime |

### Alternatives Considered
| Instead of | Could Use | Why Not |
|------------|-----------|---------|
| Server-side tokenURI resolution | Client-side resolution | Decision locked: engine-side, cached in D1 |
| New MCP tool for NFT metadata | Enriching existing tools | Decision locked: enrich existing tools only |
| OpenSea API for metadata | Direct tokenURI resolution | Over-engineering; tokenURI is the standard |

**Installation:** No new packages needed. All required functionality exists in current dependencies.

## Architecture Patterns

### Recommended Changes by Layer

```
engine/
  src/
    lib/
      nft-metadata.ts          # NEW: tokenURI resolution + parsing
      chain-client.ts           # ADD: nftEscrow contract + ERC-721 tokenURI ABI
      addresses.ts              # ADD: nftEscrow address constant
    index.ts                    # MODIFY: POST /auctions triggers resolution
                                # MODIFY: GET /auctions, GET /auctions/:id include resolved fields
                                # MODIFY: GET /auctions/:id/manifest includes resolved fields
  migrations/
    0003_add_resolved_nft.sql   # NEW: D1 columns for cached metadata
  schema.sql                    # UPDATE: add columns to canonical schema

mcp-server/
  src/tools/
    discover.ts                 # MODIFY: add nftName, nftImageUrl, hasNft filter
    details.ts                  # MODIFY: add resolved NFT metadata + escrow status

frontend/
  src/
    lib/
      format.ts                 # ADD: nftMarketplaceUrl() for OpenSea links
      ipfs.ts                   # MODIFY: handle tokenURI-resolved URLs (http + ipfs://)
    hooks/
      useAuctions.ts            # UPDATE: AuctionSummary interface with new fields
      useAuctionDetail.ts       # UPDATE: AuctionDetailResponse with new fields
    app/
      auctions/page.tsx         # MODIFY: NFT name display, NFT filter toggle
      auctions/[id]/page.tsx    # MODIFY: enriched item panel, escrow badge, OpenSea link
```

### Pattern 1: Engine-Side tokenURI Resolution

**What:** Resolve ERC-721 tokenURI at auction creation time, parse the JSON metadata, cache result in D1.
**When to use:** Every POST /auctions that includes nftContract + nftTokenId.
**Why engine-side:** Single resolution, all consumers benefit. CF Workers can fetch() to IPFS gateways and HTTP URLs.

```typescript
// engine/src/lib/nft-metadata.ts
import { publicClient } from './chain-client'

const erc721MetadataAbi = [
  {
    name: 'tokenURI',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [{ name: '', type: 'string' }],
  },
] as const

export interface ResolvedNftMetadata {
  name: string | null
  description: string | null
  imageUrl: string | null
  rawTokenUri: string | null
}

export async function resolveNftMetadata(
  nftContract: string,
  nftTokenId: string,
  nftChainId?: number,
): Promise<ResolvedNftMetadata> {
  const empty: ResolvedNftMetadata = {
    name: null, description: null, imageUrl: null, rawTokenUri: null,
  }

  try {
    // 1. Read tokenURI from contract
    const tokenUri = await publicClient.readContract({
      address: nftContract as `0x${string}`,
      abi: erc721MetadataAbi,
      functionName: 'tokenURI',
      args: [BigInt(nftTokenId)],
    })

    if (!tokenUri) return empty

    // 2. Parse the URI (data: URI, ipfs://, or http(s)://)
    const metadata = await fetchAndParseTokenUri(tokenUri)
    return { ...metadata, rawTokenUri: tokenUri }
  } catch {
    return empty
  }
}

async function fetchAndParseTokenUri(
  uri: string,
): Promise<Omit<ResolvedNftMetadata, 'rawTokenUri'>> {
  const empty = { name: null, description: null, imageUrl: null }

  // Handle base64 data URI
  if (uri.startsWith('data:application/json;base64,')) {
    const base64 = uri.slice('data:application/json;base64,'.length)
    const json = JSON.parse(atob(base64))
    return extractFromJson(json)
  }

  // Handle plain JSON data URI
  if (uri.startsWith('data:application/json,')) {
    const encoded = uri.slice('data:application/json,'.length)
    const json = JSON.parse(decodeURIComponent(encoded))
    return extractFromJson(json)
  }

  // Resolve ipfs:// to HTTPS gateway
  const fetchUrl = resolveIpfsUri(uri)

  const res = await fetch(fetchUrl, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(10_000), // 10s timeout
  })
  if (!res.ok) return empty

  const json = await res.json()
  return extractFromJson(json)
}

function extractFromJson(json: unknown): {
  name: string | null
  description: string | null
  imageUrl: string | null
} {
  if (!json || typeof json !== 'object') {
    return { name: null, description: null, imageUrl: null }
  }
  const obj = json as Record<string, unknown>
  const name = typeof obj.name === 'string' ? obj.name : null
  const description = typeof obj.description === 'string' ? obj.description : null
  const rawImage = typeof obj.image === 'string' ? obj.image : null
  const imageUrl = rawImage ? resolveIpfsUri(rawImage) : null
  return { name, description, imageUrl }
}

function resolveIpfsUri(uri: string): string {
  if (uri.startsWith('ipfs://')) {
    return `https://gateway.pinata.cloud/ipfs/${uri.slice(7)}`
  }
  return uri
}
```

### Pattern 2: NftEscrow Deposit Status Read

**What:** Read NftEscrow.deposits(auctionId) on-chain to get deposit state (NONE/DEPOSITED/CLAIMED/RETURNED).
**When to use:** GET /auctions/:id response enrichment, MCP get_auction_details.

```typescript
// Addition to engine/src/lib/chain-client.ts
const nftEscrowAbi = [
  {
    name: 'deposits',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'auctionId', type: 'bytes32' }],
    outputs: [
      { name: 'nftContract', type: 'address' },
      { name: 'tokenId', type: 'uint256' },
      { name: 'depositor', type: 'address' },
      { name: 'state', type: 'uint8' },      // NftState enum
      { name: 'depositTimestamp', type: 'uint256' },
    ],
  },
] as const

// NftState enum values match contract
// 0 = NONE, 1 = DEPOSITED, 2 = CLAIMED, 3 = RETURNED
```

### Pattern 3: D1 Schema Extension

**What:** New nullable columns on `auctions` table for cached resolved metadata.

```sql
-- migrations/0003_add_resolved_nft.sql
ALTER TABLE auctions ADD COLUMN nft_name TEXT;
ALTER TABLE auctions ADD COLUMN nft_description TEXT;
ALTER TABLE auctions ADD COLUMN nft_image_url TEXT;
ALTER TABLE auctions ADD COLUMN nft_token_uri TEXT;
```

**Priority logic for image display:**
1. `item_image_cid` (custom upload via POST /auctions/:id/image) -- highest priority
2. `nft_image_url` (resolved from tokenURI) -- fallback
3. null -- no image

### Pattern 4: OpenSea Marketplace URL Construction

**What:** Chain-aware URL builder for OpenSea links.
**Where:** `frontend/src/lib/format.ts` (new function alongside existing `nftExplorerUrl`).

```typescript
export function nftMarketplaceUrl(
  chainId: number | null | undefined,
  contract: string | null | undefined,
  tokenId: string | null | undefined,
): string | null {
  if (!contract || !tokenId) return null

  // Testnets use testnets.opensea.io
  const testnetChains: Record<number, string> = {
    84532: 'base-sepolia',    // Base Sepolia
    11155111: 'sepolia',       // Ethereum Sepolia
  }

  // Mainnets use opensea.io
  const mainnetChains: Record<number, string> = {
    8453: 'base',              // Base
    1: 'ethereum',             // Ethereum
  }

  const cid = chainId ?? 84532
  const testnetSlug = testnetChains[cid]
  if (testnetSlug) {
    return `https://testnets.opensea.io/assets/${testnetSlug}/${contract}/${tokenId}`
  }

  const mainnetSlug = mainnetChains[cid]
  if (mainnetSlug) {
    return `https://opensea.io/assets/${mainnetSlug}/${contract}/${tokenId}`
  }

  return null
}
```

### Anti-Patterns to Avoid
- **Resolving tokenURI on every request:** Cache at creation time in D1. The user decision locks this -- no re-resolution.
- **Adding new API routes for NFT metadata:** Enrich existing routes. The user decision locks this.
- **Client-side tokenURI resolution:** The frontend should never call tokenURI directly. Engine resolves and caches.
- **Blocking auction creation on tokenURI failure:** Resolution must be best-effort. If tokenURI fails, auction still creates -- just without resolved metadata.
- **Adding NftEscrow ABI without timeout handling:** On-chain reads can fail; wrap in try/catch like existing identity.ts pattern.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| IPFS URI resolution | Custom IPFS node/gateway integration | Simple string replacement `ipfs:// -> https://gateway.pinata.cloud/ipfs/` | Project already uses Pinata gateway; consistent with `frontend/src/lib/ipfs.ts` |
| Base64 data URI parsing | Custom decoder | Built-in `atob()` + `JSON.parse()` | Standard in CF Workers runtime |
| On-chain contract reads | Raw RPC calls | viem `publicClient.readContract()` | Already established pattern in `chain-client.ts` |
| OpenSea URL construction | API integration | Static URL pattern `testnets.opensea.io/assets/{chain}/{contract}/{tokenId}` | No API key needed for link generation |
| NFT escrow status check | Custom event indexer | Direct `NftEscrow.deposits()` view call | Single read, no indexing needed |

**Key insight:** Every piece of infrastructure needed already exists in the project. tokenURI resolution is just `publicClient.readContract()` + `fetch()` + `JSON.parse()`. NftEscrow read is one more contract in `chain-client.ts`.

## Common Pitfalls

### Pitfall 1: tokenURI Returns Data URI, Not URL
**What goes wrong:** Assuming tokenURI always returns an HTTP/IPFS URL, then calling `fetch()` on a `data:application/json;base64,...` string.
**Why it happens:** Many on-chain NFTs (especially Base chain) encode metadata directly in the contract as base64 data URIs.
**How to avoid:** Check URI prefix before fetching. Handle three cases: `data:application/json;base64,`, `data:application/json,`, and `http(s)://` / `ipfs://`.
**Warning signs:** fetch() errors with "Invalid URL" in logs.

### Pitfall 2: IPFS Gateway Timeouts in Cloudflare Workers
**What goes wrong:** tokenURI points to IPFS CID, gateway is slow or unresponsive, worker times out.
**Why it happens:** IPFS gateway fetch can take 5-30+ seconds for cold content. CF Workers have execution time limits.
**How to avoid:** Use `AbortSignal.timeout(10_000)` on fetch. Return null metadata on timeout (best-effort). Use Pinata gateway (project already uses it) which has better availability than public gateways.
**Warning signs:** Auction creation becomes slow (~10s+ response times) when NFT is on cold IPFS content.

### Pitfall 3: Custom Image Overwrite by tokenURI Resolution
**What goes wrong:** User uploads a custom image via POST /auctions/:id/image, then tokenURI resolution overwrites it.
**Why it happens:** Not checking whether custom image already exists before writing resolved image URL.
**How to avoid:** User decision is clear: custom image takes priority. In display logic: `item_image_cid ? resolveImageUrl(item_image_cid) : nft_image_url`. In the resolution step, only resolve if no `item_image_cid` exists yet -- or always resolve but store in separate column (recommended approach).
**Warning signs:** Custom-uploaded images disappearing.

### Pitfall 4: NftEscrow Read on Wrong Chain
**What goes wrong:** Auction has nftChainId for Ethereum mainnet, but engine reads NftEscrow on Base Sepolia.
**Why it happens:** NftEscrow is deployed only on Base Sepolia. The `deposits` mapping is only populated if the NFT was deposited on that specific contract.
**How to avoid:** NftEscrow reads should always use the engine's Base Sepolia publicClient (the only deployed instance). The escrow deposit status is about whether the NFT was deposited into *our* escrow contract, not about the NFT's origin chain.
**Warning signs:** Always getting NONE state for auctions that have deposited NFTs.

### Pitfall 5: Missing D1 Migration on Deploy
**What goes wrong:** New columns (nft_name, nft_description, nft_image_url, nft_token_uri) don't exist in production D1.
**Why it happens:** Forgetting to run migration via wrangler d1 before deploying worker.
**How to avoid:** Migration file `0003_add_resolved_nft.sql` must be applied. All columns are nullable (backward compatible). Check by running `wrangler d1 execute --command "PRAGMA table_info(auctions)"` before deploy.
**Warning signs:** D1 SQL errors in worker logs after deploy.

### Pitfall 6: Blocking Auction Creation on Resolution Failure
**What goes wrong:** If tokenURI() reverts or the metadata fetch fails, the whole POST /auctions returns 500.
**Why it happens:** Not wrapping resolution in try/catch, or awaiting resolution in the critical path without fallback.
**How to avoid:** Resolution is best-effort. Wrap the entire resolution flow in try/catch. If it fails, store nulls -- auction creation succeeds regardless. Consider doing resolution async (after D1 insert, before response) so the auction ID is always persisted.
**Warning signs:** Auction creation fails when NFT contract has non-standard tokenURI.

## Code Examples

### Example 1: Enriched POST /auctions Response Flow

```typescript
// In engine/src/index.ts POST /auctions handler, after D1 insert succeeds:

// Best-effort NFT metadata resolution
let resolvedNft: ResolvedNftMetadata = {
  name: null, description: null, imageUrl: null, rawTokenUri: null,
}
if (nftContract && nftTokenId) {
  try {
    resolvedNft = await resolveNftMetadata(nftContract, nftTokenId, nftChainId ?? undefined)
    if (resolvedNft.name || resolvedNft.imageUrl) {
      await c.env.AUCTION_DB
        .prepare(
          'UPDATE auctions SET nft_name = ?, nft_description = ?, nft_image_url = ?, nft_token_uri = ? WHERE auction_id = ?',
        )
        .bind(
          resolvedNft.name,
          resolvedNft.description,
          resolvedNft.imageUrl,
          resolvedNft.rawTokenUri,
          auctionId,
        )
        .run()
    }
  } catch {
    // Best-effort — auction already created, metadata is bonus
  }
}
```

### Example 2: MCP discover_auctions with NFT Fields

```typescript
// In mcp-server/src/tools/discover.ts — enriched result mapping:
const result = auctions.map((a) => ({
  auctionId: a.auction_id,
  title: a.title ?? '(untitled)',
  status: STATUS_LABELS[a.status] ?? `UNKNOWN(${a.status})`,
  // ... existing fields ...
  hasNft: !!(a.nft_contract && a.nft_token_id),
  nftName: a.nft_name ?? null,               // NEW
  nftImageUrl: a.item_image_cid              // Priority: custom > resolved
    ? `https://gateway.pinata.cloud/ipfs/${a.item_image_cid}`
    : a.nft_image_url ?? null,               // NEW fallback
}))
```

### Example 3: NftEscrow Deposit Status Read

```typescript
// engine/src/lib/nft-escrow.ts
import { publicClient } from './chain-client'
import { ADDRESSES } from './addresses'

const NFT_STATE_LABELS = ['NONE', 'DEPOSITED', 'CLAIMED', 'RETURNED'] as const

export async function getNftEscrowStatus(
  auctionId: string,
): Promise<{ state: string; depositor: string | null }> {
  try {
    const result = await publicClient.readContract({
      address: ADDRESSES.nftEscrow,
      abi: nftEscrowAbi,
      functionName: 'deposits',
      args: [auctionId as `0x${string}`],
    })
    // result is a tuple: [nftContract, tokenId, depositor, state, depositTimestamp]
    const stateNum = Number(result[3])
    return {
      state: NFT_STATE_LABELS[stateNum] ?? 'UNKNOWN',
      depositor: stateNum > 0 ? result[2] : null,
    }
  } catch {
    return { state: 'UNKNOWN', depositor: null }
  }
}
```

### Example 4: Frontend NFT Escrow Badge

```tsx
// In frontend/src/app/auctions/[id]/page.tsx, inside the item.details PixelPanel:
{detail.nftEscrowState === 'DEPOSITED' && (
  <Badge variant="success" className="mt-2">NFT DEPOSITED</Badge>
)}
```

## State of the Art

| Old Approach (current) | New Approach (this phase) | Impact |
|------------------------|---------------------------|--------|
| `item_image_cid` only (manual upload) | tokenURI auto-resolution + manual fallback | NFT auctions show metadata without manual upload |
| `hasNft: boolean` in MCP discover | `hasNft` + `nftName` + `nftImageUrl` | Agents can evaluate NFT value before joining |
| No NftEscrow status in engine | Real-time `deposits()` read | Trust signal for agents and spectators |
| Explorer link only | Explorer + OpenSea marketplace link | Better hackathon demo, judges can view NFTs directly |
| No NFT filtering | hasNft filter in MCP + frontend toggle | Agents/users can find NFT auctions specifically |

**Not deprecated/outdated:**
- The existing `item_image_cid` / custom upload flow remains untouched. It becomes the "priority" source.
- All existing API shapes are extended, not replaced. Backward compatible.

## Open Questions

1. **tokenURI resolution timing: synchronous or fire-and-forget?**
   - What we know: Resolution can take 1-10+ seconds (IPFS gateway fetch). Auction creation currently takes ~200ms.
   - What's unclear: Whether to block the response or update D1 asynchronously after responding.
   - Recommendation: **Synchronous with 10s timeout**. Auction creation is admin-only (not latency-sensitive). If timeout, store nulls -- metadata missing is acceptable. This avoids complexity of async workers / waitUntil().

2. **IPFS gateway choice for tokenURI resolution**
   - What we know: Project uses Pinata gateway (`gateway.pinata.cloud`). Cloudflare also offers `cloudflare-ipfs.com`.
   - What's unclear: Whether Pinata gateway works for arbitrary IPFS content (not just content we pinned).
   - Recommendation: **Use Pinata gateway** (`gateway.pinata.cloud/ipfs/`) as primary. It serves any IPFS CID, not just pinned content. Consistent with existing `frontend/src/lib/ipfs.ts` pattern. Add `cloudflare-ipfs.com` as comment-only fallback option if needed later.

3. **NftEscrow read: per-request or cached?**
   - What we know: `deposits()` is a simple view function returning a struct. On-chain reads are ~100-300ms.
   - What's unclear: Whether to cache in D1 or read fresh on every detail request.
   - Recommendation: **Read fresh** on GET /auctions/:id (not list). The state can change (NONE -> DEPOSITED -> CLAIMED) and caching adds staleness risk. For the list endpoint, skip escrow status (too many RPC calls). Only include in detail view.

## Sources

### Primary (HIGH confidence)
- **Codebase analysis** - Direct reading of engine/src/index.ts, engine/src/lib/chain-client.ts, engine/src/lib/identity.ts, contracts/src/NftEscrow.sol, mcp-server/src/tools/discover.ts, mcp-server/src/tools/details.ts, frontend pages/hooks
- **NftEscrow.sol contract** - NftState enum (NONE=0, DEPOSITED=1, CLAIMED=2, RETURNED=3), deposits mapping returns (nftContract, tokenId, depositor, state, depositTimestamp)
- **D1 schema** - Current columns: item_image_cid, nft_contract, nft_token_id, nft_chain_id (all nullable)
- **[viem readContract docs](https://viem.sh/docs/contract/readContract.html)** - publicClient.readContract() pattern confirmed
- **[ERC-721 Standard (EIP-721)](https://eips.ethereum.org/EIPS/eip-721)** - tokenURI(uint256) -> string, metadata JSON schema

### Secondary (MEDIUM confidence)
- **[OpenSea Metadata Standards](https://docs.opensea.io/docs/metadata-standards)** - ERC-721 metadata JSON schema: name, description, image fields; data URI and IPFS patterns
- **[OpenSea testnet NFT URLs](https://testnets.opensea.io/assets/base-sepolia/0x5b664d8d0926bc540bd6401ad7738459a824036c/29)** - Confirmed URL pattern: `testnets.opensea.io/assets/base-sepolia/{contract}/{tokenId}`
- **[Cloudflare IPFS Gateway docs](https://developers.cloudflare.com/web3/how-to/use-ipfs-gateway/)** - CF Workers can fetch from IPFS gateways via standard fetch()

### Tertiary (LOW confidence)
- OpenSea mainnet URL pattern for Base chain assumed to be `opensea.io/assets/base/{contract}/{tokenId}` -- not verified with a live example but consistent with documented pattern for ethereum chain

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - No new dependencies; all patterns exist in codebase
- Architecture: HIGH - Direct extension of existing engine/MCP/frontend patterns
- tokenURI resolution: HIGH - ERC-721 standard is well-defined; edge cases documented
- NftEscrow reads: HIGH - Contract is deployed, ABI is clear from Solidity source
- OpenSea URL patterns: MEDIUM - Testnet pattern verified; mainnet pattern inferred
- IPFS gateway reliability: MEDIUM - Pinata gateway generally reliable but timeouts possible

**Research date:** 2026-03-04
**Valid until:** 2026-04-04 (stable domain, no fast-moving dependencies)
