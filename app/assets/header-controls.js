/**
 * Header Controls - Broadcast status indicator and user type switch
 * 
 * Manages:
 * - Broadcast status indicator (shows GPS broadcasting status, auto-starts on load)
 * - User type switch (responder/civilian)
 * - localStorage persistence for user type
 * - Auto-starts broadcasting when app opens
 * - Ping animation on successful broadcast
 */

// Import dependencies
import * as LocationSender from './location-sender.js';
import { LocationTracker } from './location-tracker.js';

// Constants for localStorage keys
const STORAGE_KEYS = {
    USER_TYPE: 'user_role'  // Same as location-sender.js uses
};

// Global tracker instance
let headerTracker = null;
const TRACKING_INTERVAL = 5000; // 5 seconds


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
function triggerPingAnimation() {
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
            triggerPingAnimation();
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
 * Auto-starts broadcasting when app opens
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
}

/**
 * Cleanup on page unload
 */
function cleanupHeaderControls() {
    // Broadcasting always restarts on page load, no need to save state
    if (headerTracker && headerTracker.isTracking) {
        headerTracker.stop();
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
    getUserType,
    setUserType,
    updateBroadcastIndicator,
    triggerPingAnimation,
    initializeHeaderControls
};

// Export default object
export default {
    startBroadcasting,
    stopBroadcasting,
    getUserType,
    setUserType,
    updateBroadcastIndicator,
    triggerPingAnimation,
    initializeHeaderControls
};

// Keep window export for backward compatibility (optional)
if (typeof window !== 'undefined') {
    window.HeaderControls = {
        startBroadcasting,
        stopBroadcasting,
        getUserType,
        setUserType,
        updateBroadcastIndicator,
        triggerPingAnimation
    };
}

