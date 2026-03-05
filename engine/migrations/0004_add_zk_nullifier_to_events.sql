-- Add zk_nullifier column to events table for participant privacy masking.
-- Stores the ZK-proven Poseidon nullifier alongside each event so the
-- /events endpoint can replace agent_id with zk_nullifier for participant requests.
ALTER TABLE events ADD COLUMN zk_nullifier TEXT;
