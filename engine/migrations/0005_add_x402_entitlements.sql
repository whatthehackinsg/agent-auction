CREATE TABLE IF NOT EXISTS x402_entitlements (
  payer_wallet TEXT NOT NULL,
  resource_scope TEXT NOT NULL,
  granted_at INTEGER NOT NULL,
  receipt_hash TEXT,
  PRIMARY KEY (payer_wallet, resource_scope)
);

CREATE INDEX IF NOT EXISTS idx_x402_entitlements_scope
  ON x402_entitlements(resource_scope);
