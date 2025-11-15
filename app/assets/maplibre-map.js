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
        style = null
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

    // Return map object directly (not wrapped)
    return map;
}

// Store markers per map instance using WeakMap
const mapMarkers = new WeakMap();

/**
 * Add a user marker to the map
 * @param {maplibregl.Map} map - The MapLibre map instance
 * @param {number} long - Longitude
 * @param {number} lat - Latitude
 * @returns {maplibregl.Marker} The created marker
 */
export function addUserMarker(map, long, lat) {
    console.log('🔍 DEBUG - addUserMarker called with:', { map, long, lat });
    
    // Check for existing marker by ID and remove it
    const existingMarker = document.getElementById('user-marker');
    if (existingMarker) {
        console.log('🔍 DEBUG - Removing existing marker with ID "user-marker"');
        existingMarker.remove();
    }
    
    // Also remove from WeakMap if stored there
    if (mapMarkers.has(map)) {
        const markerStore = mapMarkers.get(map);
        if (markerStore.userMarker) {
            console.log('🔍 DEBUG - Removing marker from WeakMap');
            markerStore.userMarker.remove();
            markerStore.userMarker = null;
        }
    }
    
    // Create custom marker element with user.png icon
    const el = document.createElement('img');
    el.id = 'user-marker';
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
    
    // Store in WeakMap for reference
    if (!mapMarkers.has(map)) {
        mapMarkers.set(map, { userMarker: null });
    }
    mapMarkers.get(map).userMarker = marker;
    
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
    if (mapMarkers.has(map)) {
        const markerStore = mapMarkers.get(map);
        if (markerStore.userMarker) {
            console.log('🔍 DEBUG - Removing user marker');
            markerStore.userMarker.remove();
            markerStore.userMarker = null;
            console.log('🔍 DEBUG - User marker removed');
        } else {
            console.log('🔍 DEBUG - No user marker to remove');
        }
    } else {
        console.log('🔍 DEBUG - No marker storage for this map');
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
    
    if (mapMarkers.has(map)) {
        const markerStore = mapMarkers.get(map);
        if (markerStore.userMarker) {
            console.log('🔍 DEBUG - Updating existing marker position from:', markerStore.userMarker.getLngLat(), 'to:', [long, lat]);
            markerStore.userMarker.setLngLat([long, lat]);
            map.setCenter([long, lat]);
            console.log('🔍 DEBUG - Marker position updated, current position:', markerStore.userMarker.getLngLat());
        } else {
            console.log('🔍 DEBUG - No existing marker, creating new one');
            // If marker doesn't exist, create it
            addUserMarker(map, long, lat);
            map.setCenter([long, lat]);
        }
    } else {
        console.log('🔍 DEBUG - No marker storage for this map, creating new marker');
        addUserMarker(map, long, lat);
        map.setCenter([long, lat]);
    }
}

