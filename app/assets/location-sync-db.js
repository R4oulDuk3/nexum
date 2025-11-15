/**
 * Location Sync Database - Dexie setup for IndexedDB
 * 
 * Manages local storage of synced location data from mesh nodes.
 * Schema:
 * - locations: All location reports (full history)
 * - latest_locations: Latest location per entity (cache for fast lookup)
 * - node_sync: Sync tracking per node
 * - map_mode: Map display configurations
 */

// Dexie is loaded as a script tag in base.html, making it available globally as window.Dexie
// Access it from the global scope
// Note: Dexie.js is a UMD module that doesn't work well with ES6 import, so we load it as a script tag
if (typeof window === 'undefined' || !window.Dexie) {
    throw new Error('Dexie not found. Please ensure dexie.js is loaded as a script tag before importing this module.');
}

const Dexie = window.Dexie;

class LocationSyncDB extends Dexie {
    locations;
    latest_locations;
    node_sync;
    map_mode;
    
    constructor() {
        super('nexum_locations');
        
        // Define schema
        this.version(1).stores({
            // All location reports (full history)
            // Composite index [entity_id+created_at] for efficient trajectory queries
            locations: 'id, entity_id, entity_type, created_at, node_id, [entity_id+created_at]',
            
            // Latest location per entity (denormalized cache for fast lookup)
            latest_locations: 'entity_id, entity_type, updated_at',
            
            // Node sync tracking
            node_sync: 'node_id',
            
            // Map display configurations
            map_mode: 'map_id'
        });
    }
}

// Create and export database instance
const db = new LocationSyncDB();

export default db;

