-- Peer sync log table migration
-- Creates the sync_log table to track forward and backward sync times for each node.

CREATE TABLE IF NOT EXISTS sync_log (
    node_id TEXT PRIMARY KEY NOT NULL,
    last_forward_sync_at INTEGER NOT NULL DEFAULT 0,
    last_backward_sync_at INTEGER NOT NULL DEFAULT 0
);

-- Create indexes for sync timestamps for potential cleanup queries
CREATE INDEX IF NOT EXISTS idx_last_forward_sync_at
ON sync_log(last_forward_sync_at);

CREATE INDEX IF NOT EXISTS idx_last_backward_sync_at
ON sync_log(last_backward_sync_at);