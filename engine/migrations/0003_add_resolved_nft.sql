-- Add resolved NFT metadata columns (populated from tokenURI at auction creation)
ALTER TABLE auctions ADD COLUMN nft_name TEXT;
ALTER TABLE auctions ADD COLUMN nft_description TEXT;
ALTER TABLE auctions ADD COLUMN nft_image_url TEXT;
ALTER TABLE auctions ADD COLUMN nft_token_uri TEXT;
