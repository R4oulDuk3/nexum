/**
 * Scenario Generator - Creates believable disaster scenarios
 * 
 * Generates realistic movements and appearances of entities over time
 * in the Berlin area.
 */

import { sendLocationsBatch, generateUUID } from './location-sender.js';
import { generateRandomBerlinPosition, BERLIN_BOUNDS } from './location-utils.js';
import { deepSyncAllNodes } from './location-sync.js';

/**
 * Disaster point at center of Berlin (Brandenburg Gate area)
 */
export const DISASTER_POINT = {
    lat: 52.5200,
    lon: 13.4050
};

/**
 * Calculate distance between two points (Haversine formula, km)
 */
function distance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

/**
 * Get position at specific distance and angle from a center point
 * @param {Object} center - Center point {lat, lon}
 * @param {number} distanceKm - Distance in kilometers
 * @param {number} angle - Angle in radians (0 = North, PI/2 = East)
 * @returns {Object} Position {lat, lon}
 */
function getPositionAtDistanceFromPoint(center, distanceKm, angle) {
    // ~111 km per degree latitude
    const latOffset = (distanceKm / 111) * Math.cos(angle);
    // Adjust longitude for latitude
    const lonOffset = (distanceKm / 111) * Math.sin(angle) / Math.cos(center.lat * Math.PI / 180);
    
    return {
        lat: center.lat + latOffset,
        lon: center.lon + lonOffset
    };
}

/**
 * Get random position within annulus (ring) around center point
 * @param {Object} center - Center point {lat, lon}
 * @param {number} minRadiusKm - Minimum radius in kilometers
 * @param {number} maxRadiusKm - Maximum radius in kilometers
 * @returns {Object} Random position {lat, lon}
 */
function getRandomPositionInRadius(center, minRadiusKm, maxRadiusKm) {
    // Random distance between min and max
    const distanceKm = minRadiusKm + Math.random() * (maxRadiusKm - minRadiusKm);
    // Random angle (0 to 2π)
    const angle = Math.random() * Math.PI * 2;
    
    return getPositionAtDistanceFromPoint(center, distanceKm, angle);
}

/**
 * Generate curved path between start and end using Quadratic Bezier curve
 * Simulates realistic movement (walking speed ~5 km/h) with natural curves
 * @param {Object} start - Start position {lat, lon}
 * @param {Object} end - End position {lat, lon}
 * @param {number} durationMinutes - Total duration in minutes
 * @param {number} pingFrequencySeconds - How often to generate a position point (in seconds)
 */
function generateCurvedPath(start, end, durationMinutes, pingFrequencySeconds = 10) {
    const positions = [];
    // Calculate number of steps based on ping frequency
    // e.g., 30 minutes * 60 seconds / 10 seconds per ping = 180 points
    const totalSeconds = durationMinutes * 60;
    const steps = Math.max(2, Math.floor(totalSeconds / pingFrequencySeconds));
    
    // Calculate straight-line distance
    const totalDistance = distance(start.lat, start.lon, end.lat, end.lon);
    const speedKmH = 5; // Walking speed
    const maxDistance = (speedKmH * durationMinutes) / 60; // Max distance in km
    
    // If destination is too far, adjust end point
    let adjustedEnd = { ...end };
    if (totalDistance > maxDistance) {
        const ratio = maxDistance / totalDistance;
        adjustedEnd = {
            lat: start.lat + (end.lat - start.lat) * ratio,
            lon: start.lon + (end.lon - start.lon) * ratio
        };
    }
    
    // Calculate midpoint
    const midLat = (start.lat + adjustedEnd.lat) / 2;
    const midLon = (start.lon + adjustedEnd.lon) / 2;
    
    // Create control point offset perpendicular to the line for curve
    const dx = adjustedEnd.lon - start.lon;
    const dy = adjustedEnd.lat - start.lat;
    const lineDist = Math.sqrt(dx * dx + dy * dy);
    
    // Calculate perpendicular angle (rotate 90 degrees)
    const lineAngle = Math.atan2(dy, dx);
    const perpendicularAngle = lineAngle + Math.PI / 2;
    
    // Control point offset: 40-80% of distance, perpendicular to line
    // Increased curvature for more pronounced curves
    const curvatureFactor = 0.4 + Math.random() * 0.4; // 40-80%
    const curvatureDist = curvatureFactor * lineDist * 0.5; // Increased from 0.3 to 0.5 for more curves
    
    // Convert curvature distance to lat/lon offset
    const offsetLat = (curvatureDist / 111) * Math.cos(perpendicularAngle);
    const offsetLon = (curvatureDist / 111) * Math.sin(perpendicularAngle) / Math.cos(midLat * Math.PI / 180);
    
    const controlPoint = {
        lat: midLat + offsetLat,
        lon: midLon + offsetLon
    };
    
    // Generate positions along Quadratic Bezier curve
    // P(t) = (1-t)²P₀ + 2(1-t)tP₁ + t²P₂
    for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const oneMinusT = 1 - t;
        
        // Quadratic Bezier interpolation
        const lat = oneMinusT * oneMinusT * start.lat + 
                    2 * oneMinusT * t * controlPoint.lat + 
                    t * t * adjustedEnd.lat;
        const lon = oneMinusT * oneMinusT * start.lon + 
                    2 * oneMinusT * t * controlPoint.lon + 
                    t * t * adjustedEnd.lon;
        
        // Calculate time offset based on ping frequency
        const timeOffset = i * pingFrequencySeconds * 1000; // Convert to milliseconds
        
        positions.push({ 
            lat, 
            lon, 
            timeOffset: timeOffset
        });
    }
    
    // Verify speed constraint by calculating total curve distance
    let totalCurveDistance = 0;
    for (let i = 1; i < positions.length; i++) {
        totalCurveDistance += distance(
            positions[i-1].lat, positions[i-1].lon,
            positions[i].lat, positions[i].lon
        );
    }
    
    // If curve is too long, scale down the control point
    if (totalCurveDistance > maxDistance) {
        const scaleFactor = maxDistance / totalCurveDistance;
        const adjustedControlPoint = {
            lat: midLat + offsetLat * scaleFactor,
            lon: midLon + offsetLon * scaleFactor
        };
        
        // Regenerate positions with scaled control point
        positions.length = 0;
        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const oneMinusT = 1 - t;
            
            const lat = oneMinusT * oneMinusT * start.lat + 
                        2 * oneMinusT * t * adjustedControlPoint.lat + 
                        t * t * adjustedEnd.lat;
            const lon = oneMinusT * oneMinusT * start.lon + 
                        2 * oneMinusT * t * adjustedControlPoint.lon + 
                        t * t * adjustedEnd.lon;
            
            // Calculate time offset based on ping frequency
            const timeOffset = i * pingFrequencySeconds * 1000; // Convert to milliseconds
            
            positions.push({ 
                lat, 
                lon, 
                timeOffset: timeOffset
            });
        }
    }
    
    return positions;
}

/**
 * Legacy function name for backward compatibility
 * @deprecated Use generateCurvedPath instead
 */
function generatePath(start, end, durationMinutes) {
    return generateCurvedPath(start, end, durationMinutes);
}

/**
 * Generate civilians - start near disaster and flee outward toward responders/safe houses
 * @param {number} count - Number of civilians to generate
 * @param {number} timeRangeMinutes - Time range for scenario
 * @param {Object} disasterPoint - Disaster point {lat, lon}
 * @param {Array} resources - Array of safe house resources
 * @param {Array} responders - Array of responder objects (can be empty initially)
 * @param {number} pingFrequencySeconds - How often to generate location points (in seconds)
 * @returns {Array} Array of civilian objects
 */
function generateCivilians(count, timeRangeMinutes, disasterPoint, resources, responders, pingFrequencySeconds = 10) {
    const civilians = [];
    const startTime = Date.now() - (timeRangeMinutes * 60000);
    
    // Helper to find nearest entity position
    const findNearestEntity = (startPos, entities) => {
        if (!entities || entities.length === 0) return null;
        let nearest = null;
        let minDist = Infinity;
        entities.forEach(entity => {
            const pos = entity.position || (entity.path && entity.path[entity.path.length - 1]);
            if (pos) {
                const dist = distance(startPos.lat, startPos.lon, pos.lat, pos.lon);
                if (dist < minDist) {
                    minDist = dist;
                    nearest = pos;
                }
            }
        });
        return nearest;
    };
    
    for (let i = 0; i < count; i++) {
        const entityId = generateUUID();
        
        // Start civilians 0.5-2 km from disaster point (fleeing from disaster)
        const startPos = getRandomPositionInRadius(disasterPoint, 0.5, 2.0);
        
        // Determine destination: flee outward from disaster
        let endPos = startPos;
        const rand = Math.random();
        
        if (rand < 0.6 && resources.length > 0) {
            // 60% move toward nearest safe house
            const nearestResource = findNearestEntity(startPos, resources);
            if (nearestResource) {
                endPos = nearestResource;
            } else {
                // Fallback: move away from disaster (2-5 km)
                const angle = Math.atan2(startPos.lon - disasterPoint.lon, startPos.lat - disasterPoint.lat);
                const distanceKm = 2 + Math.random() * 3; // 2-5 km
                endPos = getPositionAtDistanceFromPoint(startPos, distanceKm, angle);
            }
        } else if (rand < 0.9 && responders.length > 0) {
            // 30% move toward nearest responder location
            const nearestResponder = findNearestEntity(startPos, responders);
            if (nearestResponder) {
                endPos = nearestResponder;
            } else {
                // Fallback: move away from disaster
                const angle = Math.atan2(startPos.lon - disasterPoint.lon, startPos.lat - disasterPoint.lat);
                const distanceKm = 2 + Math.random() * 3;
                endPos = getPositionAtDistanceFromPoint(startPos, distanceKm, angle);
            }
        } else {
            // 10% move to random position away from disaster (2-5 km)
            const angle = Math.atan2(startPos.lon - disasterPoint.lon, startPos.lat - disasterPoint.lat);
            const distanceKm = 2 + Math.random() * 3; // 2-5 km
            endPos = getPositionAtDistanceFromPoint(startPos, distanceKm, angle);
        }
        
        // Use curved path for natural movement
        const path = generateCurvedPath(startPos, endPos, timeRangeMinutes, pingFrequencySeconds);
        
        civilians.push({
            entityId,
            entityType: 'civilian',
            name: `Civilian ${i + 1}`,
            path,
            startTime
        });
    }
    
    return civilians;
}

/**
 * Generate responders - start away from disaster and move inward toward incidents/civilians
 * @param {number} count - Number of responders to generate
 * @param {number} timeRangeMinutes - Time range for scenario
 * @param {Object} disasterPoint - Disaster point {lat, lon}
 * @param {Array} incidents - Array of incident objects
 * @param {Array} civilians - Array of civilian objects (can be empty initially)
 * @param {number} pingFrequencySeconds - How often to generate location points (in seconds)
 * @returns {Array} Array of responder objects
 */
function generateResponders(count, timeRangeMinutes, disasterPoint, incidents, civilians, pingFrequencySeconds = 10) {
    const responders = [];
    const startTime = Date.now() - (timeRangeMinutes * 60000);
    
    // Helper to find nearest entity position
    const findNearestEntity = (startPos, entities) => {
        if (!entities || entities.length === 0) return null;
        let nearest = null;
        let minDist = Infinity;
        entities.forEach(entity => {
            const pos = entity.position || (entity.path && entity.path[entity.path.length - 1]);
            if (pos) {
                const dist = distance(startPos.lat, startPos.lon, pos.lat, pos.lon);
                if (dist < minDist) {
                    minDist = dist;
                    nearest = pos;
                }
            }
        });
        return nearest;
    };
    
    // Helper to find nearest civilian cluster (average position of nearby civilians)
    const findNearestCivilianCluster = (startPos, civilians) => {
        if (!civilians || civilians.length === 0) return null;
        
        // Group civilians by proximity
        const clusters = [];
        const used = new Set();
        
        civilians.forEach((civilian, idx) => {
            if (used.has(idx)) return;
            const pos = civilian.path && civilian.path[0]; // Start position
            if (!pos) return;
            
            const cluster = [pos];
            used.add(idx);
            
            // Find nearby civilians (within 0.5 km)
            civilians.forEach((other, otherIdx) => {
                if (otherIdx === idx || used.has(otherIdx)) return;
                const otherPos = other.path && other.path[0];
                if (otherPos && distance(pos.lat, pos.lon, otherPos.lat, otherPos.lon) < 0.5) {
                    cluster.push(otherPos);
                    used.add(otherIdx);
                }
            });
            
            if (cluster.length > 0) {
                // Average position of cluster
                const avgLat = cluster.reduce((sum, p) => sum + p.lat, 0) / cluster.length;
                const avgLon = cluster.reduce((sum, p) => sum + p.lon, 0) / cluster.length;
                clusters.push({ lat: avgLat, lon: avgLon, size: cluster.length });
            }
        });
        
        // Find nearest cluster
        let nearest = null;
        let minDist = Infinity;
        clusters.forEach(cluster => {
            const dist = distance(startPos.lat, startPos.lon, cluster.lat, cluster.lon);
            if (dist < minDist) {
                minDist = dist;
                nearest = { lat: cluster.lat, lon: cluster.lon };
            }
        });
        
        return nearest;
    };
    
    for (let i = 0; i < count; i++) {
        const entityId = generateUUID();
        
        // Start responders 3-6 km from disaster point (behind safe houses, away from disaster)
        let startPos = getRandomPositionInRadius(disasterPoint, 3, 6);
        
        // Determine destination: move inward toward disaster area
        let endPos = startPos;
        const rand = Math.random();
        
        if (rand < 0.5 && incidents.length > 0) {
            // 50% move toward nearest incident
            const nearestIncident = findNearestEntity(startPos, incidents);
            if (nearestIncident) {
                endPos = nearestIncident;
            } else {
                // Fallback: move toward disaster point
                endPos = getRandomPositionInRadius(disasterPoint, 0.5, 2.0);
            }
        } else if (rand < 0.8 && civilians.length > 0) {
            // 30% move toward nearest civilian cluster
            const nearestCluster = findNearestCivilianCluster(startPos, civilians);
            if (nearestCluster) {
                endPos = nearestCluster;
            } else {
                // Fallback: use first civilian start position
                const firstCivilian = civilians[0];
                if (firstCivilian && firstCivilian.path && firstCivilian.path[0]) {
                    endPos = firstCivilian.path[0];
                } else {
                    endPos = getRandomPositionInRadius(disasterPoint, 0.5, 2.0);
                }
            }
        } else {
            // 20% move toward disaster point
            endPos = getRandomPositionInRadius(disasterPoint, 0.5, 2.0);
        }
        
        // Use curved path for natural movement
        const path = generateCurvedPath(startPos, endPos, timeRangeMinutes, pingFrequencySeconds);
        
        responders.push({
            entityId,
            entityType: 'responder',
            name: `Responder Team ${i + 1}`,
            path,
            startTime
        });
    }
    
    return responders;
}

/**
 * Generate resources (safe houses) - positioned away from disaster, behind responders
 * @param {number} count - Number of safe houses to generate
 * @param {number} timeRangeMinutes - Time range for scenario
 * @param {Object} disasterPoint - Disaster point {lat, lon}
 * @returns {Array} Array of resource objects
 */
function generateResources(count, timeRangeMinutes, disasterPoint) {
    const resources = [];
    const startTime = Date.now() - (timeRangeMinutes * 60000);
    
    for (let i = 0; i < count; i++) {
        const entityId = generateUUID();
        
        // Position safe houses 4-8 km away from disaster point
        // Distribute in multiple directions (use angles for distribution)
        const angle = (i * (2 * Math.PI / Math.max(count, 6))) + (Math.random() * 0.3); // Distribute evenly with slight randomness
        const distanceKm = 4 + Math.random() * 4; // 4-8 km
        const position = getPositionAtDistanceFromPoint(disasterPoint, distanceKm, angle);
        
        // Safe houses appear early in scenario (within first 30% of time range)
        const appearTime = startTime + Math.random() * (timeRangeMinutes * 0.3) * 60000;
        
        resources.push({
            entityId,
            entityType: 'resource',
            name: `Safe House ${i + 1}`,
            position,
            appearTime,
            startTime
        });
    }
    
    return resources;
}

/**
 * Generate incidents - clustered around disaster point
 * @param {number} count - Number of incidents to generate
 * @param {number} timeRangeMinutes - Time range for scenario
 * @param {Object} disasterPoint - Disaster point {lat, lon}
 * @returns {Array} Array of incident objects
 */
function generateIncidents(count, timeRangeMinutes, disasterPoint) {
    const incidents = [];
    const startTime = Date.now() - (timeRangeMinutes * 60000);
    
    const incidentTypes = ['Building Collapse', 'Fire', 'Medical Emergency', 'Traffic Accident'];
    
    for (let i = 0; i < count; i++) {
        const entityId = generateUUID();
        
        // Position incidents 0.3-1.5 km from disaster point (clustered around disaster)
        const position = getRandomPositionInRadius(disasterPoint, 0.3, 1.5);
        
        // Incidents appear early-mid scenario (within first 70% of time range)
        const appearTime = startTime + Math.random() * (timeRangeMinutes * 0.7) * 60000;
        
        incidents.push({
            entityId,
            entityType: 'incident',
            name: incidentTypes[i % incidentTypes.length],
            position,
            appearTime,
            startTime
        });
    }
    
    return incidents;
}

/**
 * Generate hazards - tightly clustered around disaster point
 * @param {number} count - Number of hazards to generate
 * @param {number} timeRangeMinutes - Time range for scenario
 * @param {Object} disasterPoint - Disaster point {lat, lon}
 * @returns {Array} Array of hazard objects
 */
function generateHazards(count, timeRangeMinutes, disasterPoint) {
    const hazards = [];
    const startTime = Date.now() - (timeRangeMinutes * 60000);
    
    const hazardTypes = ['Flood Zone', 'Gas Leak', 'Unstable Structure', 'Chemical Spill'];
    
    for (let i = 0; i < count; i++) {
        const entityId = generateUUID();
        
        // Position hazards 0.2-1.0 km from disaster point (closer than incidents)
        const position = getRandomPositionInRadius(disasterPoint, 0.2, 1.0);
        
        // Hazards appear very early in scenario (within first 30% of time range)
        const appearTime = startTime + Math.random() * (timeRangeMinutes * 0.3) * 60000;
        
        hazards.push({
            entityId,
            entityType: 'hazard',
            name: hazardTypes[i % hazardTypes.length],
            position,
            appearTime,
            startTime
        });
    }
    
    return hazards;
}

/**
 * Main scenario generation function
 */
function generateScenario(params) {
    const {
        civilians,
        responders,
        resources,
        incidents,
        hazards,
        timeRangeMinutes
    } = params;
    
    console.log('[Scenario] Generating scenario...', params);
    
    // Define disaster point at center of Berlin
    const disasterPoint = DISASTER_POINT;
    console.log(`[Scenario] Disaster point: (${disasterPoint.lat}, ${disasterPoint.lon})`);
    
    // Generate all entities in order (static first, then dynamic)
    // Static entities appear at fixed locations
    const resourcesList = generateResources(resources, timeRangeMinutes, disasterPoint);
    const incidentsList = generateIncidents(incidents, timeRangeMinutes, disasterPoint);
    const hazardsList = generateHazards(hazards, timeRangeMinutes, disasterPoint);
    
    // Get ping frequency from params (default to 10 seconds)
    const pingFrequencySeconds = params.pingFrequencySeconds || 10;
    
    // Generate responders first (civilians may reference them)
    const respondersList = generateResponders(responders, timeRangeMinutes, disasterPoint, incidentsList, [], pingFrequencySeconds);
    
    // Generate civilians (they can reference resources and responders)
    const civiliansList = generateCivilians(civilians, timeRangeMinutes, disasterPoint, resourcesList, respondersList, pingFrequencySeconds);
    
    // Now update responders with civilian information for better routing
    // (In future, could regenerate responders with civilian clusters, but for now keep as is)
    
    // Collect all events with timestamps
    const events = [];
    
    // Add resource appearances
    resourcesList.forEach(r => {
        events.push({
            ...r,
            action: 'appear',
            created_at: r.appearTime
        });
    });
    
    // Add incident appearances
    incidentsList.forEach(i => {
        events.push({
            ...i,
            action: 'appear',
            created_at: i.appearTime
        });
    });
    
    // Add hazard appearances
    hazardsList.forEach(h => {
        events.push({
            ...h,
            action: 'appear',
            created_at: h.appearTime
        });
    });
    
    // Add civilian movements
    civiliansList.forEach(c => {
        c.path.forEach((pos, idx) => {
            events.push({
                entityId: c.entityId,
                entityType: c.entityType,
                name: c.name,
                position: pos,
                created_at: c.startTime + pos.timeOffset,
                action: 'move'
            });
        });
    });
    
    // Add responder movements
    respondersList.forEach(r => {
        r.path.forEach((pos, idx) => {
            events.push({
                entityId: r.entityId,
                entityType: r.entityType,
                name: r.name,
                position: pos,
                created_at: r.startTime + pos.timeOffset,
                action: 'move'
            });
        });
    });
    
    // Sort events by timestamp
    events.sort((a, b) => a.created_at - b.created_at);
    
    console.log(`[Scenario] Generated ${events.length} events`);
    return events;
}

/**
 * Send events to server in batches
 */
async function sendScenarioEvents(events, onProgress, batchSize = 100) {
    let totalSent = 0;
    const total = events.length;
    const batches = [];
    
    // Track events per entity_id
    const entityStats = new Map();
    
    // Initialize entity stats from events
    events.forEach(event => {
        if (!entityStats.has(event.entityId)) {
            entityStats.set(event.entityId, {
                entityId: event.entityId,
                entityType: event.entityType,
                name: event.name || null,
                eventCount: 0,
                events: []
            });
        }
        const stats = entityStats.get(event.entityId);
        stats.eventCount++;
        stats.events.push({
            created_at: event.created_at,
            position: event.position,
            action: event.action || 'move'
        });
    });
    
    // Split events into batches
    for (let i = 0; i < events.length; i += batchSize) {
        batches.push(events.slice(i, i + batchSize));
    }
    
    console.log(`[Scenario] Sending ${events.length} events in ${batches.length} batches`);
    
    for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
        const batch = batches[batchIdx];
        
        try {
            // Convert events to location format
            const locations = batch.map(event => ({
                entity_type: event.entityType,
                entity_id: event.entityId,
                position: {
                    lat: event.position.lat,
                    lon: event.position.lon
                },
                metadata: {
                    name: event.name,
                    scenario: true
                },
                created_at: event.created_at
            }));
            
            // Send batch
            const result = await sendLocationsBatch(locations);
            
            if (result.success) {
                totalSent += result.created;
                console.log(`[Scenario] Batch ${batchIdx + 1}/${batches.length}: ${result.created} sent, ${result.failed} failed`);
                
                if (result.errors && result.errors.length > 0) {
                    console.warn(`[Scenario] Batch errors:`, result.errors);
                }
            } else {
                console.error(`[Scenario] Batch ${batchIdx + 1} failed:`, result.error);
            }
            
            if (onProgress) {
                onProgress(totalSent, total);
            }
            
            // Small delay between batches
            if (batchIdx < batches.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            
        } catch (error) {
            console.error(`[Scenario] Error sending batch ${batchIdx + 1}:`, error);
        }
    }
    
    // Convert Map to array for easier display
    const entityStatsArray = Array.from(entityStats.values());
    
    // Log per entity statistics
    console.log('[Scenario] Per-entity event summary:');
    entityStatsArray.forEach(stats => {
        const nameStr = stats.name ? ` (${stats.name})` : '';
        console.log(`  ${stats.entityType} ${stats.entityId}${nameStr}: ${stats.eventCount} events`);
        stats.events.forEach((event, idx) => {
            const time = new Date(event.created_at).toISOString();
            console.log(`    [${idx + 1}] ${time} - ${event.action} at (${event.position.lat.toFixed(6)}, ${event.position.lon.toFixed(6)})`);
        });
    });
    
    return { 
        sent: totalSent, 
        total, 
        batches: batches.length,
        entityStats: entityStatsArray
    };
}

// UI Integration
if (typeof window !== 'undefined') {
    let isGenerating = false;
    let stopRequested = false;
    let scenarioTimeRange = null; // Store scenario time range for deep sync
    
    document.addEventListener('DOMContentLoaded', function() {
        const generateBtn = document.getElementById('generateBtn');
        const stopBtn = document.getElementById('stopBtn');
        const deepSyncBtn = document.getElementById('deepSyncBtn');
        const statusDiv = document.getElementById('status');
        
        if (!generateBtn || !stopBtn || !deepSyncBtn || !statusDiv) {
            console.error('[Scenario] Required DOM elements not found');
            return;
        }
        
        generateBtn.addEventListener('click', async function() {
            if (isGenerating) {
                return;
            }
            
            isGenerating = true;
            stopRequested = false;
            generateBtn.disabled = true;
            stopBtn.classList.remove('hidden');
            statusDiv.innerHTML = '<div class="text-blue-600">Generating scenario...</div>';
            
            try {
                // Get form values
                const timeRangeMinutes = parseInt(document.getElementById('timeRange').value) || 30;
                const pingFrequencySeconds = parseInt(document.getElementById('pingFrequency').value) || 10;
                
                // Calculate expected points per entity for display
                const expectedPointsPerEntity = Math.floor((timeRangeMinutes * 60) / pingFrequencySeconds);
                
                const params = {
                    civilians: parseInt(document.getElementById('civilians').value) || 0,
                    responders: parseInt(document.getElementById('responders').value) || 0,
                    resources: parseInt(document.getElementById('resources').value) || 0,
                    incidents: parseInt(document.getElementById('incidents').value) || 0,
                    hazards: parseInt(document.getElementById('hazards').value) || 0,
                    timeRangeMinutes: timeRangeMinutes,
                    pingFrequencySeconds: pingFrequencySeconds
                };
                
                // Show expected points in status
                statusDiv.innerHTML = `<div class="text-blue-600">Generating scenario...</div>`;
                statusDiv.innerHTML += `<div class="text-sm text-gray-600 mt-2">Expected ${expectedPointsPerEntity} location points per responder/civilian (${timeRangeMinutes} min ÷ ${pingFrequencySeconds}s)</div>`;
                
                // Store scenario time range for deep sync
                const now = Date.now();
                scenarioTimeRange = {
                    startTime: now - (timeRangeMinutes * 60000),
                    endTime: now,
                    timeRangeMinutes: timeRangeMinutes
                };
                
                // Generate scenario
                const events = generateScenario(params);
                
                if (stopRequested) {
                    statusDiv.innerHTML = '<div class="text-gray-600">Scenario generation cancelled.</div>';
                    return;
                }
                
                // Send events
                statusDiv.innerHTML = '<div class="text-blue-600">Sending events to server...</div>';
                
                const result = await sendScenarioEvents(events, (sent, total) => {
                    const percent = Math.round((sent / total) * 100);
                    statusDiv.innerHTML = `<div class="text-blue-600">Sending events... ${sent}/${total} (${percent}%)</div>`;
                });
                
                if (stopRequested) {
                    statusDiv.innerHTML = '<div class="text-gray-600">Scenario generation cancelled.</div>';
                } else {
                    // Build detailed output showing events per entity
                    let outputHTML = `<div class="text-green-600 font-medium mb-4">Scenario generated successfully! Sent ${result.sent} events in ${result.batches} batches.</div>`;
                    
                    if (result.entityStats && result.entityStats.length > 0) {
                        outputHTML += '<div class="mt-4 space-y-3">';
                        outputHTML += '<div class="text-sm font-semibold text-gray-700 mb-2">Per-entity event summary:</div>';
                        
                        result.entityStats.forEach(stats => {
                            const nameStr = stats.name ? ` <span class="text-blue-600 font-medium">(${stats.name})</span>` : '';
                            const colorClasses = getEntityTypeColors(stats.entityType);
                            outputHTML += `<div class="bg-gray-50 rounded p-3 border border-gray-200">`;
                            outputHTML += `<div class="font-medium text-gray-900 mb-2">`;
                            outputHTML += `<span class="inline-block px-2 py-1 text-xs font-semibold rounded ${colorClasses.bg} ${colorClasses.text} mr-2">${stats.entityType}</span>`;
                            outputHTML += `<span class="font-mono text-xs text-gray-600">${stats.entityId}</span>${nameStr}`;
                            outputHTML += `<span class="ml-2 text-gray-600">(${stats.eventCount} events)</span>`;
                            outputHTML += `</div>`;
                            outputHTML += `<div class="text-xs text-gray-600 space-y-1 max-h-32 overflow-y-auto">`;
                            stats.events.forEach((event, idx) => {
                                const time = new Date(event.created_at).toLocaleString();
                                outputHTML += `<div>${idx + 1}. ${time} - ${event.action} at (${event.position.lat.toFixed(6)}, ${event.position.lon.toFixed(6)})</div>`;
                            });
                            outputHTML += `</div>`;
                            outputHTML += `</div>`;
                        });
                        
                        outputHTML += '</div>';
                    }
                    
                    statusDiv.innerHTML = outputHTML;
                    
                    // Show Deep Sync button after successful generation
                    deepSyncBtn.classList.remove('hidden');
                }
                
            } catch (error) {
                console.error('[Scenario] Error:', error);
                statusDiv.innerHTML = `<div class="text-red-600">Error: ${error.message}</div>`;
                deepSyncBtn.classList.add('hidden');
            } finally {
                isGenerating = false;
                generateBtn.disabled = false;
                stopBtn.classList.add('hidden');
            }
        });
        
        stopBtn.addEventListener('click', function() {
            stopRequested = true;
            statusDiv.innerHTML = '<div class="text-orange-600">Stopping scenario generation...</div>';
        });
        
        // Deep Sync button handler
        let isDeepSyncing = false;
        deepSyncBtn.addEventListener('click', async function() {
            if (isDeepSyncing || !scenarioTimeRange) {
                return;
            }
            
            isDeepSyncing = true;
            deepSyncBtn.disabled = true;
            statusDiv.innerHTML = '<div class="text-purple-600">Starting deep sync...</div>';
            
            try {
                const { startTime, endTime, timeRangeMinutes } = scenarioTimeRange;
                const startTimeStr = new Date(startTime).toLocaleString();
                const endTimeStr = new Date(endTime).toLocaleString();
                
                statusDiv.innerHTML = `<div class="text-purple-600 mb-2">Deep syncing with all nodes...</div>`;
                statusDiv.innerHTML += `<div class="text-sm text-gray-600 mb-2">Time range: ${startTimeStr} to ${endTimeStr} (${timeRangeMinutes} minutes)</div>`;
                
                // Perform deep sync
                const result = await deepSyncAllNodes(startTime, endTime);
                
                // Display results
                let outputHTML = `<div class="text-purple-600 font-medium mb-4">Deep sync completed!</div>`;
                outputHTML += `<div class="mb-4">`;
                outputHTML += `<div class="text-sm text-gray-700 mb-1">Time range: ${startTimeStr} to ${endTimeStr}</div>`;
                outputHTML += `<div class="text-sm text-gray-700 mb-1">Nodes synced: ${result.synced}/${result.total}</div>`;
                outputHTML += `<div class="text-sm text-gray-700 mb-1">Total locations retrieved: ${result.totalCount}</div>`;
                
                if (result.errors && result.errors.length > 0) {
                    outputHTML += `<div class="text-sm text-red-600 mb-2">Errors: ${result.errors.length}</div>`;
                    outputHTML += `<div class="text-xs text-red-600 space-y-1 mb-2">`;
                    result.errors.forEach(err => {
                        outputHTML += `<div>Node ${err.nodeId}: ${err.error}</div>`;
                    });
                    outputHTML += `</div>`;
                }
                outputHTML += `</div>`;
                
                // Add per-node statistics if available
                if (result.nodeStats) {
                    outputHTML += `<div class="mt-4 space-y-2">`;
                    outputHTML += `<div class="text-sm font-semibold text-gray-700 mb-2">Per-node sync statistics:</div>`;
                    result.nodeStats.forEach(nodeStat => {
                        const statusColor = nodeStat.success ? 'text-green-600' : 'text-red-600';
                        outputHTML += `<div class="bg-gray-50 rounded p-2 border border-gray-200">`;
                        outputHTML += `<div class="text-xs ${statusColor} font-medium">Node ${nodeStat.nodeId}: ${nodeStat.count} location(s)</div>`;
                        if (nodeStat.error) {
                            outputHTML += `<div class="text-xs text-red-600">Error: ${nodeStat.error}</div>`;
                        }
                        outputHTML += `</div>`;
                    });
                    outputHTML += `</div>`;
                }
                
                statusDiv.innerHTML = outputHTML;
                
            } catch (error) {
                console.error('[Scenario] Deep sync error:', error);
                statusDiv.innerHTML = `<div class="text-red-600">Deep sync error: ${error.message}</div>`;
            } finally {
                isDeepSyncing = false;
                deepSyncBtn.disabled = false;
            }
        });
    });
}

/**
 * Get color classes for entity type (bg and text)
 */
function getEntityTypeColors(entityType) {
    const colors = {
        'responder': { bg: 'bg-blue-100', text: 'text-blue-800' },
        'civilian': { bg: 'bg-green-100', text: 'text-green-800' },
        'resource': { bg: 'bg-purple-100', text: 'text-purple-800' },
        'incident': { bg: 'bg-red-100', text: 'text-red-800' },
        'hazard': { bg: 'bg-orange-100', text: 'text-orange-800' }
    };
    return colors[entityType] || { bg: 'bg-gray-100', text: 'text-gray-800' };
}

// Export for use in HTML
if (typeof window !== 'undefined') {
    window.ScenarioGenerator = {
        generateScenario,
        sendScenarioEvents
    };
}

