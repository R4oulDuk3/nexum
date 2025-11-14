-- Initial database schema migration
-- Creates demo table for testing

CREATE TABLE IF NOT EXISTS demo_table (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    value TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert some demo data
INSERT INTO demo_table (name, value) VALUES 
    ('Node 1', '169.254.1.5'),
    ('Node 2', '169.254.1.10'),
    ('Node 3', '169.254.1.15');

