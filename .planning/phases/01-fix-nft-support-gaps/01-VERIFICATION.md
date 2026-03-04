---
phase: 01-fix-nft-support-gaps
verified: 2026-03-04T16:00:00Z
status: human_needed
score: 12/12 must-haves verified
human_verification:
  - test: "Create an NFT auction via POST /auctions and confirm nft_name/nft_image_url are populated in the D1 row"
    expected: "D1 row has non-null nft_name and nft_image_url populated from tokenURI (assuming the NFT contract returns valid tokenURI on Base Sepolia)"
    why_human: "Requires a live NFT contract on Base Sepolia and wrangler d1 migrations apply — cannot verify tokenURI network call programmatically"
  - test: "Check GET /auctions/:id for an NFT auction returns nftEscrowState = 'DEPOSITED' when NFT is in NftEscrow"
    expected: "nftEscrowState equals 'DEPOSITED' if the NFT was deposited via NftEscrow.deposit()"
    why_human: "Requires a live NftEscrow contract deposit on-chain — cannot simulate the state read without real on-chain data"
  - test: "Open /auctions in browser and use the NFT Only filter button — confirm it shows only auctions with nft_contract set"
    expected: "Filter toggle switches to NFT Only and the grid narrows to only NFT-backed auctions; No NFT filter shows the complement"
    why_human: "Visual UI behavior requiring browser rendering"
  - test: "Open /auctions/[id] for an NFT auction and verify item.details panel appears even without a custom item_image_cid"
    expected: "Panel is visible with tokenURI-resolved image and NFT name/description when item_image_cid is null but nft_image_url is set"
    why_human: "Requires a live auction with tokenURI-resolved metadata and no custom CID — visual browser check"
  - test: "Open /auctions/[id] for an NFT auction and verify OpenSea link points to testnets.opensea.io for Base Sepolia"
    expected: "Link href matches https://testnets.opensea.io/assets/base-sepolia/{contract}/{tokenId}"
    why_human: "Visual link rendering check — contractual correctness already verified in code"
  - test: "Open /auctions/[id] for an auction whose NFT is in NftEscrow and confirm green 'NFT DEPOSITED' badge is visible"
    expected: "Green badge with text 'NFT DEPOSITED' appears below the OpenSea link"
    why_human: "Requires live on-chain NftEscrow deposit state + browser rendering"
---

# Phase 01: Fix NFT Support Gaps — Verification Report

**Phase Goal:** Close gaps in NFT metadata visibility across engine, MCP tools, and frontend by resolving ERC-721 tokenURI at auction creation time, reading NftEscrow deposit status on-chain, and surfacing rich NFT context (image, name, description, escrow badge, marketplace links) through all layers.
**Verified:** 2026-03-04T16:00:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

All 12 must-have truths across plans 01, 02, and 03 were verified against the actual codebase.

#### Plan 01 Truths (Engine — NFT-RESOLVE, NFT-ESCROW, NFT-ENGINE-API)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | POST /auctions resolves tokenURI and stores in D1 | VERIFIED | `engine/src/index.ts` line 420: `await resolveNftMetadata(...)` called after insert; UPDATE query writes `nft_name`, `nft_description`, `nft_image_url`, `nft_token_uri` back to D1 |
| 2 | GET /auctions returns nft_name, nft_image_url per auction | VERIFIED | `SELECT *` on `auctions` table; schema.sql and 0003 migration confirm the 4 columns exist in D1 |
| 3 | GET /auctions/:id returns nftEscrowState from on-chain | VERIFIED | `engine/src/index.ts` line 520: `await getNftEscrowStatus(auctionId)` called; result returned as `{ auction, snapshot, nftEscrowState }` |
| 4 | GET /auctions/:id/manifest returns resolved NFT fields | VERIFIED | Line 655: SELECT explicitly names `nft_name, nft_description, nft_image_url, nft_token_uri`; item object includes all 4 fields |
| 5 | Custom item_image_cid takes priority over tokenURI-resolved nft_image_url | VERIFIED | Resolution stores in separate `nft_image_url` column — never overwrites `item_image_cid`; UPDATE only sets nft_* columns |
| 6 | tokenURI resolution failure does not block auction creation | VERIFIED | Entire resolution block in try/catch; auction already created in D1 before resolution attempt |

#### Plan 02 Truths (MCP — NFT-MCP-DISCOVER, NFT-MCP-DETAILS, NFT-MCP-FILTER)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 7 | discover_auctions returns nftName and nftImageUrl per auction | VERIFIED | `mcp-server/src/tools/discover.ts` line 99-102: `nftName: a.nft_name ?? null`, `nftImageUrl` with CID>URL priority |
| 8 | discover_auctions supports hasNft filter | VERIFIED | Lines 57-83: `hasNft` z.boolean() in inputSchema; filter applied with `!!(a.nft_contract && a.nft_token_id)` |
| 9 | get_auction_details includes resolved NFT metadata | VERIFIED | `mcp-server/src/tools/details.ts` lines 115-116: `nftName`, `nftDescription` in item object |
| 10 | get_auction_details includes nftEscrowState | VERIFIED | Line 69: `AuctionDetailResponse` interface has `nftEscrowState: string | null`; line 95: destructured from response; line 117: placed in item object |
| 11 | Image URL priority: custom item_image_cid > tokenURI nft_image_url | VERIFIED | discover.ts line 100-102: Pinata URL built from CID if present, else `nft_image_url`; details.ts line 109-111: identical logic |

#### Plan 03 Truths (Frontend — NFT-FRONTEND-LIST, NFT-FRONTEND-DETAIL, NFT-FRONTEND-FILTER, NFT-FRONTEND-MARKETPLACE)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 12 | Auction list page shows resolved NFT name below thumbnail | VERIFIED | `frontend/src/app/auctions/page.tsx` lines 130-133: renders `{auction.nft_name}` in gold mono text |
| 13 | Auction list page has NFT filter toggle | VERIFIED | Lines 17, 27-32, 43-58: `nftFilter` state, `filteredAuctions` computed, three-button toggle rendered |
| 14 | Detail page shows resolved image with priority logic | VERIFIED | `frontend/src/app/auctions/[id]/page.tsx` line 94: `resolveImageUrl(detail.auction.item_image_cid) ?? detail.auction.nft_image_url ?? null` |
| 15 | Detail page shows OpenSea marketplace link | VERIFIED | Lines 14, 135-149: `nftMarketplaceUrl` imported from format.ts, called with chain/contract/tokenId, rendered as anchor |
| 16 | Detail page shows NFT escrow deposit badge | VERIFIED | Lines 151-154: `detail.nftEscrowState === 'DEPOSITED'` guard, renders green "NFT DEPOSITED" badge |
| 17 | Item panel visible without custom item_image_cid | VERIFIED | Line 91: condition expanded to `item_image_cid || nft_image_url || nft_contract` |

**Score:** 12/12 must-have truths verified

---

## Required Artifacts

| Artifact | Status | Details |
|----------|--------|---------|
| `engine/migrations/0003_add_resolved_nft.sql` | VERIFIED | Exists; 4 ALTER TABLE statements for nft_name, nft_description, nft_image_url, nft_token_uri |
| `engine/schema.sql` | VERIFIED | Lines 25-28 confirmed: all 4 columns in canonical CREATE TABLE |
| `engine/src/lib/nft-metadata.ts` | VERIFIED | Exports `resolveNftMetadata` and `ResolvedNftMetadata`; handles data URI base64, plain JSON, HTTP, IPFS; 119 lines, substantive |
| `engine/src/lib/nft-escrow.ts` | VERIFIED | Exports `getNftEscrowStatus` and `NFT_STATE_LABELS`; inline ABI, try/catch fallback; 59 lines, substantive |
| `engine/src/lib/addresses.ts` | VERIFIED | `nftEscrow: '0xa05C5AF6a07D5e1abDd2c93EFdcb95D306766a94'` present |
| `engine/src/types/engine.ts` | VERIFIED | `ItemMetadata` has `nftName`, `nftDescription`, `nftImageUrl`, `nftTokenUri` fields (lines 97-100) |
| `engine/src/index.ts` | VERIFIED | Both imports present; POST /auctions wired to resolveNftMetadata; GET /auctions/:id wired to getNftEscrowStatus; manifest handler includes NFT fields |
| `mcp-server/src/tools/discover.ts` | VERIFIED | Exports `registerDiscoverTool`; `AuctionRow` has 4 new NFT columns; `hasNft` filter in schema; `nftName`/`nftImageUrl` in result mapping |
| `mcp-server/src/tools/details.ts` | VERIFIED | Exports `registerDetailsTool`; `AuctionDetailResponse` has `nftEscrowState`; item object has `nftName`, `nftDescription`, `nftEscrowState` |
| `frontend/src/lib/format.ts` | VERIFIED | `nftMarketplaceUrl()` exported; handles Base Sepolia (84532), Sepolia (11155111), Base (8453), Ethereum (1) |
| `frontend/src/hooks/useAuctions.ts` | VERIFIED | `AuctionSummary` extended with `nft_name`, `nft_description`, `nft_image_url`, `nft_token_uri` |
| `frontend/src/hooks/useAuctionDetail.ts` | VERIFIED | `AuctionDetailResponse` has `nftEscrowState?: string | null` |
| `frontend/src/app/auctions/page.tsx` | VERIFIED | NFT filter toggle, image priority logic, nft_name display — all wired |
| `frontend/src/app/auctions/[id]/page.tsx` | VERIFIED | nftMarketplaceUrl imported and used; nftEscrowState badge rendered; panel condition expanded; name/description fallbacks present |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `engine/src/index.ts` | `engine/src/lib/nft-metadata.ts` | `resolveNftMetadata()` in POST /auctions | WIRED | Import line 12; call at line 420 after D1 insert; UPDATE query stores result |
| `engine/src/index.ts` | `engine/src/lib/nft-escrow.ts` | `getNftEscrowStatus()` in GET /auctions/:id | WIRED | Import line 13; call at line 520 conditional on nft_contract presence; returned in response |
| `engine/src/lib/nft-escrow.ts` | `engine/src/lib/addresses.ts` | `ADDRESSES.nftEscrow` | WIRED | Import of ADDRESSES at top; `address: ADDRESSES.nftEscrow` in readContract call |
| `mcp-server/src/tools/discover.ts` | engine GET /auctions | `engine.get<AuctionsResponse>('/auctions')` reading `nft_name`/`nft_image_url` | WIRED | AuctionRow interface has both fields; result mapping uses `a.nft_name` and `a.nft_image_url` |
| `mcp-server/src/tools/details.ts` | engine GET /auctions/:id | `engine.get<AuctionDetailResponse>` reading `nftEscrowState` | WIRED | `AuctionDetailResponse` typed with `nftEscrowState`; destructured and placed in item object |
| `frontend/src/app/auctions/page.tsx` | `frontend/src/hooks/useAuctions.ts` | `useAuctions()` with `nft_name`/`nft_image_url` | WIRED | Hook destructured; `auction.nft_name` rendered; `auction.nft_image_url` used in image fallback |
| `frontend/src/app/auctions/[id]/page.tsx` | `frontend/src/hooks/useAuctionDetail.ts` | `useAuctionDetail()` with `nftEscrowState` | WIRED | `detail.nftEscrowState` referenced in badge condition |
| `frontend/src/app/auctions/[id]/page.tsx` | `frontend/src/lib/format.ts` | `nftMarketplaceUrl()` for OpenSea links | WIRED | Imported at line 14 alongside `nftExplorerUrl`; called with nft_chain_id/nft_contract/nft_token_id |

---

## Requirements Coverage

Requirements are defined in `.planning/ROADMAP.md` (no separate REQUIREMENTS.md file exists for this phase).

| Requirement ID | Source Plan | Status | Evidence |
|----------------|-------------|--------|----------|
| NFT-RESOLVE | 01-01-PLAN | SATISFIED | `nft-metadata.ts` resolves tokenURI at POST /auctions; data URI, HTTP, IPFS all handled |
| NFT-ESCROW | 01-01-PLAN | SATISFIED | `nft-escrow.ts` reads `NftEscrow.deposits()` on-chain; GET /auctions/:id returns state |
| NFT-ENGINE-API | 01-01-PLAN | SATISFIED | All 3 endpoints enriched: GET /auctions (SELECT *), GET /auctions/:id (+ nftEscrowState), GET /auctions/:id/manifest (explicit columns) |
| NFT-MCP-DISCOVER | 01-02-PLAN | SATISFIED | `discover.ts` AuctionRow has 4 new columns; result maps nftName/nftImageUrl with priority |
| NFT-MCP-DETAILS | 01-02-PLAN | SATISFIED | `details.ts` AuctionDetailResponse has nftEscrowState; item has nftName, nftDescription |
| NFT-MCP-FILTER | 01-02-PLAN | SATISFIED | `hasNft` z.boolean() parameter in discover_auctions inputSchema; filter logic applied |
| NFT-FRONTEND-LIST | 01-03-PLAN | SATISFIED | AuctionSummary extended; nft_name rendered in gold below card thumbnails |
| NFT-FRONTEND-DETAIL | 01-03-PLAN | SATISFIED | Detail page shows name/description fallbacks, image priority, expanded panel condition |
| NFT-FRONTEND-FILTER | 01-03-PLAN | SATISFIED | Three-state toggle (All / NFT Only / No NFT) with filteredAuctions computation |
| NFT-FRONTEND-MARKETPLACE | 01-03-PLAN | SATISFIED | nftMarketplaceUrl() in format.ts; OpenSea link rendered in detail page item panel |

**Orphaned requirements:** None — all 10 requirement IDs from ROADMAP.md are claimed and satisfied across the 3 plans.

---

## Anti-Patterns Found

None. Scanned all 9 phase-modified files. No TODO/FIXME/PLACEHOLDER comments, no stub return patterns, no empty handlers found.

---

## Git Commit Verification

All 7 commits documented in SUMMARYs confirmed present in git log:

| Commit | Plan | Description |
|--------|------|-------------|
| `47e1a3c` | 01-01 | D1 migration, NFT metadata resolver, escrow status reader |
| `dab8c7a` | 01-01 | Wire tokenURI resolution and escrow status into engine API |
| `6e759d9` | 01-02 | Enrich discover_auctions with NFT fields and hasNft filter |
| `2f906b8` | 01-02 | Enrich get_auction_details with NFT metadata and escrow status |
| `e6591bc` | 01-03 | Add nftMarketplaceUrl and extend hook interfaces for NFT metadata |
| `e1276e1` | 01-03 | Enrich auction list with NFT name, image fallback, and filter toggle |
| `635c5b6` | 01-03 | Enrich auction detail with escrow badge, OpenSea link, and resolved metadata |

---

## Human Verification Required

All automated checks passed. The following items require live environment or browser testing:

### 1. tokenURI Resolution on Real NFT Auction

**Test:** Create an auction via `POST /auctions` with a real Base Sepolia NFT contract address and tokenId (e.g., a mock NFT deployed for testing). Wait for the engine to resolve tokenURI. Query D1 to check the row.
**Expected:** `nft_name`, `nft_image_url` are non-null in D1. The POST response includes them in the `item` object.
**Why human:** Requires a live NFT contract with tokenURI on Base Sepolia, a running engine instance, and `wrangler d1 migrations apply` having been executed. Network fetch behavior cannot be verified statically.

### 2. NftEscrow On-Chain State Read

**Test:** Deposit an NFT into NftEscrow for a test auction. Call `GET /auctions/:id`. Verify `nftEscrowState` in response.
**Expected:** `nftEscrowState` equals `'DEPOSITED'` when the NFT is in custody.
**Why human:** Requires a live on-chain NftEscrow deposit transaction. The code path is wired correctly but the on-chain state depends on a real deposit.

### 3. Frontend NFT Filter Toggle (Browser)

**Test:** Open `/auctions` in a browser. Click "NFT Only" button. Verify grid narrows. Click "No NFT". Verify complement. Click "All" to restore.
**Expected:** Filter correctly partitions auctions by presence of `nft_contract`/`nft_token_id` fields.
**Why human:** Visual UI behavior in browser.

### 4. Detail Page Item Panel with tokenURI-Only NFT

**Test:** Open `/auctions/[id]` for an auction that has NFT data but no `item_image_cid`. Verify the item.details panel is visible with the resolved image.
**Expected:** PixelPanel with `accent="gold"` and `headerLabel="item.details"` is rendered; image shows the tokenURI-resolved URL.
**Why human:** Requires a live auction with resolved metadata but no custom CID — visual browser check.

### 5. OpenSea Link URL Correctness

**Test:** Open `/auctions/[id]` for a Base Sepolia NFT auction. Inspect the "View on OpenSea" anchor `href`.
**Expected:** `https://testnets.opensea.io/assets/base-sepolia/{nft_contract}/{nft_token_id}`
**Why human:** Visual link rendering in browser — code logic verified but rendered output requires browser DOM inspection.

### 6. NFT DEPOSITED Badge Display

**Test:** Open `/auctions/[id]` for an auction where the NFT is confirmed deposited in NftEscrow. Verify the green badge appears.
**Expected:** Green badge with text `NFT DEPOSITED` is visible in the item panel below the OpenSea link.
**Why human:** Requires both a live on-chain deposit and browser rendering to confirm visual appearance.

---

## Summary

Phase 01 goal is **fully implemented in code**. All 12 automated must-haves pass across all three layers:

- **Engine (Plan 01):** `nft-metadata.ts` and `nft-escrow.ts` are substantive, non-stub modules. The POST and GET handlers are correctly wired. D1 migration and schema are consistent.
- **MCP (Plan 02):** Both `discover.ts` and `details.ts` surface all NFT fields with correct image priority logic and escrow status threading.
- **Frontend (Plan 03):** All 5 files modified. `nftMarketplaceUrl` implemented correctly for 4 chains. Filter toggle, image fallback, name/description fallbacks, escrow badge — all wired and rendered.

The `human_needed` status reflects that live end-to-end validation requires: (1) wrangler D1 migration applied, (2) a real Base Sepolia NFT contract with tokenURI, (3) an NftEscrow deposit transaction, and (4) browser rendering of the frontend. The code itself is complete and correct.

---

_Verified: 2026-03-04T16:00:00Z_
_Verifier: Claude (gsd-verifier)_
