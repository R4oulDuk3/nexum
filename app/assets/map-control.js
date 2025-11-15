/**
 * Map Control Component
 * 
 * JavaScript functionality for map control component.
 * Works with the map_control.html template component.
 */

/**
 * Initialize map control for a specific map
 * @param {string} mapId - Map ID (used to identify the control instance)
 * @param {maplibregl.Map} map - MapLibre map instance
 */
export async function initMapControl(mapId, map) {
    console.log(`[MapControl] Initializing map control for mapId: ${mapId}`);
    
    if (!mapId || !map) {
        console.error('[MapControl] Initialization failed: mapId and map are required');
        throw new Error('mapId and map are required');
    }

    const control = document.getElementById(`map-control-${mapId}`);
    if (!control) {
        console.error(`[MapControl] Initialization failed: Map control with id "map-control-${mapId}" not found`);
        throw new Error(`Map control with id "map-control-${mapId}" not found`);
    }
    console.log(`[MapControl] Map control element found: map-control-${mapId}`);

    const updateConfigBtn = document.getElementById(`update-config-btn-${mapId}`);
    const syncBtn = document.getElementById(`sync-btn-${mapId}`);
    const checkboxes = control.querySelectorAll('.entity-type-checkbox');
    const traceCheckbox = control.querySelector('.trace-checkbox');
    const timeFromSlider = document.getElementById(`time-from-slider-${mapId}`);
    const timeUntilSlider = document.getElementById(`time-until-slider-${mapId}`);
    const timeFromValue = document.getElementById(`time-from-value-${mapId}`);
    const timeUntilValue = document.getElementById(`time-until-value-${mapId}`);
    
    console.log(`[MapControl] UI elements found:`, {
        updateConfigBtn: !!updateConfigBtn,
        syncBtn: !!syncBtn,
        checkboxes: checkboxes.length,
        traceCheckbox: !!traceCheckbox,
        timeFromSlider: !!timeFromSlider,
        timeUntilSlider: !!timeUntilSlider
    });

    // Load config and update checkboxes
    async function loadConfig() {
        try {
            console.log(`[MapControl] Loading config for mapId: ${mapId}`);
            const { getMapConfig } = await import('./map-config.js');
            const config = await getMapConfig(mapId);
            
            // Default to all types if no config or empty config
            const allTypes = ['responder', 'civilian', 'incident', 'resource', 'hazard'];
            const selectedTypes = (config && config.entity_types_to_show && config.entity_types_to_show.length > 0) 
                ? config.entity_types_to_show 
                : allTypes;

            console.log(`[MapControl] Config loaded. Selected entity types:`, selectedTypes);
            
            let checkedCount = 0;
            checkboxes.forEach(checkbox => {
                const wasChecked = checkbox.checked;
                checkbox.checked = selectedTypes.includes(checkbox.value);
                if (checkbox.checked) checkedCount++;
                
                if (wasChecked !== checkbox.checked) {
                    console.log(`[MapControl] Checkbox ${checkbox.value} set to ${checkbox.checked ? 'checked' : 'unchecked'}`);
                }
            });
            
            console.log(`[MapControl] Updated ${checkboxes.length} checkboxes (${checkedCount} checked)`);
            
            // Load show_traces checkbox state
            if (traceCheckbox) {
                const showTraces = config && config.show_traces !== undefined ? config.show_traces : false;
                traceCheckbox.checked = showTraces;
                console.log(`[MapControl] Trace checkbox set to ${showTraces ? 'checked' : 'unchecked'}`);
            }
            
            // Load time filter sliders
            if (timeFromSlider && timeFromValue) {
                const timeFromMinutes = config && config.time_from_minutes !== undefined ? config.time_from_minutes : -120;
                timeFromSlider.value = timeFromMinutes;
                timeFromValue.textContent = `${timeFromMinutes} min`;
                console.log(`[MapControl] Time from slider set to ${timeFromMinutes} min`);
            }
            
            if (timeUntilSlider && timeUntilValue) {
                const timeUntilMinutes = config && config.time_until_minutes !== undefined ? config.time_until_minutes : 0;
                timeUntilSlider.value = timeUntilMinutes;
                timeUntilValue.textContent = `${timeUntilMinutes} min`;
                console.log(`[MapControl] Time until slider set to ${timeUntilMinutes} min`);
            }
        } catch (error) {
            console.error(`[MapControl] Error loading map config for ${mapId}:`, error);
            // On error, default to all checked
            checkboxes.forEach(checkbox => {
                checkbox.checked = true;
            });
            console.log(`[MapControl] Defaulted all ${checkboxes.length} checkboxes to checked due to error`);
        }
    }

    // Refresh map markers and update status bar
    async function refreshMap() {
        try {
            const { refreshMapMarkers } = await import('./maplibre-map.js');
            await refreshMapMarkers(map, mapId);
            
            // Update status bar if available
            if (typeof window.updateStatusBar === 'function') {
                await window.updateStatusBar();
            }
        } catch (error) {
            console.error('Error refreshing map:', error);
            throw error;
        }
    }

    // Update Config button handler
    if (updateConfigBtn) {
        console.log(`[MapControl] Update Config button found and registered for mapId: ${mapId}`);
        let isUpdating = false;
        updateConfigBtn.addEventListener('click', async () => {
            if (isUpdating) return;

            isUpdating = true;
            updateConfigBtn.disabled = true;
            updateConfigBtn.textContent = 'Updating...';

            try {
                const { setMapConfig } = await import('./map-config.js');

                const selectedTypes = Array.from(checkboxes)
                    .filter(cb => cb.checked)
                    .map(cb => cb.value);

                const showTraces = traceCheckbox ? traceCheckbox.checked : false;
                
                // Get time filter values
                let timeFromMinutes = timeFromSlider ? parseInt(timeFromSlider.value, 10) : -120;
                let timeUntilMinutes = timeUntilSlider ? parseInt(timeUntilSlider.value, 10) : 0;
                
                // Validate: time_from <= time_until (adjust if needed)
                if (timeFromMinutes > timeUntilMinutes) {
                    // Swap values if from > until
                    const temp = timeFromMinutes;
                    timeFromMinutes = timeUntilMinutes;
                    timeUntilMinutes = temp;
                    
                    // Update sliders and displays
                    if (timeFromSlider) {
                        timeFromSlider.value = timeFromMinutes;
                        if (timeFromValue) timeFromValue.textContent = `${timeFromMinutes} min`;
                    }
                    if (timeUntilSlider) {
                        timeUntilSlider.value = timeUntilMinutes;
                        if (timeUntilValue) timeUntilValue.textContent = `${timeUntilMinutes} min`;
                    }
                    
                    console.log(`[MapControl] Adjusted time filter: from ${timeFromMinutes} to ${timeUntilMinutes} min`);
                }

                await setMapConfig(mapId, {
                    entity_types_to_show: selectedTypes,
                    show_traces: showTraces,
                    time_from_minutes: timeFromMinutes,
                    time_until_minutes: timeUntilMinutes
                });
                console.log('Config updated for map:', mapId, { 
                    entity_types_to_show: selectedTypes, 
                    show_traces: showTraces,
                    time_from_minutes: timeFromMinutes,
                    time_until_minutes: timeUntilMinutes
                });
                
                // Refresh map after config update
                await refreshMap();
            } catch (error) {
                console.error('Error updating map config:', error);
                alert('Error updating config: ' + error.message);
            } finally {
                isUpdating = false;
                updateConfigBtn.disabled = false;
                updateConfigBtn.textContent = 'Update Config';
            }
        });
    } else {
        console.warn(`[MapControl] Update Config button not found for mapId: ${mapId}`);
    }

    // Sync button handler
    if (syncBtn) {
        console.log(`[MapControl] Sync button found and registered for mapId: ${mapId}`);
        let isSyncing = false;
        syncBtn.addEventListener('click', async () => {
            if (isSyncing) return;

            isSyncing = true;
            syncBtn.disabled = true;
            syncBtn.textContent = 'Syncing...';

            try {
                const { syncAllNodes } = await import('./location-sync.js');

                // Sync from server
                const result = await syncAllNodes();
                console.log('Sync completed:', result);

                // Refresh map after sync
                await refreshMap();

                // Show success message
                if (result.errors && result.errors.length > 0) {
                    alert(`Synced ${result.synced}/${result.total} nodes. ${result.totalCount} locations updated. ${result.errors.length} errors occurred.`);
                } else {
                    alert(`Synced ${result.synced}/${result.total} nodes. ${result.totalCount} locations updated.`);
                }
            } catch (error) {
                console.error('Error syncing from server:', error);
                alert('Error syncing from server: ' + error.message);
            } finally {
                isSyncing = false;
                syncBtn.disabled = false;
                syncBtn.textContent = 'Sync from Server';
            }
        });
    } else {
        console.warn(`[MapControl] Sync button not found for mapId: ${mapId}`);
    }

    // Add event listeners for time sliders to update display values in real-time
    if (timeFromSlider && timeFromValue) {
        timeFromSlider.addEventListener('input', (e) => {
            const value = parseInt(e.target.value, 10);
            timeFromValue.textContent = `${value} min`;
            
            // Ensure from <= until
            if (timeUntilSlider && value > parseInt(timeUntilSlider.value, 10)) {
                timeUntilSlider.value = value;
                if (timeUntilValue) timeUntilValue.textContent = `${value} min`;
            }
        });
    }
    
    if (timeUntilSlider && timeUntilValue) {
        timeUntilSlider.addEventListener('input', (e) => {
            const value = parseInt(e.target.value, 10);
            timeUntilValue.textContent = `${value} min`;
            
            // Ensure from <= until
            if (timeFromSlider && value < parseInt(timeFromSlider.value, 10)) {
                timeFromSlider.value = value;
                if (timeFromValue) timeFromValue.textContent = `${value} min`;
            }
        });
    }

    // Load initial config
    console.log(`[MapControl] Loading initial config for mapId: ${mapId}`);
    await loadConfig();

    // Expose methods
    control.refreshConfig = loadConfig;
    control.refreshMap = refreshMap;
    control.updateConfig = async () => {
        if (updateConfigBtn) updateConfigBtn.click();
    };
    
    console.log(`[MapControl] Map control initialized successfully for mapId: ${mapId}`);
    console.log(`[MapControl] Exposed methods: refreshConfig, refreshMap, updateConfig`);

    return control;
}
