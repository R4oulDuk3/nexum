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
    
    console.log(`[MapControl] UI elements found:`, {
        updateConfigBtn: !!updateConfigBtn,
        syncBtn: !!syncBtn,
        checkboxes: checkboxes.length
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
                const { setEntityTypesToShow } = await import('./map-config.js');

                const selectedTypes = Array.from(checkboxes)
                    .filter(cb => cb.checked)
                    .map(cb => cb.value);

                await setEntityTypesToShow(mapId, selectedTypes);
                console.log('Config updated for map:', mapId, selectedTypes);
                
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
