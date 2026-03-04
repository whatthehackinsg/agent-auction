# Phase 1: Fix NFT Support Gaps - Context

**Gathered:** 2026-03-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Close gaps in NFT metadata visibility across engine, MCP tools, and frontend. Agents and spectators should get rich NFT context (image, name, description, escrow status) without requiring manual image uploads. No new on-chain contracts — resolve existing ERC-721 tokenURI data and surface it through all layers.

</domain>

<decisions>
## Implementation Decisions

### NFT Metadata Resolution
- Resolve ERC-721 tokenURI() to get native NFT metadata as fallback when no custom image is uploaded
- Resolution happens engine-side at auction creation time, cached in D1 — all consumers (MCP, frontend, WebSocket) benefit automatically
- Extract image + name + description from tokenURI JSON (the essential trio)
- Custom-uploaded image takes priority over tokenURI-resolved image; tokenURI is fallback only

### Agent NFT Awareness (MCP)
- Update MCP tool descriptions to explicitly mention NFT fields in schemas
- Enrich existing tools (get_auction_details) with resolved NFT metadata — no new dedicated tool
- Add NFT escrow deposit status to get_auction_details response
- discover_auctions returns richer NFT summary: nftName + nftImageUrl alongside hasNft boolean

### Frontend NFT Display
- Auction detail page: image + name + collection link — clean but informative
- Auction list page: show resolved NFT name below thumbnail in cards
- Add OpenSea marketplace link alongside explorer link for supported chains
- Show NFT escrow deposit badge ("NFT Deposited") on detail page when NftEscrow confirms custody

### NFT Filtering
- Both MCP discover_auctions and frontend get NFT filtering
- MCP: hasNft filter parameter on discover_auctions
- Frontend: NFT toggle/tab on auctions list page

### Claude's Discretion
- tokenURI parsing edge cases (data URIs, non-standard metadata, IPFS resolution strategy)
- Exact UI styling/placement of NFT metadata elements
- Caching strategy and TTL for resolved tokenURI data
- Error handling when tokenURI is unreachable or returns invalid data
- OpenSea URL construction per chain

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `engine/src/lib/ipfs.ts`: Pinata pinning logic — can extend with IPFS gateway fetch for tokenURI resolution
- `frontend/src/lib/ipfs.ts`: `resolveImageUrl()` — already resolves CID to Pinata gateway URL
- `frontend/src/lib/format.ts`: `nftExplorerUrl()` — chain-specific explorer URLs, can extend with marketplace URLs
- `mcp-server/src/tools/discover.ts`: Already returns `hasNft` boolean + `itemImageUrl`
- `mcp-server/src/tools/details.ts`: Already returns full `item` object with nftContract/nftTokenId/nftChainId

### Established Patterns
- Engine stores NFT fields in D1 `auctions` table: `item_image_cid`, `nft_contract`, `nft_token_id`, `nft_chain_id`
- `ItemMetadata` interface in `engine/src/types/engine.ts` (lines 89-97)
- Frontend uses `AuctionSummary` interface from `hooks/useAuctions.ts` with all NFT fields
- PixelPanel component with accent colors for themed sections (gold for item details)

### Integration Points
- Engine POST /auctions: Where tokenURI resolution should trigger (after NFT fields are stored)
- Engine GET /auctions/:id/manifest: Dedicated metadata endpoint — should include resolved NFT data
- NftEscrow.deposits[auctionId]: On-chain struct with deposit state (NONE/DEPOSITED/CLAIMED/RETURNED)
- Frontend detail page `PixelPanel accent="gold"`: Existing NFT display section to enrich

</code_context>

<specifics>
## Specific Ideas

- Agents should be able to see image URLs and NFT metadata without needing a separate lookup
- Frontend NFT display should be rich enough for hackathon judges to understand what's being auctioned
- Escrow deposit verification adds trust signal for both agents and spectators

</specifics>

<deferred>
## Deferred Ideas

- On-chain NFT metadata traits/rarity display — P1 enhancement
- Blur marketplace integration — OpenSea sufficient for now
- Multi-image gallery/carousel per auction — single image sufficient
- NFT collection aggregation view — future feature
- Real-time tokenURI re-resolution (metadata updates) — cache at creation is sufficient

</deferred>

---

*Phase: 01-fix-nft-support-gaps*
*Context gathered: 2026-03-04*
