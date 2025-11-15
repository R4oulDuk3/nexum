-- Peer sync log table migration
-- Creates the sync_log table to track the last sync time and IP of each peer.

CREATE TABLE IF NOT EXISTS sync_log (
    peer_node_id TEXT PRIMARY KEY NOT NULL,
    last_known_ip TEXT,
    last_sync_at INTEGER NOT NULL DEFAULT 0
);

-- Create index for last_sync_at for potential cleanup queries
CREATE INDEX IF NOT EXISTS idx_last_sync_at
ON sync_log(last_sync_at);