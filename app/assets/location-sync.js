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
 * Uses forward/backward sync strategy similar to server-side sync
 * @param {string} nodeId - Node ID to sync from
 * @returns {Promise<{success: boolean, count: number, error?: string}>}
 */
export async function syncWithNode(nodeId) {
    try {
        const now = Date.now();
        const thirtyMinutesMs = 30 * 60 * 1000; // 30 minutes in milliseconds
        
        // Get sync times from Dexie
        const nodeSync = await db.node_sync.get(nodeId);
        let forwardSyncAt = nodeSync?.last_forward_sync_at || 0;
        let backwardSyncAt = nodeSync?.last_backward_sync_at || now;
        
        // Initialize sync times if this is first sync
        if (!nodeSync) {
            forwardSyncAt = 0;
            backwardSyncAt = now;
        }
        
        let totalCount = 0;
        let forwardLatest = forwardSyncAt;
        let backwardOldest = backwardSyncAt;
        
        // Forward sync: Get new data from last_forward_sync_at to last_forward_sync_at + 30min
        const forwardFrom = forwardSyncAt;
        const forwardUntil = Math.min(forwardFrom + thirtyMinutesMs, now);
        
        console.log(`[LocationSync] Node ${nodeId}: Forward sync from ${new Date(forwardFrom).toISOString()} to ${new Date(forwardUntil).toISOString()}`);
        const forwardLocations = await fetchNodeData(nodeId, forwardFrom, forwardUntil);
        console.log(`[LocationSync] Node ${nodeId}: Forward sync received ${forwardLocations.length} location(s)`);
        
        if (forwardLocations.length > 0) {
            // Find latest created_at in forward data
            for (const loc of forwardLocations) {
                const createdAt = typeof loc.created_at === 'string' ? new Date(loc.created_at).getTime() : loc.created_at;
                if (createdAt > forwardLatest) {
                    forwardLatest = createdAt;
                }
            }
            totalCount += forwardLocations.length;
        } else {
            // No new data, update forward sync time to current time
            forwardLatest = now;
        }
        
        // Backward sync: Get old data from (last_backward_sync_at - 30min) to last_backward_sync_at
        const backwardFrom = Math.max(0, backwardSyncAt - thirtyMinutesMs);
        const backwardUntil = backwardSyncAt;
        
        console.log(`[LocationSync] Node ${nodeId}: Backward sync from ${new Date(backwardFrom).toISOString()} to ${new Date(backwardUntil).toISOString()}`);
        const backwardLocations = await fetchNodeData(nodeId, backwardFrom, backwardUntil);
        console.log(`[LocationSync] Node ${nodeId}: Backward sync received ${backwardLocations.length} location(s)`);
        
        if (backwardLocations.length > 0) {
            // Find oldest created_at in backward data
            for (const loc of backwardLocations) {
                const createdAt = typeof loc.created_at === 'string' ? new Date(loc.created_at).getTime() : loc.created_at;
                if (createdAt < backwardOldest || backwardOldest === backwardSyncAt) {
                    backwardOldest = createdAt;
                }
            }
            totalCount += backwardLocations.length;
        } else {
            // No data in range, keep backward sync time as is
            backwardOldest = backwardSyncAt;
        }
        
        // Combine all locations
        const allLocations = [...forwardLocations, ...backwardLocations];
        
        if (allLocations.length === 0) {
            // Update sync times even if no new data
            await db.node_sync.put({
                node_id: nodeId,
                last_forward_sync_at: forwardLatest,
                last_backward_sync_at: backwardOldest
            });
            console.log(`[LocationSync] Node ${nodeId}: No new data, sync times updated`);
            return { success: true, count: 0 };
        }
        
        // Write to IndexedDB in transaction
        console.log(`[LocationSync] Node ${nodeId}: Writing ${allLocations.length} location(s) to IndexedDB...`);
        await db.transaction('rw', db.locations, db.latest_locations, db.node_sync, async () => {
            // Write all locations
            await db.locations.bulkPut(allLocations);
            
            // Update latest_locations cache
            for (const loc of allLocations) {
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
            
            // Update node sync times
            await db.node_sync.put({
                node_id: nodeId,
                last_forward_sync_at: forwardLatest,
                last_backward_sync_at: backwardOldest
            });
        });
        
        console.log(`[LocationSync] Node ${nodeId}: Successfully synced ${allLocations.length} location(s) (forward: ${forwardLocations.length}, backward: ${backwardLocations.length})`);
        return { success: true, count: allLocations.length };
        
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
        
        // Update reports_since_last_refresh count
        if (totalCount > 0) {
            await db.transaction('rw', db.reports_since_last_refresh, async () => {
                const existing = await db.reports_since_last_refresh.get(1);
                const currentCount = existing?.count || 0;
                await db.reports_since_last_refresh.put({
                    id: 1,
                    count: currentCount + totalCount
                });
                console.log(`[LocationSync] Updated reports_since_last_refresh: ${currentCount} + ${totalCount} = ${currentCount + totalCount}`);
            });
        }
        
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
 * Update node sync times (manual override)
 * @param {string} nodeId - Node ID
 * @param {number} lastForwardSyncAt - UTC milliseconds timestamp for forward sync
 * @param {number} lastBackwardSyncAt - UTC milliseconds timestamp for backward sync
 */
export async function updateNodeSync(nodeId, lastForwardSyncAt, lastBackwardSyncAt) {
    await db.node_sync.put({
        node_id: nodeId,
        last_forward_sync_at: lastForwardSyncAt,
        last_backward_sync_at: lastBackwardSyncAt
    });
}

/**
 * Deep sync locations from a node for a specific time range (bypasses incremental sync)
 * Fetches last 3 hours of data and sets forward/backward sync times properly
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
        
        let forwardLatest = endTime;
        let backwardOldest = startTime;
        
        if (locations.length > 0) {
            // Find latest and oldest created_at in the data
            for (const loc of locations) {
                const createdAt = typeof loc.created_at === 'string' ? new Date(loc.created_at).getTime() : loc.created_at;
                if (createdAt > forwardLatest) {
                    forwardLatest = createdAt;
                }
                if (createdAt < backwardOldest) {
                    backwardOldest = createdAt;
                }
            }
        } else {
            // No data in range, set sync times to range boundaries
            forwardLatest = endTime;
            backwardOldest = startTime;
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
            
            // Update node sync times (set both forward and backward to cover the synced range)
            await db.node_sync.put({
                node_id: nodeId,
                last_forward_sync_at: forwardLatest,
                last_backward_sync_at: backwardOldest
            });
        });
        
        console.log(`[LocationSync] Deep sync Node ${nodeId}: Successfully synced ${locations.length} location(s), sync times set to forward: ${new Date(forwardLatest).toISOString()}, backward: ${new Date(backwardOldest).toISOString()}`);
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
 * Sync scheduler state
 */
let syncSchedulerTimeout = null;
let isSyncRunning = false;

/**
 * Start automatic sync scheduler
 * Runs sync every 2 seconds after previous sync finishes
 */
export function startSyncScheduler() {
    if (syncSchedulerTimeout) {
        console.log('[LocationSync] Sync scheduler already running');
        return;
    }
    
    console.log('[LocationSync] Starting sync scheduler (every 2s after completion)');
    
    async function runSync() {
        if (isSyncRunning) {
            console.log('[LocationSync] Sync already running, skipping');
            scheduleNextSync();
            return;
        }
        
        isSyncRunning = true;
        try {
            await syncAllNodes();
        } catch (error) {
            console.error('[LocationSync] Sync scheduler error:', error);
        } finally {
            isSyncRunning = false;
            // Schedule next sync 2 seconds after this one finishes
            scheduleNextSync();
        }
    }
    
    function scheduleNextSync() {
        syncSchedulerTimeout = setTimeout(runSync, 2000);
    }
    
    // Start first sync immediately
    runSync();
}

/**
 * Stop automatic sync scheduler
 */
export function stopSyncScheduler() {
    if (syncSchedulerTimeout) {
        clearTimeout(syncSchedulerTimeout);
        syncSchedulerTimeout = null;
        console.log('[LocationSync] Sync scheduler stopped');
    }
}

/**
 * Get sync status for all nodes
 * @returns {Promise<Array>} Array of sync status objects with forward/backward sync info
 */
export async function getSyncStatus() {
    try {
        const nodeIds = await fetchNodeList();
        const syncStatuses = await db.node_sync.bulkGet(nodeIds);
        const now = Date.now();
        
        // Get location counts per node
        const locationCounts = {};
        const allLocations = await db.locations.toArray();
        for (const loc of allLocations) {
            const nodeId = loc.node_id;
            locationCounts[nodeId] = (locationCounts[nodeId] || 0) + 1;
        }
        
        return nodeIds.map(nodeId => {
            const sync = syncStatuses.find(s => s && s.node_id === nodeId);
            const forwardSyncAt = sync?.last_forward_sync_at || null;
            const backwardSyncAt = sync?.last_backward_sync_at || null;
            
            return {
                node_id: nodeId,
                last_forward_sync_at: forwardSyncAt,
                last_backward_sync_at: backwardSyncAt,
                forward_sync_age_ms: forwardSyncAt ? now - forwardSyncAt : null,
                backward_sync_age_ms: backwardSyncAt ? now - backwardSyncAt : null,
                location_count: locationCounts[nodeId] || 0
            };
        });
    } catch (error) {
        console.error('Error getting sync status:', error);
        throw error;
    }
}

