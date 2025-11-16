import { OpenAPI } from '../core/OpenAPI.js';
import { request as __request } from '../core/request.js';
export class HealthService {
    /**
     * Health check endpoint
     * @returns any Service health status
     * @throws ApiError
     */
    static getApiHealth() {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/health',
        });
    }
    /**
     * Get network information for accessing the app
     * @returns any Network access information
     * @throws ApiError
     */
    static getApiNetwork() {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/network',
        });
    }
}
