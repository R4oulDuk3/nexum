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
     * Get location data for a specific node since a timestamp
     * Retrieve location data for a specific node that is newer than the specified timestamp
     * @param nodeId Node ID (MAC address)
     * @param since UTC milliseconds timestamp (optional, defaults to 0)
     * @returns any Data retrieved successfully
     * @throws ApiError
     */
    static getApiSyncNodeData(nodeId, since) {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/sync/node/{node_id}/data',
            path: {
                'node_id': nodeId,
            },
            query: {
                'since': since,
            },
            errors: {
                400: `Invalid parameter`,
                500: `Server error`,
            },
        });
    }
    /**
     * Test endpoint to pull data from all peers with a specified timestamp
     * Test endpoint that pulls data from all peers using since=0 (or specified timestamp). Does not update sync logs.
     * @param since UTC milliseconds timestamp to use for all peers (default: 0)
     * @returns any Test pull completed
     * @throws ApiError
     */
    static getApiSyncTest(since) {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/sync/test',
            query: {
                'since': since,
            },
            errors: {
                500: `Server error`,
            },
        });
    }
}
