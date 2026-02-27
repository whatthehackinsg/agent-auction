-- Migration: add NFT item metadata columns to auctions table
-- These columns are all nullable to maintain backward compatibility.

ALTER TABLE auctions ADD COLUMN item_image_cid TEXT;
ALTER TABLE auctions ADD COLUMN nft_contract TEXT;
ALTER TABLE auctions ADD COLUMN nft_token_id TEXT;
ALTER TABLE auctions ADD COLUMN nft_chain_id INTEGER;
