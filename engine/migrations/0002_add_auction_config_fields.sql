-- Add auction configuration columns (snipe protection, room config, x402 policy)
-- These columns were added to the code but missing from the D1 schema.

ALTER TABLE auctions ADD COLUMN snipe_window_sec INTEGER DEFAULT 60;
ALTER TABLE auctions ADD COLUMN extension_sec INTEGER DEFAULT 30;
ALTER TABLE auctions ADD COLUMN max_extensions INTEGER DEFAULT 5;
ALTER TABLE auctions ADD COLUMN room_config_json TEXT;
ALTER TABLE auctions ADD COLUMN x402_policy_json TEXT;

-- NFT item metadata (may already exist from 0001; safe to skip if so)
-- ALTER TABLE auctions ADD COLUMN item_image_cid TEXT;
-- ALTER TABLE auctions ADD COLUMN nft_contract TEXT;
-- ALTER TABLE auctions ADD COLUMN nft_token_id TEXT;
-- ALTER TABLE auctions ADD COLUMN nft_chain_id INTEGER;
