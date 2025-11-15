/**
 * Location Utilities
 * 
 * Helper functions for location-related operations
 */

// Berlin bounds constants (exported for use in scenario generation)
export const BERLIN_BOUNDS = {
    minLon: 13.08283,
    minLat: 52.33446,
    maxLon: 13.762245,
    maxLat: 52.6783
};

/**
 * Generate a random GPS position within Berlin bounds
 * 
 * Berlin bounds: [min_lon, min_lat, max_lon, max_lat]
 * [13.08283, 52.33446, 13.762245, 52.6783]
 * 
 * @returns {{lat: number, lon: number}} Random position within Berlin bounds
 */
export function generateRandomBerlinPosition() {
    // Generate random position within bounds
    const lat = BERLIN_BOUNDS.minLat + Math.random() * (BERLIN_BOUNDS.maxLat - BERLIN_BOUNDS.minLat);
    const lon = BERLIN_BOUNDS.minLon + Math.random() * (BERLIN_BOUNDS.maxLon - BERLIN_BOUNDS.minLon);
    
    return {
        lat: parseFloat(lat.toFixed(6)),
        lon: parseFloat(lon.toFixed(6))
    };
}

