-- Location reports table migration
-- Creates location_reports table and indexes for location tracking

CREATE TABLE IF NOT EXISTS location_reports (
    id TEXT PRIMARY KEY,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    node_id TEXT NOT NULL,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    altitude REAL,
    accuracy REAL,
    created_at INTEGER NOT NULL,
    metadata TEXT
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_entity 
ON location_reports(entity_id);

CREATE INDEX IF NOT EXISTS idx_entity_type 
ON location_reports(entity_type);

CREATE INDEX IF NOT EXISTS idx_created_at 
ON location_reports(created_at);

CREATE INDEX IF NOT EXISTS idx_node 
ON location_reports(node_id);

