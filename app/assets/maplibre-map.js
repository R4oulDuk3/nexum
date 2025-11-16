/**
 * MapLibre GL JS Map Component
 * 
 * A reusable map component that can be easily added to any page.
 * 
 * Usage:
 *   import { initMap, addUserMarker, getTileJsonCenter } from '/assets/maplibre-map.js';
 *   
 *   // Initialize map - returns map object directly
 *   let map = await initMap({
 *     containerId: 'map',
 *     center: [13.4050, 52.5200],  // [lon, lat]
 *     zoom: 12,  // Optional, defaults to 12
 *     showControls: true  // Optional, defaults to true
 *   });
 * 
 *   // Add user marker - can be called immediately, no need to wait for load
 *   addUserMarker(map, 13.4050, 52.5200);
 * 
 *   // Or use TileJSON center
 *   const center = await getTileJsonCenter();
 *   let map = await initMap({
 *     containerId: 'map',
 *     center: center.center,
 *     zoom: center.zoom
 *   });
 *   addUserMarker(map, center.center[0], center.center[1]);
 */

/**
 * Fetch center and zoom from TileJSON
 * @returns {Promise<{center: [number, number], zoom: number}>}
 */
export async function getTileJsonCenter() {
    const baseUrl = window.location.origin;
    let center = [13.4050, 52.5200, 12]; // Default fallback (zoom 12 for city view)
    try {
        console.log('🔍 DEBUG - Fetching metadata from:', `${baseUrl}/api/tiles/vector/metadata`);
        const metadataResponse = await fetch(`${baseUrl}/api/tiles/vector/metadata`);
        if (metadataResponse.ok) {
            const metadata = await metadataResponse.json();
            console.log('🔍 DEBUG - Metadata received:', metadata);

            let centerData = metadata.center.split(',');
            center = [parseFloat(centerData[0]), parseFloat(centerData[1]), parseInt(centerData[2])];
            console.log('🔍 DEBUG - Parsed center:', center);
            
            // Metadata zoom is often too low (7-8), override with minimum reasonable zoom
            const minZoom = 12; // Minimum zoom for city-level viewing
            if (center[2] < minZoom) {
                console.log('🔍 DEBUG - Metadata zoom', center[2], 'too low, using minimum', minZoom);
                center[2] = minZoom;
            }
        } else {
            console.warn('🔍 DEBUG - Metadata response not OK:', metadataResponse.status);
        }
    } catch (e) {
        console.warn('🔍 DEBUG - Could not fetch metadata, using defaults', e);
    }

    const result = { center: [center[0], center[1]], zoom: center[2] };
    console.log('🔍 DEBUG - getTileJsonCenter returning:', result);
    return result;
}

export async function initMap(options = {}) {
    console.log('🔍 DEBUG - initMap called with options:', options);
    const {
        containerId = 'map',
        center = null,  // If not provided, will fetch from TileJSON
        zoom = null,    // If not provided, will fetch from TileJSON
        showControls = true,
        tilesUrl = null,
        style = null,
        mapId = 'default',  // Map ID for config
        config = null  // Optional config object
    } = options;
    console.log('🔍 DEBUG - Parsed options:', { containerId, center, zoom, showControls });

    // Get base URL for tiles
    const baseUrl = window.location.origin;
    const defaultTilesUrl = tilesUrl || `${baseUrl}/api/tiles/vector/{z}/{x}/{y}.pbf`;

    // If center or zoom not provided, fetch from TileJSON
    let mapCenter = center;
    let mapZoom = zoom;
    if (!mapCenter || mapZoom === null) {
        console.log('🔍 DEBUG - Fetching TileJSON for center/zoom');
        const tileJsonCenter = await getTileJsonCenter();
        
        if (!mapCenter) {
            mapCenter = tileJsonCenter.center;
            console.log('🔍 DEBUG - Using TileJSON center:', mapCenter);
        } else {
            console.log('🔍 DEBUG - Using provided center:', mapCenter);
        }
        
        if (mapZoom === null) {
            // Apply minimum zoom override for TileJSON zoom (metadata often has zoom 7 which is too low)
            const minZoom = 12; // Minimum reasonable zoom for city-level viewing
            mapZoom = Math.max(tileJsonCenter.zoom, minZoom);
            if (tileJsonCenter.zoom < minZoom) {
                console.log('🔍 DEBUG - TileJSON zoom', tileJsonCenter.zoom, 'too low, using minimum', minZoom);
            } else {
                console.log('🔍 DEBUG - Using TileJSON zoom:', mapZoom);
            }
        } else {
            console.log('🔍 DEBUG - Using provided zoom:', mapZoom);
        }
    } else {
        console.log('🔍 DEBUG - Using provided center and zoom:', mapCenter, mapZoom);
    }

    // Fetch metadata to get actual zoom levels (minzoom/maxzoom)
    let minzoom = 0;
    let maxzoom = 14; // Default fallback
    try {
        const metadataResponse = await fetch(`${baseUrl}/api/tiles/vector/metadata`);
        if (metadataResponse.ok) {
            const metadata = await metadataResponse.json();
            minzoom = parseInt(metadata.minzoom || 0);
            maxzoom = parseInt(metadata.maxzoom || 14);
        }
    } catch (e) {
        console.warn('Could not fetch metadata for zoom limits, using defaults', e);
    }
    
    console.log('🔍 DEBUG - Final map center:', mapCenter, 'zoom:', mapZoom, 'minzoom:', minzoom, 'maxzoom:', maxzoom);

    // Use provided style or create default style
    const mapStyle = style || {
        version: 8,
        sources: {
            'osm': {
                type: 'vector',
                tiles: [defaultTilesUrl],
                minzoom: minzoom,
                maxzoom: maxzoom
            }
        },
        layers: [
            {
                id: 'background',
                type: 'background',
                paint: {
                    'background-color': '#f0f0f0'
                }
            },
            {
                id: 'water',
                type: 'fill',
                source: 'osm',
                'source-layer': 'water',
                paint: {
                    'fill-color': '#a0c8f0'
                }
            },
            {
                id: 'landcover-grass',
                type: 'fill',
                source: 'osm',
                'source-layer': 'landcover',
                filter: ['==', ['get', 'class'], 'grass'],
                paint: {
                    'fill-color': '#90d090'
                }
            },
            {
                id: 'landuse',
                type: 'fill',
                source: 'osm',
                'source-layer': 'landuse',
                paint: {
                    'fill-color': '#e0e0e0',
                    'fill-opacity': 0.5
                }
            },
            {
                id: 'park',
                type: 'fill',
                source: 'osm',
                'source-layer': 'park',
                paint: {
                    'fill-color': '#90d090',
                    'fill-opacity': 0.6
                }
            },
            {
                id: 'buildings',
                type: 'fill',
                source: 'osm',
                'source-layer': 'building',
                paint: {
                    'fill-color': '#d0d0d0',
                    'fill-opacity': 0.6
                }
            },
            {
                id: 'transportation-major',
                type: 'line',
                source: 'osm',
                'source-layer': 'transportation',
                filter: ['in', ['get', 'class'], ['literal', ['motorway', 'trunk', 'primary']]],
                paint: {
                    'line-color': '#f0a0a0',
                    'line-width': 2
                }
            },
            {
                id: 'transportation-minor',
                type: 'line',
                source: 'osm',
                'source-layer': 'transportation',
                filter: ['in', ['get', 'class'], ['literal', ['secondary', 'tertiary', 'minor']]],
                paint: {
                    'line-color': '#f0c0c0',
                    'line-width': 1
                }
            },
            {
                id: 'transportation-name',
                type: 'symbol',
                source: 'osm',
                'source-layer': 'transportation_name',
                layout: {
                    'text-field': ['get', 'name:latin'],
                    'text-font': ['Noto Sans Regular'],
                    'text-size': 12
                },
                paint: {
                    'text-color': '#333'
                }
            },
            {
                id: 'place-labels',
                type: 'symbol',
                source: 'osm',
                'source-layer': 'place',
                layout: {
                    'text-field': ['get', 'name:latin'],
                    'text-font': ['Noto Sans Regular'],
                    'text-size': 14
                },
                paint: {
                    'text-color': '#000'
                }
            }
        ],
        glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf'
    };

    console.log('🔍 DEBUG - Creating map with:', {
        container: containerId,
        minZoom: minzoom,
        maxZoom: maxzoom,
        center: mapCenter,
        zoom: mapZoom
    });
    const map = new maplibregl.Map({
        container: containerId,
        minZoom: minzoom,
        maxZoom: maxzoom,
        style: mapStyle,
        center: mapCenter,
        zoom: mapZoom
    });
    
    map.once('load', () => {
        console.log('🔍 DEBUG - Map loaded, current zoom:', map.getZoom(), 'center:', map.getCenter());
    });

    // Add controls if requested
    if (showControls) {
        map.addControl(new maplibregl.NavigationControl());
        map.addControl(new maplibregl.ScaleControl());
    }

    // Enforce zoom limits
    map.on('zoom', function() {
        const currentZoom = map.getZoom();
        if (currentZoom > maxzoom) {
            map.setZoom(maxzoom);
        } else if (currentZoom < minzoom) {
            map.setZoom(minzoom);
        }
    });

    // Prevent zoom beyond limits on wheel events
    map.on('wheel', function(e) {
        const currentZoom = map.getZoom();
        if (currentZoom >= maxzoom && e.originalEvent.deltaY < 0) {
            e.preventDefault();
        }
        if (currentZoom <= minzoom && e.originalEvent.deltaY > 0) {
            e.preventDefault();
        }
    });

    // Set map config if provided, or initialize default config if not exists
    if (mapId) {
        try {
            const { getMapConfig, setMapConfig } = await import('./map-config.js');
            const { default: db } = await import('./location-sync-db.js');
            
            // Check if config exists in DB directly (without creating default)
            const stored = await db.map_mode.get(mapId);
            
            // If config provided in options, use it
            if (config) {
                // User provided config - set it
                await setMapConfig(mapId, config);
                console.log('🔍 DEBUG - Set provided config for map:', mapId, config);
            } else if (!stored) {
                // No config exists in DB - set default only if not exists
                await setMapConfig(mapId, {
                    entity_types_to_show: ['responder', 'civilian', 'incident', 'resource', 'hazard']
                });
                console.log('🔍 DEBUG - Set default config for map:', mapId);
            }
        } catch (error) {
            console.warn('Error setting map config:', error);
        }
    }

    // Return map object directly (not wrapped)
    return map;
}

/**
 * Remove all entity markers from the map by class
 * @param {maplibregl.Map} map - The MapLibre map instance
 */
function removeAllMarkersByClass(map) {
    // Find all marker elements with entity-marker class in the map container
    const mapContainer = map.getContainer();
    const markerElements = mapContainer.querySelectorAll('.entity-marker');
    
    let removedCount = 0;
    markerElements.forEach(markerEl => {
        // Find the parent maplibregl-marker element and remove it
        const mapMarker = markerEl.closest('.maplibregl-marker');
        if (mapMarker && mapMarker.parentNode) {
            mapMarker.parentNode.removeChild(mapMarker);
            removedCount++;
        }
    });
    
    if (removedCount > 0) {
        console.log(`[MapMarkers] Removed ${removedCount} markers by class`);
    }
    
    return removedCount;
}

/**
 * Add a user marker to the map
 * @param {maplibregl.Map} map - The MapLibre map instance
 * @param {number} long - Longitude
 * @param {number} lat - Latitude
 * @returns {maplibregl.Marker} The created marker
 */
export function addUserMarker(map, long, lat) {
    console.log('🔍 DEBUG - addUserMarker called with:', { map, long, lat });
    
    // Create custom marker element with user.png icon
    const el = document.createElement('img');
    el.id = 'user-marker';
    el.className = 'entity-marker entity-marker-user';
    // Flask serves static files from /assets (configured in app.py)
    el.src = '/assets/images/usr.png';
    el.style.width = '50px';
    el.style.height = '50px';
    el.style.display = 'block';
    
    // MapLibre expects [longitude, latitude]
    const coordinates = [long, lat];
    console.log('🔍 DEBUG - Adding marker to map at:', coordinates);
    
    // Create marker with custom element
    const marker = new maplibregl.Marker({ element: el, anchor: 'bottom' })
        .setLngLat(coordinates)
        .addTo(map);
    
    const markerPos = marker.getLngLat();
    console.log('🔍 DEBUG - Marker added successfully');
    console.log('🔍 DEBUG - Marker position:', markerPos);
    console.log('🔍 DEBUG - Expected coordinates:', coordinates);
    
    return marker;
}

/**
 * Remove the user marker from the map
 * @param {maplibregl.Map} map - The MapLibre map instance
 */
export function removeUserMarker(map) {
    // Remove all markers with user-marker class
    const mapContainer = map.getContainer();
    const userMarker = mapContainer.querySelector('#user-marker');
    if (userMarker) {
        const mapMarker = userMarker.closest('.maplibregl-marker');
        if (mapMarker && mapMarker.parentNode) {
            mapMarker.parentNode.removeChild(mapMarker);
            console.log('🔍 DEBUG - User marker removed');
        }
    } else {
        console.log('🔍 DEBUG - No user marker to remove');
    }
}

/**
 * Update the user marker position
 * @param {maplibregl.Map} map - The MapLibre map instance
 * @param {number} long - Longitude
 * @param {number} lat - Latitude
 */
export function updateUserMarker(map, long, lat) {
    console.log('🔍 DEBUG - updateUserMarker called with:', { map, long, lat });
    
    // Remove existing user marker and add new one
    removeUserMarker(map);
    addUserMarker(map, long, lat);
    map.setCenter([long, lat]);
}

/**
 * Get user UUID from localStorage
 * @returns {string|null} User UUID or null if not set
 */
function getUserId() {
    return localStorage.getItem('user_uuid');
}

/**
 * Format timestamp for display in markers
 * Returns relative time if < 1 hour (e.g., "30m ago"), or formatted time if >= 1 hour (e.g., "19:46")
 * @param {number|string|Date} timestamp - Timestamp in milliseconds or Date object
 * @returns {string} Formatted time string
 */
function formatTimeForMarker(timestamp) {
    try {
        let timestampMs;
        if (typeof timestamp === 'number') {
            timestampMs = timestamp;
        } else if (timestamp instanceof Date) {
            timestampMs = timestamp.getTime();
        } else {
            timestampMs = new Date(timestamp).getTime();
        }
        
        // Check if timestamp is valid
        if (isNaN(timestampMs)) {
            return 'Unknown';
        }
        
        const now = Date.now();
        const diffMs = now - timestampMs;
        const diffSeconds = Math.floor(diffMs / 1000);
        const diffMinutes = Math.floor(diffSeconds / 60);
        const diffHours = Math.floor(diffMinutes / 60);
        
        // Less than 1 hour: return relative time like "30m ago"
        if (diffMinutes < 60) {
            if (diffSeconds < 60) {
                return 'Just now';
            }
            return `${diffMinutes}m ago`;
        }
        
        // 1 hour or more: return formatted time like "19:46"
        const date = new Date(timestampMs);
        const hours = date.getHours().toString().padStart(2, '0');
        const minutes = date.getMinutes().toString().padStart(2, '0');
        return `${hours}:${minutes}`;
    } catch (error) {
        console.warn('Error formatting time for marker:', error);
        return 'Unknown';
    }
}

/**
 * Create marker element based on entity type
 * If isUser is true, uses user.png regardless of entity type
 * @param {string} entityType - Type of entity (responder, civilian, incident, resource, hazard)
 * @param {Object} location - Location object with metadata
 * @param {boolean} isUser - Whether this is the user's own location
 * @returns {HTMLElement} Marker element
 */
function createMarkerElement(entityType, location, isUser = false) {
    const el = document.createElement('div');
    el.className = `entity-marker entity-marker-${entityType}`;
    if (isUser) {
        el.className += ' entity-marker-user';
        el.id = 'user-marker'; // Set ID for easy lookup
    }
    
    // Create container for icon and info
    const container = document.createElement('div');
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.alignItems = 'center';
    
    // Icon based on entity type (or user icon if isUser)
    const icon = document.createElement('img');
    icon.style.width = '40px';
    icon.style.height = '40px';
    icon.style.display = 'block';
    
    if (isUser) {
        // User marker always uses usr.png
        icon.src = '/assets/images/usr.png';
        icon.alt = 'You';
    } else {
        switch (entityType) {
            case 'responder':
                icon.src = '/assets/images/responder.png';
                break;
            case 'civilian':
                icon.src = '/assets/images/civilian.png';
                break;
            case 'incident':
                icon.src = '/assets/images/incident.png';
                break;
            case 'resource':
                icon.src = '/assets/images/resource.png';
                break;
            case 'hazard':
                icon.src = '/assets/images/hazard.png';
                break;
            default:
                icon.src = '/assets/images/usr.png';
                break;
        }
        // Regular entity markers - use default marker for now
        // You can add specific icons later
        icon.alt = entityType;
    }
    
    container.appendChild(icon);
    
    // Combined time and name label - displayed below icon with background
    // Format: "(30m ago) name..." or "(19:46) name..."
    if (location.created_at) {
        const labelWrapper = document.createElement('div');
        labelWrapper.style.marginTop = '2px';
        labelWrapper.style.padding = '2px 4px';
        labelWrapper.style.backgroundColor = 'rgba(255, 255, 255, 0.9)';
        labelWrapper.style.borderRadius = '3px';
        labelWrapper.style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.2)';
        labelWrapper.style.maxWidth = '100px';
        labelWrapper.style.display = 'inline-block';
        
        const labelText = document.createElement('div');
        labelText.style.fontSize = '9px';
        labelText.style.color = '#333';
        labelText.style.textAlign = 'center';
        labelText.style.whiteSpace = 'nowrap';
        labelText.style.fontWeight = '500';
        labelText.style.overflow = 'hidden';
        labelText.style.textOverflow = 'ellipsis';
        
        // Format: "(time) name" or just "(time)" if no name
        // If this is the user's location, show "YOU" instead of metadata name
        const timeStr = formatTimeForMarker(location.created_at);
        const nameStr = isUser 
            ? ' YOU' 
            : (location.metadata && location.metadata.name 
                ? ` ${location.metadata.name}` 
                : '');
        labelText.textContent = `(${timeStr})${nameStr}`;
        
        labelWrapper.appendChild(labelText);
        container.appendChild(labelWrapper);
    } else if (location.metadata && location.metadata.name) {
        // Only show name if there's no timestamp
        // If this is the user's location, show "YOU" instead of metadata name
        const nameWrapper = document.createElement('div');
        nameWrapper.style.marginTop = '2px';
        nameWrapper.style.padding = '2px 4px';
        nameWrapper.style.backgroundColor = 'rgba(255, 255, 255, 0.9)';
        nameWrapper.style.borderRadius = '3px';
        nameWrapper.style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.2)';
        nameWrapper.style.maxWidth = '100px';
        nameWrapper.style.display = 'inline-block';
        
        const nameLabel = document.createElement('div');
        nameLabel.style.fontSize = '9px';
        nameLabel.style.color = '#333';
        nameLabel.style.textAlign = 'center';
        nameLabel.style.whiteSpace = 'nowrap';
        nameLabel.style.fontWeight = '500';
        nameLabel.style.overflow = 'hidden';
        nameLabel.style.textOverflow = 'ellipsis';
        nameLabel.textContent = isUser ? 'YOU' : location.metadata.name;
        
        nameWrapper.appendChild(nameLabel);
        container.appendChild(nameWrapper);
    }
    
    el.appendChild(container);
    return el;
}

/**
 * Clear and set markers on the map based on location list
 * Always removes all markers first, then adds all new ones
 * 
 * @param {maplibregl.Map} map - The MapLibre map instance
 * @param {Array<Object>} locations - Array of location objects
 * Each location should have: {entity_id, entity_type, created_at, position: {lat, lon}, metadata}
 * @returns {Object} Update result with removedCount and addedCount
 */
export function clearAndSetMarkers(map, locations = []) {
    console.log('[MapMarkers] clearAndSetMarkers called with', locations.length, 'locations');
    
    const userId = getUserId();
    
    // Step 1: Remove ALL markers by class
    const removedCount = removeAllMarkersByClass(map);
    console.log(`[MapMarkers] Removed all markers: ${removedCount}`);
    
    // Step 2: Add all new markers
    let addedCount = 0;
    const addedByType = {};
    
    locations.forEach(location => {
        // Check if this is the user's location
        const isUser = userId !== null && location.entity_id === userId;
        
        // Create marker element based on entity type (or user marker if isUser)
        const markerEl = createMarkerElement(location.entity_type, location, isUser);
        
        // Create MapLibre marker
        const marker = new maplibregl.Marker({ 
            element: markerEl, 
            anchor: 'bottom' 
        })
            .setLngLat([location.position.lon, location.position.lat])
            .addTo(map);
        
        // Track what was added
        addedCount++;
        addedByType[location.entity_type] = (addedByType[location.entity_type] || 0) + 1;
        
        if (isUser) {
            console.log(`[MapMarkers] Added user marker for entity: ${location.entity_id}`);
        }
    });
    
    console.log(`[MapMarkers] Marker update complete:`);
    console.log(`[MapMarkers]   - Removed: ${removedCount}`);
    console.log(`[MapMarkers]   - Added: ${addedCount}`);
    console.log(`[MapMarkers]   - Added by type:`, addedByType);
    
    // Return result for caller to use
    return {
        removedCount,
        addedCount,
        addedByType,
        totalBefore: removedCount,
        totalAfter: addedCount
    };
}

/**
 * Remove all trace layers and sources from the map
 * @param {maplibregl.Map} map - The MapLibre map instance
 */
function removeAllTraces(map) {
    try {
        // Check if map is loaded
        if (!map.isStyleLoaded()) {
            console.log('[Traces] Map style not loaded yet, skipping trace removal');
            return;
        }
        
        // Get all layers and sources that start with 'trace-'
        const style = map.getStyle();
        if (!style || !style.layers || !style.sources) {
            console.log('[Traces] Map style not ready, skipping trace removal');
            return;
        }
        
        const layers = style.layers || [];
        const sources = Object.keys(style.sources || {});
        
        // Remove trace layers
        let removedLayers = 0;
        layers.forEach(layer => {
            if (layer.id && layer.id.startsWith('trace-layer-')) {
                try {
                    if (map.getLayer(layer.id)) {
                        map.removeLayer(layer.id);
                        removedLayers++;
                    }
                } catch (error) {
                    // Layer may already be removed or not exist
                    console.debug(`[Traces] Could not remove layer ${layer.id}:`, error);
                }
            }
        });
        
        // Remove trace sources
        let removedSources = 0;
        sources.forEach(sourceId => {
            if (sourceId.startsWith('trace-source-')) {
                try {
                    if (map.getSource(sourceId)) {
                        map.removeSource(sourceId);
                        removedSources++;
                    }
                } catch (error) {
                    // Source may already be removed or not exist
                    console.debug(`[Traces] Could not remove source ${sourceId}:`, error);
                }
            }
        });
        
        if (removedLayers > 0 || removedSources > 0) {
            console.log(`[Traces] Removed ${removedLayers} trace layers and ${removedSources} trace sources`);
        }
    } catch (error) {
        console.warn('[Traces] Error removing traces (may not exist):', error);
    }
}

/**
 * Get color for entity type
 * @param {string} entityType - Entity type
 * @returns {string} Color hex code
 */
function getEntityTypeColor(entityType) {
    const colors = {
        'responder': '#ef4444',    // red
        'civilian': '#3b82f6',     // blue
        'incident': '#ef4444',     // red
        'resource': '#f97316',     // orange
        'hazard': '#a855f7'        // purple
    };
    return colors[entityType] || '#6b7280'; // default gray
}

/**
 * Draw traces (dotted lines) for entities based on location history
 * @param {maplibregl.Map} map - The MapLibre map instance
 * @param {Map<string, Array>} groupedByEntity - Map of entity_id -> array of locations
 * @param {string[]} entityTypes - Array of entity types to filter by (optional)
 */
function drawTraces(map, groupedByEntity, entityTypes = null) {
    console.log('[Traces] Drawing traces for entities...');
    
    let tracesDrawn = 0;
    let skipped = 0;
    
    // Static entity types that don't move (no traces needed)
    const staticEntityTypes = ['incident', 'hazard', 'resource'];
    
    groupedByEntity.forEach((locations, entityId) => {
        // Get entity type from first location
        const firstLocation = locations[0];
        if (!firstLocation) {
            skipped++;
            return;
        }
        
        const entityType = firstLocation.entity_type;
        
        // Skip static entities (incidents, hazards, resources) - they don't move
        if (staticEntityTypes.includes(entityType)) {
            skipped++;
            return;
        }
        
        // Only draw traces for moving entities (responders and civilians)
        if (entityType !== 'responder' && entityType !== 'civilian') {
            skipped++;
            return;
        }
        
        // Filter by entity types if provided
        if (entityTypes && entityTypes.length > 0) {
            if (!entityTypes.includes(entityType)) {
                return; // Skip this entity
            }
        }
        
        // Need at least 2 locations to draw a line
        if (locations.length < 2) {
            skipped++;
            return;
        }
        
        // Sort locations chronologically (oldest to newest) for line drawing
        const sortedLocations = [...locations].sort((a, b) => {
            const timeA = typeof a.created_at === 'number' ? a.created_at : new Date(a.created_at).getTime();
            const timeB = typeof b.created_at === 'number' ? b.created_at : new Date(b.created_at).getTime();
            return timeA - timeB;
        });
        
        // Create LineString coordinates array
        const coordinates = sortedLocations.map(loc => [loc.position.lon, loc.position.lat]);
        
        // Create GeoJSON LineString feature
        const geoJson = {
            type: 'Feature',
            geometry: {
                type: 'LineString',
                coordinates: coordinates
            },
            properties: {
                entity_id: entityId,
                entity_type: sortedLocations[0].entity_type
            }
        };
        
        // Create unique source and layer IDs
        const sourceId = `trace-source-${entityId}`;
        const layerId = `trace-layer-${entityId}`;
        
        try {
            // Remove existing source/layer if they exist
            if (map.getLayer(layerId)) {
                map.removeLayer(layerId);
            }
            if (map.getSource(sourceId)) {
                map.removeSource(sourceId);
            }
            
            // Add GeoJSON source
            map.addSource(sourceId, {
                type: 'geojson',
                data: geoJson
            });
            
            // Get entity type color
            const entityType = sortedLocations[0].entity_type;
            const lineColor = getEntityTypeColor(entityType);
            
            // Add line layer with dotted style
            map.addLayer({
                id: layerId,
                type: 'line',
                source: sourceId,
                layout: {
                    'line-cap': 'round',
                    'line-join': 'round'
                },
                paint: {
                    'line-color': lineColor,
                    'line-width': 2,
                    'line-opacity': 0.6,
                    'line-dasharray': [2, 2] // Dotted line
                }
            });
            
            tracesDrawn++;
        } catch (error) {
            console.error(`[Traces] Error drawing trace for entity ${entityId}:`, error);
        }
    });
    
    console.log(`[Traces] Trace drawing complete: ${tracesDrawn} traces drawn, ${skipped} skipped (insufficient points)`);
}

/**
 * Refresh map markers based on current config and latest locations from IndexedDB
 * @param {maplibregl.Map} map - The MapLibre map instance
 * @param {string} mapId - Map ID (default: 'default')
 * @returns {Promise<void>}
 */
export async function refreshMapMarkers(map, mapId = 'default') {
    const refreshStartTime = Date.now();
    console.log(`[MapRefresh] ========================================`);
    console.log(`[MapRefresh] Refresh triggered for map: ${mapId} at ${new Date(refreshStartTime).toLocaleTimeString()}`);
    console.log(`[MapRefresh] ========================================`);
    
    try {
        // Check if there are new reports since last refresh
        const { default: db } = await import('./location-sync-db.js');
        const refreshData = await db.reports_since_last_refresh.get(1);
        const newReportsCount = refreshData?.count || 0;
        
        if (newReportsCount === 0) {
            console.log(`[MapRefresh] No new reports (count: ${newReportsCount}), skipping refresh`);
            return;
        }
        
        console.log(`[MapRefresh] Found ${newReportsCount} new reports, refreshing map...`);
        
        // Import modules dynamically to avoid circular dependencies
        const { getMapConfig } = await import('./map-config.js');
        const { getLocationsGroupedByEntity } = await import('./location-reader.js');
        
        // Get map config (may be null if not exists)
        const config = await getMapConfig(mapId);
        console.log(`[MapRefresh] Configuration loaded:`, config);
        
        // If no config, show all types
        const entityTypes = config ? (config.entity_types_to_show || []) : ['responder', 'civilian', 'incident', 'resource', 'hazard'];
        const showTraces = config ? (config.show_traces || false) : false;
        const timeFromMinutes = config ? (config.time_from_minutes !== undefined ? config.time_from_minutes : -120) : -120;
        const timeUntilMinutes = config ? (config.time_until_minutes !== undefined ? config.time_until_minutes : 0) : 0;
        console.log(`[MapRefresh] Entity types to show (${entityTypes.length}):`, entityTypes);
        console.log(`[MapRefresh] Show traces: ${showTraces}`);
        console.log(`[MapRefresh] Time filter: from ${timeFromMinutes} min to ${timeUntilMinutes} min`);
        
        // Always remove all traces first to clean up old traces
        removeAllTraces(map);
        
        // Get all locations grouped by entity_id, filtered by selected entity types, time window, and Berlin region
        console.log(`[MapRefresh] Fetching all locations from IndexedDB and grouping by entity_id...`);
        const { groupedByEntity, latestLocations } = await getLocationsGroupedByEntity(entityTypes, timeFromMinutes, timeUntilMinutes);
        console.log(`[MapRefresh] Total locations read: ${Array.from(groupedByEntity.values()).reduce((sum, locs) => sum + locs.length, 0)}`);
        console.log(`[MapRefresh] Unique entities: ${groupedByEntity.size}`);
        console.log(`[MapRefresh] Latest locations for markers: ${latestLocations.length}`);
        
        // Use latest locations from the hashmap for markers
        const locations = latestLocations;
        
        // Count locations by entity type
        const locationsByType = {};
        locations.forEach(loc => {
            locationsByType[loc.entity_type] = (locationsByType[loc.entity_type] || 0) + 1;
        });
        console.log(`[MapRefresh] Locations by entity type:`, locationsByType);
        
        // Get current marker count before update (by counting DOM elements)
        const mapContainer = map.getContainer();
        const currentMarkerCount = mapContainer.querySelectorAll('.entity-marker').length;
        console.log(`[MapRefresh] Current markers on map: ${currentMarkerCount}`);
        
        // Update map markers (this will log add/delete details)
        console.log(`[MapRefresh] Updating map markers...`);
        const updateResult = clearAndSetMarkers(map, locations);
        
        // Draw traces if enabled
        if (showTraces) {
            console.log(`[MapRefresh] Drawing traces...`);
            drawTraces(map, groupedByEntity, entityTypes);
        }
        
        // Get marker count after update
        const newMarkerCount = mapContainer.querySelectorAll('.entity-marker').length;
        const addedCount = updateResult?.addedCount || 0;
        const removedCount = updateResult?.removedCount || 0;
        
        const refreshDuration = Date.now() - refreshStartTime;
        console.log(`[MapRefresh] ========================================`);
        console.log(`[MapRefresh] Refresh Summary:`);
        console.log(`[MapRefresh]   - Config: ${JSON.stringify(config || {})}`);
        console.log(`[MapRefresh]   - Entity types shown: ${entityTypes.join(', ')}`);
        console.log(`[MapRefresh]   - Locations read: ${locations.length}`);
        console.log(`[MapRefresh]   - Locations by type: ${JSON.stringify(locationsByType)}`);
        console.log(`[MapRefresh]   - Markers before: ${currentMarkerCount}`);
        console.log(`[MapRefresh]   - Markers to add: ${addedCount}`);
        console.log(`[MapRefresh]   - Markers to remove: ${removedCount}`);
        console.log(`[MapRefresh]   - Markers after: ${newMarkerCount}`);
        console.log(`[MapRefresh]   - Duration: ${refreshDuration}ms`);
        console.log(`[MapRefresh] ========================================`);
        
        // Reset count after refresh
        await db.transaction('rw', db.reports_since_last_refresh, async () => {
            await db.reports_since_last_refresh.put({
                id: 1,
                count: 0
            });
            console.log(`[MapRefresh] Reset reports_since_last_refresh count to 0`);
        });
        
    } catch (error) {
        const refreshDuration = Date.now() - refreshStartTime;
        console.error(`[MapRefresh] Error refreshing map markers after ${refreshDuration}ms:`, error);
        throw error;
    }
}

