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
 * @param {number} untilTimestamp - UTC milliseconds timestamp (optional, defaults to current time)
 * @returns {Promise<Array>} Array of location reports
 */
export async function fetchNodeData(nodeId, sinceTimestamp, untilTimestamp) {
    try {
        const until = untilTimestamp !== undefined ? untilTimestamp : Date.now();
        const response = await SyncService.getApiSyncNodeFromTo(nodeId, sinceTimestamp, until);
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
        const threeHoursAgo = now - (3 * 60 * 60 * 1000); // 3 hours in milliseconds
        
        // Calculate time range
        let fromTimestamp;
        const threeHoursInMs = 3 * 60 * 60 * 1000; // 3 hours in milliseconds
        if (nodeSync && (now - nodeSync.last_sync_time) < threeHoursInMs) {
            // Recent sync: get updates since last sync
            fromTimestamp = nodeSync.last_sync_time;
            const age = ((now - fromTimestamp) / 1000).toFixed(1);
            console.log(`[LocationSync] Node ${nodeId}: Using incremental sync (since ${age}s ago)`);
        } else {
            // Stale or new: get last 3 hours only
            fromTimestamp = threeHoursAgo;
            console.log(`[LocationSync] Node ${nodeId}: Using full sync (last 3 hours)`);
        }
        
        // Fetch data from node
        console.log(`[LocationSync] Node ${nodeId}: Fetching data since timestamp ${fromTimestamp}...`);
        const locations = await fetchNodeData(nodeId, fromTimestamp, now);
        console.log(`[LocationSync] Node ${nodeId}: Received ${locations.length} location(s)`);
        
        if (locations.length === 0) {
            // Update sync time even if no new data
            await db.node_sync.put({
                node_id: nodeId,
                last_sync_time: now
            });
            console.log(`[LocationSync] Node ${nodeId}: No new data, sync time updated`);
            return { success: true, count: 0 };
        }
        
        // Write to IndexedDB in transaction
        console.log(`[LocationSync] Node ${nodeId}: Writing ${locations.length} location(s) to IndexedDB...`);
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
        
        console.log(`[LocationSync] Node ${nodeId}: Successfully synced ${locations.length} location(s)`);
        return { success: true, count: locations.length };
        
    } catch (error) {
        console.error(`[LocationSync] Node ${nodeId}: Error during sync:`, error);
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
    const syncStartTime = Date.now();
    console.log('[LocationSync] Starting sync with all nodes...');
    
    try {
        // Get list of all nodes
        console.log('[LocationSync] Fetching node list...');
        const nodeIds = await fetchNodeList();
        console.log(`[LocationSync] Found ${nodeIds.length} node(s):`, nodeIds);
        
        if (nodeIds.length === 0) {
            console.log('[LocationSync] No nodes found, skipping sync');
            return { synced: 0, total: 0, totalCount: 0, errors: [] };
        }
        
        // Sync with each node
        console.log(`[LocationSync] Syncing with ${nodeIds.length} node(s)...`);
        const results = await Promise.allSettled(
            nodeIds.map(nodeId => {
                console.log(`[LocationSync] Starting sync with node: ${nodeId}`);
                return syncWithNode(nodeId);
            })
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
                    console.log(`[LocationSync] ✓ Node ${nodeId}: ${data.count} location(s) synced`);
                } else {
                    const errorMsg = data.error || 'Unknown error';
                    console.warn(`[LocationSync] ✗ Node ${nodeId} failed: ${errorMsg}`);
                    errors.push({ nodeId, error: errorMsg });
                }
            } else {
                const errorMsg = result.reason?.message || String(result.reason);
                console.error(`[LocationSync] ✗ Node ${nodeId} exception: ${errorMsg}`);
                errors.push({ nodeId, error: errorMsg });
            }
        });
        
        const syncDuration = Date.now() - syncStartTime;
        console.log(`[LocationSync] Sync completed in ${syncDuration}ms: ${synced}/${nodeIds.length} nodes synced, ${totalCount} total locations, ${errors.length} errors`);
        
        return {
            synced,
            total: nodeIds.length,
            totalCount,
            errors
        };
        
    } catch (error) {
        const syncDuration = Date.now() - syncStartTime;
        console.error(`[LocationSync] Sync failed after ${syncDuration}ms:`, error);
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
 * Deep sync locations from a node for a specific time range (bypasses incremental sync)
 * Forces retrieval of all data within [startTime, endTime] range
 * @param {string} nodeId - Node ID to sync from
 * @param {number} startTime - UTC milliseconds timestamp (start of range)
 * @param {number} endTime - UTC milliseconds timestamp (end of range)
 * @returns {Promise<{success: boolean, count: number, error?: string}>}
 */
export async function deepSyncWithNode(nodeId, startTime, endTime) {
    try {
        const now = Date.now();
        
        // Force fetch all data from startTime to endTime
        console.log(`[LocationSync] Deep sync Node ${nodeId}: Fetching all data from ${new Date(startTime).toISOString()} to ${new Date(endTime).toISOString()}...`);
        const locations = await fetchNodeData(nodeId, startTime, endTime);
        console.log(`[LocationSync] Deep sync Node ${nodeId}: Received ${locations.length} location(s) in time range`);
        
        if (locations.length === 0) {
            // Update sync time even if no data in range
            await db.node_sync.put({
                node_id: nodeId,
                last_sync_time: now
            });
            console.log(`[LocationSync] Deep sync Node ${nodeId}: No data in time range, sync time updated`);
            return { success: true, count: 0 };
        }
        
        // Write to IndexedDB in transaction
        console.log(`[LocationSync] Deep sync Node ${nodeId}: Writing ${locations.length} location(s) to IndexedDB...`);
        await db.transaction('rw', db.locations, db.latest_locations, db.node_sync, async () => {
            // Write all locations
            await db.locations.bulkPut(locations);
            
            // Update latest_locations cache
            for (const loc of locations) {
                const createdAt = typeof loc.created_at === 'string' ? new Date(loc.created_at).getTime() : loc.created_at;
                const existing = await db.latest_locations.get(loc.entity_id);
                const existingCreatedAt = existing ? (typeof existing.created_at === 'string' ? new Date(existing.created_at).getTime() : existing.created_at) : 0;
                
                if (!existing || createdAt > existingCreatedAt) {
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
        
        console.log(`[LocationSync] Deep sync Node ${nodeId}: Successfully synced ${locations.length} location(s)`);
        return { success: true, count: locations.length };
        
    } catch (error) {
        console.error(`[LocationSync] Deep sync Node ${nodeId}: Error during sync:`, error);
        return { 
            success: false, 
            count: 0, 
            error: error.message || String(error) 
        };
    }
}

/**
 * Deep sync with all nodes for a specific time range
 * Forces retrieval of all data within [startTime, endTime] range from all nodes
 * @param {number} startTime - UTC milliseconds timestamp (start of range)
 * @param {number} endTime - UTC milliseconds timestamp (end of range)
 * @returns {Promise<{synced: number, total: number, totalCount: number, errors: Array}>}
 */
export async function deepSyncAllNodes(startTime, endTime) {
    const syncStartTime = Date.now();
    console.log(`[LocationSync] Starting deep sync with all nodes for time range ${new Date(startTime).toISOString()} to ${new Date(endTime).toISOString()}...`);
    
    try {
        // Get list of all nodes
        console.log('[LocationSync] Deep sync: Fetching node list...');
        const nodeIds = await fetchNodeList();
        console.log(`[LocationSync] Deep sync: Found ${nodeIds.length} node(s):`, nodeIds);
        
        if (nodeIds.length === 0) {
            console.log('[LocationSync] Deep sync: No nodes found, skipping sync');
            return { synced: 0, total: 0, totalCount: 0, errors: [] };
        }
        
        // Deep sync with each node
        console.log(`[LocationSync] Deep sync: Syncing with ${nodeIds.length} node(s)...`);
        const results = await Promise.allSettled(
            nodeIds.map(nodeId => {
                console.log(`[LocationSync] Deep sync: Starting sync with node: ${nodeId}`);
                return deepSyncWithNode(nodeId, startTime, endTime);
            })
        );
        
        // Count successes and errors
        let synced = 0;
        let totalCount = 0;
        const errors = [];
        const nodeStats = [];
        
        results.forEach((result, index) => {
            const nodeId = nodeIds[index];
            if (result.status === 'fulfilled') {
                const data = result.value;
                if (data.success) {
                    synced++;
                    totalCount += data.count;
                    console.log(`[LocationSync] Deep sync ✓ Node ${nodeId}: ${data.count} location(s) synced`);
                    nodeStats.push({
                        nodeId,
                        success: true,
                        count: data.count,
                        error: null
                    });
                } else {
                    const errorMsg = data.error || 'Unknown error';
                    console.warn(`[LocationSync] Deep sync ✗ Node ${nodeId} failed: ${errorMsg}`);
                    errors.push({ nodeId, error: errorMsg });
                    nodeStats.push({
                        nodeId,
                        success: false,
                        count: 0,
                        error: errorMsg
                    });
                }
            } else {
                const errorMsg = result.reason?.message || String(result.reason);
                console.error(`[LocationSync] Deep sync ✗ Node ${nodeId} exception: ${errorMsg}`);
                errors.push({ nodeId, error: errorMsg });
                nodeStats.push({
                    nodeId,
                    success: false,
                    count: 0,
                    error: errorMsg
                });
            }
        });
        
        const syncDuration = Date.now() - syncStartTime;
        console.log(`[LocationSync] Deep sync completed in ${syncDuration}ms: ${synced}/${nodeIds.length} nodes synced, ${totalCount} total locations, ${errors.length} errors`);
        
        return {
            synced,
            total: nodeIds.length,
            totalCount,
            errors,
            nodeStats
        };
        
    } catch (error) {
        const syncDuration = Date.now() - syncStartTime;
        console.error(`[LocationSync] Deep sync failed after ${syncDuration}ms:`, error);
        throw error;
    }
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

