/**
 * Location Reader Module
 * 
 * Functions for reading location data from IndexedDB.
 * Provides queries for latest locations, trajectories, and filtering.
 */

import db from './location-sync-db.js';

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

