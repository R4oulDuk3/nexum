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

        // Send to server
        const response = await fetch('/api/locations/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });

        const result = await response.json();

        if (response.ok) {
            console.log('Location sent successfully:', result.data);
            return {
                success: true,
                data: result.data
            };
        } else {
            throw new Error(result.message || 'Failed to send location');
        }
    } catch (error) {
        console.error('Error sending location:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

// Export functions for use in other scripts or service workers
if (typeof module !== 'undefined' && module.exports) {
    // Node.js/CommonJS
    module.exports = {
        sendLocation,
        getUserUUID,
        getUserRole,
        setUserRole,
        getUserName,
        setUserName,
        getCurrentPosition,
        generateUUID
    };
} else if (typeof window !== 'undefined') {
    // Browser - attach to window for global access
    window.LocationSender = {
        sendLocation,
        getUserUUID,
        getUserRole,
        setUserRole,
        getUserName,
        setUserName,
        getCurrentPosition,
        generateUUID
    };
}

