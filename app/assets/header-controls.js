/**
 * Header Controls - Broadcast and sync status indicators, user type switch
 * 
 * Manages:
 * - Broadcast status indicator (shows GPS broadcasting status, auto-starts on load)
 * - Sync status indicator (shows mesh sync status, auto-starts on load)
 * - User type switch (responder/civilian)
 * - localStorage persistence for user type
 * - Auto-starts broadcasting and syncing when app opens
 * - Ping animations on successful broadcast and sync
 */

// Import dependencies
import * as LocationSender from './location-sender.js';
import { LocationTracker } from './location-tracker.js';
import { SyncTracker } from './location-sync-tracker.js';

// Constants for localStorage keys
const STORAGE_KEYS = {
    USER_TYPE: 'user_role'  // Same as location-sender.js uses
};

// Global tracker instances
let headerTracker = null;
let headerSyncTracker = null;
const TRACKING_INTERVAL = 5000; // 5 seconds
const SYNC_INTERVAL = 10000; // 10 seconds


/**
 * Get user type from localStorage
 * @returns {string} User type ('responder' or 'civilian')
 */
function getUserType() {
    return LocationSender.getUserRole();
}

/**
 * Set user type in localStorage
 * @param {string} userType - User type ('responder' or 'civilian')
 */
function setUserType(userType) {
    LocationSender.setUserRole(userType);
}

/**
 * Update broadcast status indicator UI
 * Shows broadcasting status with animated icon
 */
function updateBroadcastIndicator() {
    const indicator = document.getElementById('headerBroadcastBtn');
    const indicatorText = document.getElementById('broadcastBtnText');
    const icon = document.getElementById('broadcastIcon');
    
    if (!indicator) return;
    
    // Always show broadcasting state (since we auto-start)
    indicator.classList.remove('bg-green-600', 'hover:bg-green-700', 'bg-red-600', 'hover:bg-red-700');
    indicator.classList.add('bg-blue-600');
    
    if (indicatorText) {
        indicatorText.textContent = 'Broadcasting GPS';
    }
    
    // Show pulsing GPS indicator icon
    if (icon) {
        icon.setAttribute('fill', 'none');
        icon.setAttribute('viewBox', '0 0 24 24');
        icon.innerHTML = `
            <circle cx="12" cy="12" r="2" fill="currentColor" opacity="1">
                <animate attributeName="opacity" values="1;0.6;1" dur="1.5s" repeatCount="indefinite"/>
            </circle>
            <circle cx="12" cy="12" r="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.4">
                <animate attributeName="r" values="6;10;6" dur="1.5s" repeatCount="indefinite"/>
                <animate attributeName="opacity" values="0.4;0;0.4" dur="1.5s" repeatCount="indefinite"/>
            </circle>
            <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="1" opacity="0.3">
                <animate attributeName="r" values="10;14;10" dur="1.5s" repeatCount="indefinite" begin="0.25s"/>
                <animate attributeName="opacity" values="0.3;0;0.3" dur="1.5s" repeatCount="indefinite" begin="0.25s"/>
            </circle>
        `;
    }
}

/**
 * Trigger ping animation on successful broadcast
 * Creates a visual "ping" effect when data is sent successfully
 */
function triggerBroadcastPing() {
    const indicator = document.getElementById('headerBroadcastBtn');
    if (!indicator) return;
    
    // Add ping animation class
    indicator.classList.add('broadcast-ping');
    
    // Remove class after animation completes
    setTimeout(() => {
        indicator.classList.remove('broadcast-ping');
    }, 600);
}

/**
 * Update sync status indicator UI
 * Shows syncing status with animated icon
 */
function updateSyncIndicator() {
    const indicator = document.getElementById('headerSyncBtn');
    const indicatorText = document.getElementById('syncBtnText');
    const icon = document.getElementById('syncIcon');
    
    if (!indicator) return;
    
    // Always show syncing state (since we auto-start)
    indicator.classList.remove('bg-green-600', 'hover:bg-green-700', 'bg-red-600', 'hover:bg-red-700');
    indicator.classList.add('bg-purple-600');
    
    if (indicatorText) {
        indicatorText.textContent = 'Syncing Mesh';
    }
    
    // Show animated sync icon (already in HTML, but ensure it's set)
    if (icon) {
        icon.setAttribute('fill', 'none');
        icon.setAttribute('stroke', 'currentColor');
        icon.setAttribute('viewBox', '0 0 24 24');
    }
}

/**
 * Trigger ping animation on successful sync
 * Creates a visual "ping" effect when sync completes successfully
 */
function triggerSyncPing() {
    const indicator = document.getElementById('headerSyncBtn');
    if (!indicator) return;
    
    // Add ping animation class
    indicator.classList.add('sync-ping');
    
    // Remove class after animation completes
    setTimeout(() => {
        indicator.classList.remove('sync-ping');
    }, 600);
}

/**
 * Start location broadcasting
 * Auto-starts on app initialization
 */
function startBroadcasting() {
    if (headerTracker && headerTracker.isTracking) {
        console.log('Broadcasting already started');
        return;
    }
    
    // Create or get tracker instance
    if (!headerTracker) {
        headerTracker = new LocationTracker(TRACKING_INTERVAL);
    }
    
    // Start tracking with callbacks
    headerTracker.start(
        (data) => {
            // Success callback - trigger ping animation
            console.log('Location broadcasted:', data);
            triggerBroadcastPing();
        },
        (error) => {
            // Error callback
            console.error('Location broadcasting error:', error);
        }
    );
    
    // Update UI
    updateBroadcastIndicator();
}

/**
 * Stop location broadcasting
 * Note: Not typically used since broadcasting auto-starts and is always on
 */
function stopBroadcasting() {
    if (headerTracker) {
        headerTracker.stop();
        headerTracker = null;
    }
}

/**
 * Start mesh synchronization
 * Auto-starts on app initialization
 */
function startSyncing() {
    if (headerSyncTracker && headerSyncTracker.isTracking) {
        console.log('Syncing already started');
        return;
    }
    
    // Create or get sync tracker instance
    if (!headerSyncTracker) {
        headerSyncTracker = new SyncTracker(SYNC_INTERVAL);
    }
    
    // Start syncing with callbacks
    headerSyncTracker.start(
        (result) => {
            // Success callback - trigger ping animation
            console.log('Mesh sync completed:', result);
            if (result && result.synced !== undefined) {
                triggerSyncPing();
            }
        },
        (error) => {
            // Error callback
            console.error('Mesh sync error:', error);
        }
    );
    
    // Update UI
    updateSyncIndicator();
}

/**
 * Stop mesh synchronization
 * Note: Not typically used since syncing auto-starts and is always on
 */
function stopSyncing() {
    if (headerSyncTracker) {
        headerSyncTracker.stop();
        headerSyncTracker = null;
    }
}

/**
 * Handle user type switch change
 * @param {Event} event - Change event
 */
function handleUserTypeChange(event) {
    const userType = event.target.value;
    setUserType(userType);
    console.log('User type changed to:', userType);
    
    // If broadcasting, restart to use new role
    if (headerTracker && headerTracker.isTracking) {
        stopBroadcasting();
        // Small delay to ensure cleanup
        setTimeout(() => {
            startBroadcasting();
        }, 100);
    }
}

/**
 * Initialize header controls
 * Auto-starts broadcasting and syncing when app opens
 */
function initializeHeaderControls() {
    // Initialize user type switch
    const userTypeSwitch = document.getElementById('headerUserTypeSwitch');
    if (userTypeSwitch) {
        const currentUserType = getUserType();
        userTypeSwitch.value = currentUserType;
        userTypeSwitch.addEventListener('change', handleUserTypeChange);
    }
    
    // Initialize broadcast status indicator
    const broadcastIndicator = document.getElementById('headerBroadcastBtn');
    if (broadcastIndicator) {
        // Update UI to show broadcasting state
        updateBroadcastIndicator();
        
        // Remove click handler - it's now just an indicator, not a button
        broadcastIndicator.style.cursor = 'default';
        
        // Auto-start broadcasting when app opens
        console.log('Auto-starting GPS broadcasting...');
        // Small delay to ensure everything is loaded
        setTimeout(() => {
            startBroadcasting();
        }, 500);
    }
    
    // Initialize sync status indicator
    const syncIndicator = document.getElementById('headerSyncBtn');
    if (syncIndicator) {
        // Update UI to show syncing state
        updateSyncIndicator();
        
        // Remove click handler - it's now just an indicator, not a button
        syncIndicator.style.cursor = 'default';
        
        // Auto-start syncing when app opens
        console.log('Auto-starting mesh synchronization...');
        // Small delay to ensure everything is loaded (longer than broadcast)
        setTimeout(() => {
            startSyncing();
        }, 1000);
    }
}

/**
 * Cleanup on page unload
 */
function cleanupHeaderControls() {
    // Broadcasting and syncing always restart on page load, no need to save state
    if (headerTracker && headerTracker.isTracking) {
        headerTracker.stop();
    }
    if (headerSyncTracker && headerSyncTracker.isTracking) {
        headerSyncTracker.stop();
    }
}

// Initialize when DOM is ready
if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeHeaderControls);
    } else {
        // DOM already loaded
        initializeHeaderControls();
    }
    
    // Cleanup on unload
    window.addEventListener('beforeunload', cleanupHeaderControls);
}

// Export as ES6 module
export {
    startBroadcasting,
    stopBroadcasting,
    startSyncing,
    stopSyncing,
    getUserType,
    setUserType,
    updateBroadcastIndicator,
    updateSyncIndicator,
    triggerBroadcastPing,
    triggerSyncPing,
    initializeHeaderControls
};

// Export default object
export default {
    startBroadcasting,
    stopBroadcasting,
    startSyncing,
    stopSyncing,
    getUserType,
    setUserType,
    updateBroadcastIndicator,
    updateSyncIndicator,
    triggerBroadcastPing,
    triggerSyncPing,
    initializeHeaderControls
};

// Keep window export for backward compatibility (optional)
if (typeof window !== 'undefined') {
    window.HeaderControls = {
        startBroadcasting,
        stopBroadcasting,
        startSyncing,
        stopSyncing,
        getUserType,
        setUserType,
        updateBroadcastIndicator,
        updateSyncIndicator,
        triggerBroadcastPing,
        triggerSyncPing
    };
}

