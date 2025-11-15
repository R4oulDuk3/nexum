/**
 * Location Reader Module
 * 
 * Functions for reading location data from IndexedDB.
 * Provides queries for latest locations, trajectories, and filtering.
 */

import db from './location-sync-db.js';
import { BERLIN_BOUNDS } from './location-utils.js';

/**
 * Check if a location is within Berlin region bounds
 * @param {Object} location - Location object with position: {lat, lon}
 * @returns {boolean} True if location is within Berlin bounds
 */
function isInBerlinRegion(location) {
    if (!location || !location.position) {
        return false;
    }
    
    const lat = location.position.lat;
    const lon = location.position.lon;
    
    return (
        lat >= BERLIN_BOUNDS.minLat &&
        lat <= BERLIN_BOUNDS.maxLat &&
        lon >= BERLIN_BOUNDS.minLon &&
        lon <= BERLIN_BOUNDS.maxLon
    );
}

/**
 * Get latest location per entity, filtered by entity types
 * @param {string[]} entityTypes - Array of entity types to include
 * @returns {Promise<Array>} Array of latest location reports
 */
export async function getLatestLocations(entityTypes) {
    try {
        if (!entityTypes || entityTypes.length === 0) {
            // If no filter, get all latest locations
            return await db.latest_locations.toArray();
        }
        
        // Filter by entity types using index
        const results = [];
        for (const entityType of entityTypes) {
            const locations = await db.latest_locations
                .where('entity_type')
                .equals(entityType)
                .toArray();
            results.push(...locations);
        }
        
        return results;
        
    } catch (error) {
        console.error('Error getting latest locations:', error);
        throw error;
    }
}

/**
 * Get location trajectory (history) for a specific entity
 * @param {string} entityId - Entity ID (UUID)
 * @param {number} maxPoints - Maximum number of points to return (default: 10)
 * @returns {Promise<Array>} Array of location reports (oldest to newest)
 */
export async function getEntityTrajectory(entityId, maxPoints = 10) {
    try {
        // Query all locations for this entity
        const allLocations = await db.locations
            .where('entity_id')
            .equals(entityId)
            .toArray();
        
        // Sort by created_at (newest first), then take maxPoints
        const sorted = allLocations
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
            .slice(0, maxPoints);
        
        // Reverse to get oldest to newest (for line drawing)
        return sorted.reverse();
        
    } catch (error) {
        console.error(`Error getting trajectory for entity ${entityId}:`, error);
        throw error;
    }
}

/**
 * Get all locations from IndexedDB
 * @returns {Promise<Array>} Array of all location reports
 */
export async function getAllLocations() {
    try {
        return await db.locations.toArray();
    } catch (error) {
        console.error('Error getting all locations:', error);
        throw error;
    }
}

/**
 * Get locations from a specific node
 * @param {string} nodeId - Node ID
 * @returns {Promise<Array>} Array of location reports from that node
 */
export async function getLocationsByNode(nodeId) {
    try {
        return await db.locations
            .where('node_id')
            .equals(nodeId)
            .toArray();
    } catch (error) {
        console.error(`Error getting locations for node ${nodeId}:`, error);
        throw error;
    }
}

/**
 * Get locations filtered by entity type
 * @param {string} entityType - Entity type to filter by
 * @returns {Promise<Array>} Array of location reports
 */
export async function getLocationsByEntityType(entityType) {
    try {
        return await db.locations
            .where('entity_type')
            .equals(entityType)
            .toArray();
    } catch (error) {
        console.error(`Error getting locations for entity type ${entityType}:`, error);
        throw error;
    }
}

/**
 * Get latest location for a specific entity
 * @param {string} entityId - Entity ID (UUID)
 * @returns {Promise<Object|null>} Latest location report or null
 */
export async function getLatestLocationForEntity(entityId) {
    try {
        return await db.latest_locations.get(entityId) || null;
    } catch (error) {
        console.error(`Error getting latest location for entity ${entityId}:`, error);
        throw error;
    }
}

/**
 * Get all locations grouped by entity_id
 * Returns both the grouped hashmap (for future features) and latest locations for markers
 * @param {string[]} entityTypes - Array of entity types to filter by (optional)
 * @param {number} timeFromMinutes - Time filter from minutes relative to now (default: -120)
 * @param {number} timeUntilMinutes - Time filter until minutes relative to now (default: 0)
 * @returns {Promise<{groupedByEntity: Map<string, Array>, latestLocations: Array}>}
 *   - groupedByEntity: Map of entity_id -> array of all locations for that entity
 *   - latestLocations: Array of latest location per entity (for markers)
 */
export async function getLocationsGroupedByEntity(entityTypes = null, timeFromMinutes = -120, timeUntilMinutes = 0) {
    try {
        // Get all locations from the locations table
        let allLocations;
        if (entityTypes && entityTypes.length > 0) {
            // Filter by entity types
            const results = [];
            for (const entityType of entityTypes) {
                const locations = await db.locations
                    .where('entity_type')
                    .equals(entityType)
                    .toArray();
                results.push(...locations);
            }
            allLocations = results;
        } else {
            // Get all locations
            allLocations = await db.locations.toArray();
        }
        
        // Calculate time filter boundaries
        const currentTime = Date.now();
        const fromTime = currentTime + (timeFromMinutes * 60 * 1000);
        const untilTime = currentTime + (timeUntilMinutes * 60 * 1000);
        
        // Filter locations by time window and Berlin region
        const filteredLocations = allLocations.filter(location => {
            // Check if location is in Berlin region
            if (!isInBerlinRegion(location)) {
                return false;
            }
            
            // Check if location is within time window
            const locationTime = typeof location.created_at === 'number' 
                ? location.created_at 
                : new Date(location.created_at).getTime();
            
            return locationTime >= fromTime && locationTime <= untilTime;
        });
        
        // Group by entity_id
        const groupedByEntity = new Map();
        filteredLocations.forEach(location => {
            const entityId = location.entity_id;
            if (!groupedByEntity.has(entityId)) {
                groupedByEntity.set(entityId, []);
            }
            groupedByEntity.get(entityId).push(location);
        });
        
        // Sort each group by created_at (newest first) and get latest
        const latestLocations = [];
        groupedByEntity.forEach((locations, entityId) => {
            // Sort by created_at descending (newest first)
            locations.sort((a, b) => {
                const timeA = typeof a.created_at === 'number' ? a.created_at : new Date(a.created_at).getTime();
                const timeB = typeof b.created_at === 'number' ? b.created_at : new Date(b.created_at).getTime();
                return timeB - timeA;
            });
            
            // Latest location is the first one after sorting
            if (locations.length > 0) {
                latestLocations.push(locations[0]);
            }
        });
        
        return {
            groupedByEntity,
            latestLocations
        };
        
    } catch (error) {
        console.error('Error getting locations grouped by entity:', error);
        throw error;
    }
}

/**
 * Get location statistics
 * @returns {Promise<Object>} Statistics object
 */
export async function getLocationStats() {
    try {
        const allLocations = await db.locations.toArray();
        const latestLocations = await db.latest_locations.toArray();
        
        // Count by entity type
        const byType = {};
        latestLocations.forEach(loc => {
            byType[loc.entity_type] = (byType[loc.entity_type] || 0) + 1;
        });
        
        // Count by node
        const byNode = {};
        allLocations.forEach(loc => {
            byNode[loc.node_id] = (byNode[loc.node_id] || 0) + 1;
        });
        
        return {
            total_reports: allLocations.length,
            unique_entities: latestLocations.length,
            by_entity_type: byType,
            by_node: byNode,
            nodes_count: Object.keys(byNode).length
        };
        
    } catch (error) {
        console.error('Error getting location stats:', error);
        throw error;
    }
}

// Dexie is available through the db import

