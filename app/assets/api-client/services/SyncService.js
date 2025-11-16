import { OpenAPI } from '../core/OpenAPI.js';
import { request as __request } from '../core/request.js';
export class SyncService {
    /**
     * Get this node's data since a timestamp (for peers to pull)
     * Retrieve this node's data that is newer than the specified timestamp
     * @param since UTC milliseconds timestamp (optional, defaults to 0)
     * @returns any Data retrieved successfully
     * @throws ApiError
     */
    static getApiSync(since) {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/sync',
            query: {
                'since': since,
            },
            errors: {
                400: `Invalid parameter`,
            },
        });
    }
    /**
     * Trigger sync with all peers in the mesh network
     * Initiate synchronization with all visible peers in the mesh network
     * @returns any Sync completed
     * @throws ApiError
     */
    static postApiSync() {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/sync',
            errors: {
                500: `Server error`,
            },
        });
    }
    /**
     * Get combined list of this node ID and all peer node IDs
     * Returns a combined list of this node ID and all peer node IDs
     * @returns any Node list retrieved successfully
     * @throws ApiError
     */
    static getApiSyncNodeList() {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/sync/node/list',
            errors: {
                500: `Server error`,
            },
        });
    }
    /**
     * Get locations in range for sync
     * Get locations in range for the current node (for sync)
     * @param fromTimestamp
     * @param toTimestamp
     * @returns any Locations retrieved successfully
     * @throws ApiError
     */
    static getApiSyncNodeSyncFromTo(fromTimestamp, toTimestamp) {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/sync/node/sync/from/{from_timestamp}/to/{to_timestamp}',
            path: {
                'from_timestamp': fromTimestamp,
                'to_timestamp': toTimestamp,
            },
            errors: {
                500: `Server error`,
            },
        });
    }
    /**
     * Get locations in range
     * Get locations in range for a specific node
     * @param nodeId
     * @param fromTimestamp
     * @param toTimestamp
     * @returns any Locations retrieved successfully
     * @throws ApiError
     */
    static getApiSyncNodeFromTo(nodeId, fromTimestamp, toTimestamp) {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/sync/node/{node_id}/from/{from_timestamp}/to/{to_timestamp}',
            path: {
                'node_id': nodeId,
                'from_timestamp': fromTimestamp,
                'to_timestamp': toTimestamp,
            },
            errors: {
                500: `Server error`,
            },
        });
    }
    /**
     * Get sync_log status for all peers
     * Get sync_log status for all peers, showing last sync times and IPs
     * @returns any Sync log status retrieved successfully
     * @throws ApiError
     */
    static getApiSyncStatus() {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/sync/status',
            errors: {
                500: `Server error`,
            },
        });
    }
}
