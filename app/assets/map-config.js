/**
 * Map Configuration Module
 * 
 * Functions for managing map display configurations in IndexedDB.
 * Stores settings like which entity types to show on the map.
 */

import db from './location-sync-db.js';

const DEFAULT_MAP_ID = 'default'; // Default map instance

/**
 * Get map configuration for a specific map
 * @param {string} mapId - Map ID (default: 'default')
 * @returns {Promise<Object>} Map configuration object
 */
export async function getMapConfig(mapId = DEFAULT_MAP_ID) {
    try {
        const stored = await db.map_mode.get(mapId);
        
        // Return null if not found (don't create default)
        if (!stored) {
            return null;
        }
        
        // Handle both old format (entity_types_to_show directly) and new format (in config object)
        if (stored.config && stored.config.entity_types_to_show) {
            return {
                map_id: mapId,
                entity_types_to_show: stored.config.entity_types_to_show
            };
        } else if (stored.entity_types_to_show) {
            // Legacy format - migrate to new format
            const migrated = {
                map_id: mapId,
                entity_types_to_show: stored.entity_types_to_show
            };
            await setMapConfig(mapId, migrated);
            return migrated;
        }
        
        // Fallback
        return {
            map_id: mapId,
            entity_types_to_show: ['responder', 'civilian', 'incident', 'resource', 'hazard']
        };
        
    } catch (error) {
        console.error(`Error getting map config for ${mapId}:`, error);
        throw error;
    }
}

/**
 * Set map configuration
 * @param {string} mapId - Map ID (default: 'default')
 * @param {Object} config - Configuration object
 * @param {string[]} config.entity_types_to_show - Array of entity types to show
 * @returns {Promise<void>}
 */
export async function setMapConfig(mapId = DEFAULT_MAP_ID, config) {
    try {
        await db.map_mode.put({
            map_id: mapId,
            config: {
                entity_types_to_show: config.entity_types_to_show || []
            }
        });
        console.log('🔍 DEBUG - Map config saved:', mapId, config);
    } catch (error) {
        console.error(`Error setting map config for ${mapId}:`, error);
        throw error;
    }
}

/**
 * Update entity types to show for a map
 * @param {string} mapId - Map ID (default: 'default')
 * @param {string[]} entityTypes - Array of entity types to show
 * @returns {Promise<void>}
 */
export async function setEntityTypesToShow(mapId = DEFAULT_MAP_ID, entityTypes) {
    await setMapConfig(mapId, {
        entity_types_to_show: entityTypes
    });
}

