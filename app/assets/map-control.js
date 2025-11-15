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
    if (!mapId || !map) {
        throw new Error('mapId and map are required');
    }

    const control = document.getElementById(`map-control-${mapId}`);
    if (!control) {
        throw new Error(`Map control with id "map-control-${mapId}" not found`);
    }

    const refreshBtn = document.getElementById(`refresh-btn-${mapId}`);
    const updateConfigBtn = document.getElementById(`update-config-btn-${mapId}`);
    const syncBtn = document.getElementById(`sync-btn-${mapId}`);
    const checkboxes = control.querySelectorAll('.entity-type-checkbox');

    // Load config and update checkboxes
    async function loadConfig() {
        try {
            const { getMapConfig } = await import('./map-config.js');
            const config = await getMapConfig(mapId);
            // If no config, default to all types selected
            const selectedTypes = config ? (config.entity_types_to_show || []) : ['responder', 'civilian', 'incident', 'resource', 'hazard'];

            checkboxes.forEach(checkbox => {
                checkbox.checked = selectedTypes.includes(checkbox.value);
            });
        } catch (error) {
            console.error('Error loading map config:', error);
            // On error, default to all checked
            checkboxes.forEach(checkbox => {
                checkbox.checked = true;
            });
        }
    }

    // Refresh button handler
    if (refreshBtn) {
        let isRefreshing = false;
        refreshBtn.addEventListener('click', async () => {
            if (isRefreshing) return;

            isRefreshing = true;
            refreshBtn.disabled = true;
            refreshBtn.textContent = 'Refreshing...';
            refreshBtn.style.background = '#9ca3af';
            refreshBtn.style.cursor = 'wait';

            try {
                const { refreshMapMarkers } = await import('./maplibre-map.js');
                await refreshMapMarkers(map, mapId);
            } catch (error) {
                console.error('Error refreshing map:', error);
                alert('Error refreshing map: ' + error.message);
            } finally {
                isRefreshing = false;
                refreshBtn.disabled = false;
                refreshBtn.textContent = 'Refresh';
                refreshBtn.style.background = '#3b82f6';
                refreshBtn.style.cursor = 'pointer';
            }
        });
    }

    // Update Config button handler
    if (updateConfigBtn) {
        let isUpdating = false;
        updateConfigBtn.addEventListener('click', async () => {
            if (isUpdating) return;

            isUpdating = true;
            updateConfigBtn.disabled = true;
            updateConfigBtn.textContent = 'Updating...';
            updateConfigBtn.style.background = '#9ca3af';
            updateConfigBtn.style.cursor = 'wait';

            try {
                const { setEntityTypesToShow } = await import('./map-config.js');

                const selectedTypes = Array.from(checkboxes)
                    .filter(cb => cb.checked)
                    .map(cb => cb.value);

                await setEntityTypesToShow(mapId, selectedTypes);
                console.log('Config updated for map:', mapId, selectedTypes);
            } catch (error) {
                console.error('Error updating map config:', error);
                alert('Error updating config: ' + error.message);
            } finally {
                isUpdating = false;
                updateConfigBtn.disabled = false;
                updateConfigBtn.textContent = 'Update Config';
                updateConfigBtn.style.background = '#10b981';
                updateConfigBtn.style.cursor = 'pointer';
            }
        });
    }

    // Sync button handler
    if (syncBtn) {
        let isSyncing = false;
        syncBtn.addEventListener('click', async () => {
            if (isSyncing) return;

            isSyncing = true;
            syncBtn.disabled = true;
            syncBtn.textContent = 'Syncing...';
            syncBtn.style.background = '#9ca3af';
            syncBtn.style.cursor = 'wait';

            try {
                const { syncAllNodes } = await import('./location-sync.js');
                const { refreshMapMarkers } = await import('./maplibre-map.js');

                // Sync from server
                const result = await syncAllNodes();
                console.log('Sync completed:', result);

                // Refresh map markers after sync
                await refreshMapMarkers(map, mapId);

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
                syncBtn.style.background = '#8b5cf6';
                syncBtn.style.cursor = 'pointer';
            }
        });
    }

    // Load initial config
    await loadConfig();

    // Expose methods
    control.refreshConfig = loadConfig;
    control.refreshMap = async () => {
        if (refreshBtn) refreshBtn.click();
    };
    control.updateConfig = async () => {
        if (updateConfigBtn) updateConfigBtn.click();
    };

    return control;
}
