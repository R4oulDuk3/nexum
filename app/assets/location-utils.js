/**
 * Location Utilities
 * 
 * Helper functions for location-related operations
 */

/**
 * Generate a random GPS position within Berlin bounds
 * 
 * Berlin bounds: [min_lon, min_lat, max_lon, max_lat]
 * [13.08283, 52.33446, 13.762245, 52.6783]
 * 
 * @returns {{lat: number, lon: number}} Random position within Berlin bounds
 */
export function generateRandomBerlinPosition() {
    // Berlin bounds: [min_lon, min_lat, max_lon, max_lat]
    const bounds = {
        minLon: 13.08283,
        minLat: 52.33446,
        maxLon: 13.762245,
        maxLat: 52.6783
    };
    
    // Generate random position within bounds
    const lat = bounds.minLat + Math.random() * (bounds.maxLat - bounds.minLat);
    const lon = bounds.minLon + Math.random() * (bounds.maxLon - bounds.minLon);
    
    return {
        lat: parseFloat(lat.toFixed(6)),
        lon: parseFloat(lon.toFixed(6))
    };
}

