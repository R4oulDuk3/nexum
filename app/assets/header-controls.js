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
    
    const isBroadcasting = headerTracker && headerTracker.isTracking;
    
    // Update colors based on state
    indicator.classList.remove('bg-green-600', 'hover:bg-green-700', 'bg-red-600', 'hover:bg-red-700', 'bg-blue-600');
    if (isBroadcasting) {
        indicator.classList.add('bg-blue-600');
    } else {
        indicator.classList.add('bg-gray-600');
    }
    
    if (indicatorText) {
        indicatorText.textContent = isBroadcasting ? 'Broadcasting GPS' : 'GPS Off';
    }
    
    // Show pulsing GPS indicator icon when broadcasting
    if (icon) {
        if (isBroadcasting) {
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
        } else {
            // Static icon when not broadcasting
            icon.setAttribute('fill', 'none');
            icon.setAttribute('stroke', 'currentColor');
            icon.setAttribute('viewBox', '0 0 24 24');
            icon.innerHTML = `
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path>
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path>
            `;
        }
    }
}

/**
 * Update GPS broadcast button on dashboard
 * Shows current state and handles clicks
 */
function updateGPSBroadcastButton() {
    const button = document.getElementById('gps-broadcast-btn');
    const buttonText = document.getElementById('gps-broadcast-text');
    const buttonIcon = document.getElementById('gps-broadcast-icon');
    
    if (!button) return;
    
    const isBroadcasting = headerTracker && headerTracker.isTracking;
    
    // Update button appearance
    button.classList.remove('bg-blue-600', 'bg-green-600', 'bg-red-600', 'hover:bg-blue-700', 'hover:bg-green-700', 'hover:bg-red-700');
    if (isBroadcasting) {
        button.classList.add('bg-green-600', 'hover:bg-green-700');
        if (buttonText) buttonText.textContent = 'Stop GPS Broadcasting';
    } else {
        button.classList.add('bg-blue-600', 'hover:bg-blue-700');
        if (buttonText) buttonText.textContent = 'Start GPS Broadcasting';
    }
    
    // Update icon
    if (buttonIcon) {
        if (isBroadcasting) {
            // Show pulsing icon when broadcasting
            buttonIcon.setAttribute('fill', 'none');
            buttonIcon.setAttribute('stroke', 'currentColor');
            buttonIcon.setAttribute('stroke-width', '2');
            buttonIcon.setAttribute('viewBox', '0 0 24 24');
            buttonIcon.innerHTML = `
                <circle cx="12" cy="12" r="2" fill="currentColor" opacity="1">
                    <animate attributeName="opacity" values="1;0.6;1" dur="1.5s" repeatCount="indefinite"/>
                </circle>
                <circle cx="12" cy="12" r="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.4">
                    <animate attributeName="r" values="6;10;6" dur="1.5s" repeatCount="indefinite"/>
                    <animate attributeName="opacity" values="0.4;0;0.4" dur="1.5s" repeatCount="indefinite"/>
                </circle>
            `;
        } else {
            // Static location icon when not broadcasting
            buttonIcon.setAttribute('fill', 'none');
            buttonIcon.setAttribute('stroke', 'currentColor');
            buttonIcon.setAttribute('stroke-width', '2');
            buttonIcon.setAttribute('viewBox', '0 0 24 24');
            buttonIcon.innerHTML = `
                <path stroke-linecap="round" stroke-linejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path>
                <path stroke-linecap="round" stroke-linejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path>
            `;
        }
    }
}

/**
 * Handle GPS broadcast button click
 */
async function handleGPSBroadcastClick() {
    const button = document.getElementById('gps-broadcast-btn');
    if (!button) return;
    
    const isBroadcasting = headerTracker && headerTracker.isTracking;
    
    // Disable button during state change
    button.disabled = true;
    
    try {
        if (isBroadcasting) {
            // Stop broadcasting
            stopBroadcasting();
            console.log('GPS broadcasting stopped');
        } else {
            // Start broadcasting (will request permission if needed)
            const started = await startBroadcasting();
            if (!started) {
                // Permission denied or error
                return;
            }
            console.log('GPS broadcasting started');
        }
        
        // Update button UI
        updateGPSBroadcastButton();
        updateBroadcastIndicator();
    } catch (error) {
        console.error('Error toggling GPS broadcast:', error);
        alert('Error: ' + error.message);
    } finally {
        button.disabled = false;
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
 * Get GPS broadcasting state from localStorage
 * @returns {boolean} True if GPS broadcasting is enabled
 */
function getGPSBroadcastingState() {
    const state = localStorage.getItem('gps_broadcasting_enabled');
    return state === 'true';
}

/**
 * Set GPS broadcasting state in localStorage
 * @param {boolean} enabled - Whether GPS broadcasting is enabled
 */
function setGPSBroadcastingState(enabled) {
    localStorage.setItem('gps_broadcasting_enabled', enabled ? 'true' : 'false');
}

/**
 * Start location broadcasting
 * Requests permission if needed, then starts tracking
 */
async function startBroadcasting() {
    if (headerTracker && headerTracker.isTracking) {
        console.log('Broadcasting already started');
        return true;
    }
    
    // Check if geolocation is available
    if (!navigator.geolocation) {
        console.error('Geolocation is not supported by your browser');
        alert('GPS is not supported by your browser');
        return false;
    }
    
    // Try to get current position to request permission
    try {
        // Request permission by getting position once
        await new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(
                resolve,
                reject,
                { timeout: 5000, maximumAge: 0 }
            );
        });
        
        // Permission granted, create or get tracker instance
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
        
        // Save state to localStorage
        setGPSBroadcastingState(true);
        
        // Update UI
        updateBroadcastIndicator();
        
        return true;
    } catch (error) {
        console.error('Failed to start GPS broadcasting:', error);
        if (error.code === 1 || error.code === error.PERMISSION_DENIED) {
            alert('GPS permission denied. Please allow location access to broadcast your position.');
        } else if (error.code === 2 || error.code === error.POSITION_UNAVAILABLE) {
            alert('GPS position unavailable. Please check your device settings.');
        } else if (error.code === 3 || error.code === error.TIMEOUT) {
            alert('GPS request timed out. Please try again.');
        } else {
            alert('Failed to start GPS broadcasting: ' + (error.message || String(error)));
        }
        setGPSBroadcastingState(false);
        return false;
    }
}

/**
 * Stop location broadcasting
 */
function stopBroadcasting() {
    if (headerTracker) {
        headerTracker.stop();
        headerTracker = null;
    }
    
    // Save state to localStorage
    setGPSBroadcastingState(false);
    
    // Update UI
    updateBroadcastIndicator();
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
 * Auto-starts syncing when app opens
 * GPS broadcasting is now controlled by button on dashboard
 */
function initializeHeaderControls() {
    // Initialize user type switch
    const userTypeSwitch = document.getElementById('headerUserTypeSwitch');
    if (userTypeSwitch) {
        const currentUserType = getUserType();
        userTypeSwitch.value = currentUserType;
        userTypeSwitch.addEventListener('change', handleUserTypeChange);
    }
    
    // Initialize broadcast status indicator (just shows status, no auto-start)
    const broadcastIndicator = document.getElementById('headerBroadcastBtn');
    if (broadcastIndicator) {
        // Update UI to show current state
        updateBroadcastIndicator();
        
        // Remove click handler - it's now just an indicator, not a button
        broadcastIndicator.style.cursor = 'default';
        
        // Restore GPS broadcasting state from localStorage
        const gpsEnabled = getGPSBroadcastingState();
        if (gpsEnabled) {
            console.log('Restoring GPS broadcasting state from localStorage...');
            // Small delay to ensure everything is loaded
            setTimeout(() => {
                startBroadcasting().then(success => {
                    if (success) {
                        updateGPSBroadcastButton();
                        updateBroadcastIndicator();
                    } else {
                        // Permission was denied, clear state
                        setGPSBroadcastingState(false);
                    }
                });
            }, 500);
        }
    }
    
    // Initialize GPS broadcast button on dashboard
    const gpsBroadcastButton = document.getElementById('gps-broadcast-btn');
    if (gpsBroadcastButton) {
        gpsBroadcastButton.addEventListener('click', handleGPSBroadcastClick);
        
        // Restore state from localStorage and update button
        const gpsEnabled = getGPSBroadcastingState();
        if (gpsEnabled) {
            // State will be restored by the broadcast indicator initialization
            setTimeout(() => {
                updateGPSBroadcastButton();
            }, 1000);
        } else {
            updateGPSBroadcastButton();
        }
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
    updateGPSBroadcastButton,
    handleGPSBroadcastClick,
    getGPSBroadcastingState,
    setGPSBroadcastingState,
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
    updateGPSBroadcastButton,
    handleGPSBroadcastClick,
    getGPSBroadcastingState,
    setGPSBroadcastingState,
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
        updateGPSBroadcastButton,
        handleGPSBroadcastClick,
        getGPSBroadcastingState,
        setGPSBroadcastingState,
        triggerBroadcastPing,
        triggerSyncPing
    };
}

