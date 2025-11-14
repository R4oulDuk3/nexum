import { OpenAPI } from '../core/OpenAPI.js';
import { request as __request } from '../core/request.js';
export class LocationsService {
    /**
     * Record a new location report
     * Add a location report for an entity (responder, civilian, etc.)
     * @param requestBody
     * @returns LocationSuccessResponseSchema Location added successfully
     * @throws ApiError
     */
    static postApiLocations(requestBody) {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/locations/',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Invalid request data`,
            },
        });
    }
    /**
     * Get location history for an entity
     * Retrieve location history for a specific entity
     * @param entityId Entity UUID
     * @param since UTC milliseconds timestamp (optional)
     * @param limit Maximum number of results (default: 100)
     * @returns LocationListResponseSchema Location history retrieved successfully
     * @throws ApiError
     */
    static getApiLocationsHistory(entityId, since, limit = 100) {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/locations/history/{entity_id}',
            path: {
                'entity_id': entityId,
            },
            query: {
                'since': since,
                'limit': limit,
            },
            errors: {
                400: `Invalid UUID or parameter`,
            },
        });
    }
    /**
     * Get latest location for each entity
     * Retrieve the most recent location report for each entity
     * @param type Filter by entity type (optional)
     * @param limit Maximum number of results (default: 100)
     * @returns LocationListResponseSchema Latest locations retrieved successfully
     * @throws ApiError
     */
    static getApiLocationsLatest(type, limit = 100) {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/locations/latest',
            query: {
                'type': type,
                'limit': limit,
            },
            errors: {
                400: `Invalid parameter`,
            },
        });
    }
    /**
     * Find entities near a location
     * Search for entities within a specified radius of a location
     * @param requestBody
     * @returns NearbyResponseSchema Nearby entities found
     * @throws ApiError
     */
    static postApiLocationsNearby(requestBody) {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/locations/nearby',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Invalid request data`,
            },
        });
    }
    /**
     * Get current node ID
     * Retrieve the ID of the current mesh node
     * @returns NodeIdResponseSchema Current node ID
     * @throws ApiError
     */
    static getApiLocationsNodeId() {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/locations/node-id',
        });
    }
    /**
     * Get list of valid entity types
     * Retrieve all valid entity type values
     * @returns EntityTypesResponseSchema List of entity types
     * @throws ApiError
     */
    static getApiLocationsTypes() {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/locations/types',
        });
    }
}
