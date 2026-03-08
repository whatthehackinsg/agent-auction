-- D1 (SQLite) schema for auction engine
-- Status values: NONE=0, OPEN=1, CLOSED=2, SETTLED=3, CANCELLED=4

CREATE TABLE IF NOT EXISTS auctions (
  auction_id TEXT PRIMARY KEY,
  manifest_hash TEXT NOT NULL,
  status INTEGER NOT NULL DEFAULT 1,
  reserve_price TEXT NOT NULL,
  deposit_amount TEXT NOT NULL DEFAULT '0',
  deadline INTEGER NOT NULL,
  title TEXT,
  description TEXT,
  auction_type TEXT NOT NULL DEFAULT 'english',
  max_bid TEXT,
  snipe_window_sec INTEGER NOT NULL DEFAULT 60,
  extension_sec INTEGER NOT NULL DEFAULT 30,
  max_extensions INTEGER NOT NULL DEFAULT 5,
  room_config_json TEXT NOT NULL DEFAULT '{}',
  x402_policy_json TEXT,
  replay_cid TEXT,
  item_image_cid TEXT,
  nft_contract TEXT,
  nft_token_id TEXT,
  nft_chain_id INTEGER,
  nft_name TEXT,
  nft_description TEXT,
  nft_image_url TEXT,
  nft_token_uri TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  auction_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  prev_hash TEXT NOT NULL,
  event_hash TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  action_type TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  wallet TEXT NOT NULL,
  amount TEXT NOT NULL,
  zk_nullifier TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(auction_id, seq)
);

CREATE INDEX IF NOT EXISTS idx_events_auction_seq ON events(auction_id, seq);

CREATE TABLE IF NOT EXISTS bond_observations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  auction_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  depositor TEXT NOT NULL,
  amount TEXT NOT NULL,
  status TEXT NOT NULL,
  requested_at INTEGER NOT NULL,
  confirmed_at INTEGER,
  observed_tx_hash TEXT,
  observed_log_index INTEGER,
  UNIQUE(auction_id, agent_id)
);

CREATE INDEX IF NOT EXISTS idx_bond_observations_status ON bond_observations(status);

CREATE TABLE IF NOT EXISTS x402_receipts (
  receipt_hash TEXT PRIMARY KEY,
  used_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS x402_entitlements (
  payer_wallet TEXT NOT NULL,
  resource_scope TEXT NOT NULL,
  granted_at INTEGER NOT NULL,
  receipt_hash TEXT,
  PRIMARY KEY (payer_wallet, resource_scope)
);

CREATE INDEX IF NOT EXISTS idx_x402_entitlements_scope
  ON x402_entitlements(resource_scope);
