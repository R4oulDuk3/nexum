/**
 * Location Sender - Core location sharing logic
 * 
 * This module handles sending location data to the server.
 * Designed to be reusable in both regular pages and service workers.
 * 
 * Uses localStorage for:
 * - user_uuid: Unique identifier for the user (auto-generated if not exists)
 * - user_role: User role (defaults to "responder" if not set)
 */

import { LocationsService, ApiError } from './api-client/index.js';

/**
 * Generate a UUID v4
 * @returns {string} UUID string
 */
function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

/**
 * Get or create user UUID from localStorage
 * @returns {string} User UUID
 */
function getUserUUID() {
    let userUuid = localStorage.getItem('user_uuid');
    if (!userUuid) {
        userUuid = generateUUID();
        localStorage.setItem('user_uuid', userUuid);
        console.log('Generated new user UUID:', userUuid);
    }
    return userUuid;
}

/**
 * Get user role from localStorage, default to "responder"
 * @returns {string} User role
 */
function getUserRole() {
    const userRole = localStorage.getItem('user_role');
    return userRole || 'responder';
}

/**
 * Set user role in localStorage
 * @param {string} role - User role (e.g., "responder", "civilian", etc.)
 */
function setUserRole(role) {
    localStorage.setItem('user_role', role);
}

/**
 * Get user name from localStorage
 * @returns {string|null} User name or null if not set
 */
function getUserName() {
    return localStorage.getItem('user_name');
}

/**
 * Set user name in localStorage
 * @param {string} name - User name
 */
function setUserName(name) {
    if (name && name.trim()) {
        localStorage.setItem('user_name', name.trim());
    } else {
        localStorage.removeItem('user_name');
    }
}

/**
 * Get current location using Geolocation API
 * @param {Object} options - Geolocation options
 * @returns {Promise<GeolocationPosition>} Geolocation position
 */
function getCurrentPosition(options = {}) {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
            reject(new Error('Geolocation is not supported by your browser'));
            return;
        }

        const defaultOptions = {
            enableHighAccuracy: true,
            timeout: 5000,
            maximumAge: 0,
            ...options
        };

        navigator.geolocation.getCurrentPosition(resolve, reject, defaultOptions);
    });
}

/**
 * Send location to the server
 * Core function that handles the actual location sharing
 * 
 * @param {Object} options - Optional configuration
 * @param {GeolocationPosition} options.position - Position object (if not provided, will fetch)
 * @param {string} options.entityType - Entity type override (defaults to user_role)
 * @param {string} options.entityId - Entity ID override (defaults to user_uuid)
 * @param {Object} options.metadata - Additional metadata to include
 * @param {number} options.created_at - Optional UTC milliseconds timestamp
 * @returns {Promise<Object>} Response data from server
 */
async function sendLocation(options = {}) {
    try {
        // Get user information from localStorage
        const userUuid = options.entityId || getUserUUID();
        const userRole = options.entityType || getUserRole();

        // Get current position if not provided
        let position = options.position;
        if (!position) {
            position = await getCurrentPosition();
        }

        // Node ID is handled by the backend automatically, no need to fetch it

        // Build position data
        const positionData = {
            lat: position.coords.latitude,
            lon: position.coords.longitude
        };

        // Add optional position data
        if (position.coords.altitude !== null && position.coords.altitude !== undefined) {
            positionData.alt = position.coords.altitude;
        }
        if (position.coords.accuracy !== null && position.coords.accuracy !== undefined) {
            positionData.accuracy = position.coords.accuracy;
        }

        // Build metadata
        const metadata = {
            timestamp: new Date().toISOString(),
            status: 'active',
            ...options.metadata
        };
        
        // Add name to metadata if it exists in localStorage
        const userName = getUserName();
        if (userName) {
            metadata.name = userName;
        }

        // Build request data
        // Note: node_id is handled automatically by the backend
        const data = {
            entity_type: userRole,
            entity_id: userUuid,
            position: positionData,
            metadata: metadata
        };
        
        // Add optional created_at timestamp if provided
        if (options.created_at !== undefined && options.created_at !== null) {
            data.created_at = options.created_at;
        }

        // Send to server using generated API client
        const result = await LocationsService.postApiLocations(data);

        // The API returns { status: 'success', data: {...} }
        const locationData = result.data || result;
        console.log('Location sent successfully:', locationData);
        return {
            success: true,
            data: locationData
        };
    } catch (error) {
        console.error('Error sending location:', error);
        
        // Handle ApiError from generated client
        if (error instanceof ApiError) {
            let errorMessage = error.message;
            // Try to extract message from error body if available
            if (error.body) {
                if (typeof error.body === 'object' && error.body.message) {
                    errorMessage = error.body.message;
                } else if (typeof error.body === 'string') {
                    errorMessage = error.body;
                }
            }
            return {
                success: false,
                error: errorMessage
            };
        }
        
        return {
            success: false,
            error: error.message || 'Failed to send location'
        };
    }
}

/**
 * Send multiple locations in batch
 * @param {Array<Object>} locations - Array of location objects
 * Each location should have: {entity_type, entity_id, position: {lat, lon}, metadata?, created_at?}
 * @returns {Promise<Object>} Result with success count, failed count, and errors
 */
async function sendLocationsBatch(locations) {
    try {
        if (!Array.isArray(locations) || locations.length === 0) {
            throw new Error('locations must be a non-empty array');
        }
        
        if (locations.length > 1000) {
            throw new Error('Batch size cannot exceed 1000 locations');
        }
        
        // Build batch request
        const batchData = {
            locations: locations.map(loc => ({
                entity_type: loc.entity_type,
                entity_id: loc.entity_id || generateUUID(),
                position: {
                    lat: loc.position.lat,
                    lon: loc.position.lon,
                    alt: loc.position.alt,
                    accuracy: loc.position.accuracy
                },
                metadata: loc.metadata || {},
                ...(loc.created_at !== undefined && loc.created_at !== null && { created_at: loc.created_at })
            }))
        };
        
        // Send batch request
        const response = await fetch('/api/locations/batch', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(batchData)
        });
        
        const result = await response.json();
        
        if (!response.ok) {
            throw new Error(result.message || 'Batch request failed');
        }
        
        console.log(`[LocationSender] Batch sent: ${result.created} created, ${result.failed} failed`);
        
        if (result.errors && result.errors.length > 0) {
            console.warn(`[LocationSender] Batch errors:`, result.errors);
        }
        
        return {
            success: true,
            created: result.created,
            failed: result.failed,
            errors: result.errors,
            data: result.data
        };
        
    } catch (error) {
        console.error('[LocationSender] Error sending batch:', error);
        return {
            success: false,
            error: error.message || 'Failed to send batch'
        };
    }
}

// Export functions as ES6 module
export {
    sendLocation,
    sendLocationsBatch,
    getUserUUID,
    getUserRole,
    setUserRole,
    getUserName,
    setUserName,
    getCurrentPosition,
    generateUUID
};

// Also export as default object for convenience
export default {
    sendLocation,
    sendLocationsBatch,
    getUserUUID,
    getUserRole,
    setUserRole,
    getUserName,
    setUserName,
    getCurrentPosition,
    generateUUID
};

// Keep window export for backward compatibility (optional)
if (typeof window !== 'undefined') {
    window.LocationSender = {
        sendLocation,
        sendLocationsBatch,
        getUserUUID,
        getUserRole,
        setUserRole,
        getUserName,
        setUserName,
        getCurrentPosition,
        generateUUID
    };
}

