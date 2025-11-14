/**
 * Header Controls - Broadcast button and user type switch
 * 
 * Manages:
 * - Broadcast button to start/stop location tracking
 * - User type switch (responder/civilian)
 * - localStorage persistence for both state and user type
 * - Auto-restore broadcast state on page load
 */

// Constants for localStorage keys
const STORAGE_KEYS = {
    BROADCASTING: 'location_broadcasting',
    USER_TYPE: 'user_role'  // Same as location-sender.js uses
};

// Global tracker instance
let headerTracker = null;
const TRACKING_INTERVAL = 5000; // 5 seconds

/**
 * Check if broadcasting is enabled in localStorage
 * @returns {boolean} True if broadcasting is enabled
 */
function isBroadcastingEnabled() {
    const stored = localStorage.getItem(STORAGE_KEYS.BROADCASTING);
    return stored === 'true';
}

/**
 * Set broadcasting state in localStorage
 * @param {boolean} enabled - Whether broadcasting is enabled
 */
function setBroadcastingState(enabled) {
    localStorage.setItem(STORAGE_KEYS.BROADCASTING, enabled.toString());
}

/**
 * Get user type from localStorage
 * @returns {string} User type ('responder' or 'civilian')
 */
function getUserType() {
    if (typeof LocationSender !== 'undefined') {
        return LocationSender.getUserRole();
    }
    return localStorage.getItem(STORAGE_KEYS.USER_TYPE) || 'responder';
}

/**
 * Set user type in localStorage
 * @param {string} userType - User type ('responder' or 'civilian')
 */
function setUserType(userType) {
    if (typeof LocationSender !== 'undefined') {
        LocationSender.setUserRole(userType);
    } else {
        localStorage.setItem(STORAGE_KEYS.USER_TYPE, userType);
    }
}

/**
 * Update broadcast button UI
 * @param {boolean} isBroadcasting - Whether currently broadcasting
 */
function updateBroadcastButton(isBroadcasting) {
    const btn = document.getElementById('headerBroadcastBtn');
    const btnText = document.getElementById('broadcastBtnText');
    const icon = document.getElementById('broadcastIcon');
    
    if (!btn) return;
    
    if (isBroadcasting) {
        btn.classList.remove('bg-green-600', 'hover:bg-green-700');
        btn.classList.add('bg-red-600', 'hover:bg-red-700');
        if (btnText) btnText.textContent = 'Stop Broadcasting';
        
        // Add pulse animation to icon - pulsing circle
        if (icon) {
            icon.setAttribute('fill', 'none');
            icon.setAttribute('viewBox', '0 0 24 24');
            icon.innerHTML = '<circle cx="12" cy="12" r="3" fill="currentColor" opacity="1"><animate attributeName="opacity" values="1;0.4;1" dur="1s" repeatCount="indefinite"/></circle><circle cx="12" cy="12" r="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.5"><animate attributeName="r" values="6;10;6" dur="1s" repeatCount="indefinite"/><animate attributeName="opacity" values="0.5;0;0.5" dur="1s" repeatCount="indefinite"/></circle>';
        }
    } else {
        btn.classList.remove('bg-red-600', 'hover:bg-red-700');
        btn.classList.add('bg-green-600', 'hover:bg-green-700');
        if (btnText) btnText.textContent = 'Start Broadcasting';
        
        // Restore original icon (broadcast/waves icon)
        if (icon) {
            icon.setAttribute('fill', 'currentColor');
            icon.setAttribute('viewBox', '0 0 24 24');
            icon.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"></path>';
        }
    }
}

/**
 * Start location broadcasting
 */
function startBroadcasting() {
    if (headerTracker && headerTracker.isTracking) {
        console.log('Broadcasting already started');
        return;
    }
    
    if (typeof LocationTracker === 'undefined') {
        console.error('LocationTracker not loaded');
        alert('Location tracking not available. Please refresh the page.');
        return;
    }
    
    // Create or get tracker instance
    if (!headerTracker) {
        headerTracker = new LocationTracker(TRACKING_INTERVAL);
    }
    
    // Start tracking with callbacks
    headerTracker.start(
        (data) => {
            // Success callback
            console.log('Location broadcasted:', data);
        },
        (error) => {
            // Error callback
            console.error('Location broadcasting error:', error);
        }
    );
    
    // Update state and UI
    setBroadcastingState(true);
    updateBroadcastButton(true);
}

/**
 * Stop location broadcasting
 */
function stopBroadcasting() {
    if (headerTracker) {
        headerTracker.stop();
        headerTracker = null;
    }
    
    // Update state and UI
    setBroadcastingState(false);
    updateBroadcastButton(false);
}

/**
 * Toggle broadcasting state
 */
function toggleBroadcasting() {
    if (isBroadcastingEnabled()) {
        stopBroadcasting();
    } else {
        startBroadcasting();
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
    if (isBroadcastingEnabled() && headerTracker) {
        stopBroadcasting();
        // Small delay to ensure cleanup
        setTimeout(() => {
            startBroadcasting();
        }, 100);
    }
}

/**
 * Initialize header controls
 */
function initializeHeaderControls() {
    // Initialize user type switch
    const userTypeSwitch = document.getElementById('headerUserTypeSwitch');
    if (userTypeSwitch) {
        const currentUserType = getUserType();
        userTypeSwitch.value = currentUserType;
        userTypeSwitch.addEventListener('change', handleUserTypeChange);
    }
    
    // Initialize broadcast button
    const broadcastBtn = document.getElementById('headerBroadcastBtn');
    if (broadcastBtn) {
        // Restore broadcasting state
        const wasBroadcasting = isBroadcastingEnabled();
        updateBroadcastButton(wasBroadcasting);
        
        // Set up click handler
        broadcastBtn.addEventListener('click', toggleBroadcasting);
        
        // Auto-start if broadcasting was enabled
        if (wasBroadcasting) {
            console.log('Restoring broadcasting state...');
            // Small delay to ensure everything is loaded
            setTimeout(() => {
                startBroadcasting();
            }, 500);
        }
    }
}

/**
 * Cleanup on page unload
 */
function cleanupHeaderControls() {
    // Save state before unload (already saved, but ensure it's correct)
    if (headerTracker && headerTracker.isTracking) {
        setBroadcastingState(true);
    } else {
        setBroadcastingState(false);
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

// Export functions for global access
if (typeof window !== 'undefined') {
    window.HeaderControls = {
        startBroadcasting,
        stopBroadcasting,
        toggleBroadcasting,
        isBroadcastingEnabled,
        setBroadcastingState,
        getUserType,
        setUserType,
        updateBroadcastButton
    };
}

