/**
 * Location Sync Module
 * 
 * Handles syncing location data from mesh nodes to local IndexedDB.
 * Uses the generated API client for backend communication.
 */

import { SyncService } from './api-client/services/SyncService.js';
import { OpenAPI } from './api-client/core/OpenAPI.js';
import db from './location-sync-db.js';

// Configure OpenAPI base URL (relative to current origin)
OpenAPI.BASE = '';

/**
 * Fetch list of all node IDs (this node + peers)
 * @returns {Promise<string[]>} Array of node IDs
 */
export async function fetchNodeList() {
    try {
        const response = await SyncService.getApiSyncNodeList();
        return response.node_ids || [];
    } catch (error) {
        console.error('Error fetching node list:', error);
        throw error;
    }
}

/**
 * Fetch location data from a specific node since a timestamp
 * @param {string} nodeId - Node ID (MAC address)
 * @param {number} sinceTimestamp - UTC milliseconds timestamp
 * @returns {Promise<Array>} Array of location reports
 */
export async function fetchNodeData(nodeId, sinceTimestamp) {
    try {
        const response = await SyncService.getApiSyncNodeData(nodeId, sinceTimestamp);
        return response.data || [];
    } catch (error) {
        console.error(`Error fetching data from node ${nodeId}:`, error);
        throw error;
    }
}

/**
 * Sync locations from a node and write to IndexedDB
 * @param {string} nodeId - Node ID to sync from
 * @returns {Promise<{success: boolean, count: number, error?: string}>}
 */
export async function syncWithNode(nodeId) {
    try {
        // Get last sync time from Dexie
        const nodeSync = await db.node_sync.get(nodeId);
        const now = Date.now();
        const oneMinuteAgo = now - 60000;
        
        // Calculate time range
        let fromTimestamp;
        if (nodeSync && (now - nodeSync.last_sync_time) < 60000) {
            // Recent sync: get updates since last sync
            fromTimestamp = nodeSync.last_sync_time;
        } else {
            // Stale or new: get last 1 minute only
            fromTimestamp = oneMinuteAgo;
        }
        
        // Fetch data from node
        const locations = await fetchNodeData(nodeId, fromTimestamp);
        
        if (locations.length === 0) {
            // Update sync time even if no new data
            await db.node_sync.put({
                node_id: nodeId,
                last_sync_time: now
            });
            return { success: true, count: 0 };
        }
        
        // Write to IndexedDB in transaction
        await db.transaction('rw', db.locations, db.latest_locations, db.node_sync, async () => {
            // Write all locations
            await db.locations.bulkPut(locations);
            
            // Update latest_locations cache
            for (const loc of locations) {
                const existing = await db.latest_locations.get(loc.entity_id);
                if (!existing || new Date(loc.created_at) > new Date(existing.created_at)) {
                    await db.latest_locations.put({
                        ...loc,
                        updated_at: now
                    });
                }
            }
            
            // Update node sync time
            await db.node_sync.put({
                node_id: nodeId,
                last_sync_time: now
            });
        });
        
        return { success: true, count: locations.length };
        
    } catch (error) {
        console.error(`Error syncing with node ${nodeId}:`, error);
        return { 
            success: false, 
            count: 0, 
            error: error.message || String(error) 
        };
    }
}

/**
 * Sync with all nodes
 * @returns {Promise<{synced: number, total: number, errors: Array}>}
 */
export async function syncAllNodes() {
    try {
        // Get list of all nodes
        const nodeIds = await fetchNodeList();
        
        if (nodeIds.length === 0) {
            return { synced: 0, total: 0, errors: [] };
        }
        
        // Sync with each node
        const results = await Promise.allSettled(
            nodeIds.map(nodeId => syncWithNode(nodeId))
        );
        
        // Count successes and errors
        let synced = 0;
        let totalCount = 0;
        const errors = [];
        
        results.forEach((result, index) => {
            const nodeId = nodeIds[index];
            if (result.status === 'fulfilled') {
                const data = result.value;
                if (data.success) {
                    synced++;
                    totalCount += data.count;
                } else {
                    errors.push({ nodeId, error: data.error || 'Unknown error' });
                }
            } else {
                errors.push({ nodeId, error: result.reason?.message || String(result.reason) });
            }
        });
        
        return {
            synced,
            total: nodeIds.length,
            totalCount,
            errors
        };
        
    } catch (error) {
        console.error('Error syncing all nodes:', error);
        throw error;
    }
}

/**
 * Update node sync time (manual override)
 * @param {string} nodeId - Node ID
 * @param {number} lastSyncTime - UTC milliseconds timestamp
 */
export async function updateNodeSync(nodeId, lastSyncTime) {
    await db.node_sync.put({
        node_id: nodeId,
        last_sync_time: lastSyncTime
    });
}

/**
 * Get sync status for all nodes
 * @returns {Promise<Array>} Array of sync status objects
 */
export async function getSyncStatus() {
    try {
        const nodeIds = await fetchNodeList();
        const syncStatuses = await db.node_sync.bulkGet(nodeIds);
        
        return nodeIds.map(nodeId => {
            const sync = syncStatuses.find(s => s && s.node_id === nodeId);
            return {
                node_id: nodeId,
                last_sync_time: sync ? sync.last_sync_time : null,
                sync_age_ms: sync ? Date.now() - sync.last_sync_time : null
            };
        });
    } catch (error) {
        console.error('Error getting sync status:', error);
        throw error;
    }
}

