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
 * Generate intermediate positions between start and end
 * Simulates realistic movement (walking speed ~5 km/h)
 */
function generatePath(start, end, durationMinutes) {
    const positions = [];
    const steps = Math.max(2, Math.floor(durationMinutes / 2)); // Update every 2 minutes
    const totalDistance = distance(start.lat, start.lon, end.lat, end.lon);
    const speedKmH = 5; // Walking speed
    const maxDistance = (speedKmH * durationMinutes) / 60; // Max distance in km
    
    // If destination is too far, create intermediate waypoint
    if (totalDistance > maxDistance) {
        const ratio = maxDistance / totalDistance;
        end = {
            lat: start.lat + (end.lat - start.lat) * ratio,
            lon: start.lon + (end.lon - start.lon) * ratio
        };
    }
    
    for (let i = 0; i <= steps; i++) {
        const progress = i / steps;
        const lat = start.lat + (end.lat - start.lat) * progress;
        const lon = start.lon + (end.lon - start.lon) * progress;
        positions.push({ lat, lon, timeOffset: (durationMinutes * progress) * 60000 });
    }
    
    return positions;
}

/**
 * Generate civilian scenario - starts scattered, some move toward resources
 */
function generateCivilians(count, timeRangeMinutes, resources) {
    const civilians = [];
    const startTime = Date.now() - (timeRangeMinutes * 60000);
    
    for (let i = 0; i < count; i++) {
        const entityId = generateUUID();
        const startPos = generateRandomBerlinPosition();
        
        // 70% chance civilian moves toward nearest resource
        let endPos = startPos;
        if (Math.random() < 0.7 && resources.length > 0) {
            const nearestResource = resources[Math.floor(Math.random() * resources.length)];
            endPos = nearestResource.position;
        } else {
            // Random movement
            endPos = generateRandomBerlinPosition();
        }
        
        const path = generatePath(startPos, endPos, timeRangeMinutes);
        
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
 * Generate responder scenario - start near incidents, patrol area
 */
function generateResponders(count, timeRangeMinutes, incidents) {
    const responders = [];
    const startTime = Date.now() - (timeRangeMinutes * 60000);
    
    for (let i = 0; i < count; i++) {
        const entityId = generateUUID();
        // Start near an incident or random
        let startPos = generateRandomBerlinPosition();
        if (incidents.length > 0 && Math.random() < 0.6) {
            const incident = incidents[Math.floor(Math.random() * incidents.length)];
            // Start 1-3km from incident
            const angle = Math.random() * Math.PI * 2;
            const dist = 1 + Math.random() * 2; // 1-3 km
            startPos = {
                lat: incident.position.lat + (dist / 111) * Math.cos(angle),
                lon: incident.position.lon + (dist / 111) * Math.cos(angle) / Math.cos(incident.position.lat * Math.PI / 180)
            };
        }
        
        // Patrol toward incident or random area
        let endPos = generateRandomBerlinPosition();
        if (incidents.length > 0 && Math.random() < 0.8) {
            const incident = incidents[Math.floor(Math.random() * incidents.length)];
            endPos = incident.position;
        }
        
        const path = generatePath(startPos, endPos, timeRangeMinutes);
        
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
 * Generate resources - appear at fixed locations at specific times
 */
function generateResources(count, timeRangeMinutes) {
    const resources = [];
    const startTime = Date.now() - (timeRangeMinutes * 60000);
    
    for (let i = 0; i < count; i++) {
        const entityId = generateUUID();
        const position = generateRandomBerlinPosition();
        // Appear at random time during scenario (but not at the very end)
        const appearTime = startTime + Math.random() * (timeRangeMinutes * 0.8) * 60000;
        
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
 * Generate incidents - appear at random times and locations
 */
function generateIncidents(count, timeRangeMinutes) {
    const incidents = [];
    const startTime = Date.now() - (timeRangeMinutes * 60000);
    
    const incidentTypes = ['Building Collapse', 'Fire', 'Medical Emergency', 'Traffic Accident'];
    
    for (let i = 0; i < count; i++) {
        const entityId = generateUUID();
        const position = generateRandomBerlinPosition();
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
 * Generate hazards - appear at fixed locations
 */
function generateHazards(count, timeRangeMinutes) {
    const hazards = [];
    const startTime = Date.now() - (timeRangeMinutes * 60000);
    
    const hazardTypes = ['Flood Zone', 'Gas Leak', 'Unstable Structure', 'Chemical Spill'];
    
    for (let i = 0; i < count; i++) {
        const entityId = generateUUID();
        const position = generateRandomBerlinPosition();
        // Hazards appear early in scenario
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
    
    // Generate all entities
    const resourcesList = generateResources(resources, timeRangeMinutes);
    const incidentsList = generateIncidents(incidents, timeRangeMinutes);
    const hazardsList = generateHazards(hazards, timeRangeMinutes);
    const civiliansList = generateCivilians(civilians, timeRangeMinutes, resourcesList);
    const respondersList = generateResponders(responders, timeRangeMinutes, incidentsList);
    
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
                const params = {
                    civilians: parseInt(document.getElementById('civilians').value) || 0,
                    responders: parseInt(document.getElementById('responders').value) || 0,
                    resources: parseInt(document.getElementById('resources').value) || 0,
                    incidents: parseInt(document.getElementById('incidents').value) || 0,
                    hazards: parseInt(document.getElementById('hazards').value) || 0,
                    timeRangeMinutes: timeRangeMinutes
                };
                
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

