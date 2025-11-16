import { OpenAPI } from '../core/OpenAPI.js';
import { request as __request } from '../core/request.js';
export class LocationsService {
    /**
     * Record a new location report
     * Add a location report for an entity (responder, civilian, etc.)
     * @param requestBody
     * @returns any Location added successfully
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
     * Record multiple location reports in batch
     * Record multiple location reports in a single request. Useful for scenario generation.
     * @param requestBody
     * @returns any Locations created successfully
     * @throws ApiError
     */
    static postApiLocationsBatch(requestBody) {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/locations/batch',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Invalid request data`,
            },
        });
    }
}
