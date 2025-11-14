/**
 * Location Tracker - Automatic location sharing wrapper
 * 
 * This module sets up automatic location sharing by calling
 * the location-sender module at regular intervals.
 * 
 * Features:
 * - Configurable interval (default: 5 seconds)
 * - Automatic pause when page is in background
 * - Start/stop controls
 * - Page visibility detection
 */

// Ensure location-sender.js is loaded first
// This script should be included after location-sender.js

/**
 * Location Tracker class
 * Manages automatic location sharing at regular intervals
 */
class LocationTracker {
    constructor(intervalMs = 5000) {
        this.intervalMs = intervalMs;
        this.intervalId = null;
        this.isTracking = false;
        this.isPaused = false;
        this.onLocationSent = null; // Callback function
        this.onError = null; // Error callback
        
        // Bind visibility change handler
        this.handleVisibilityChange = this.handleVisibilityChange.bind(this);
    }

    /**
     * Check if page is currently visible
     * @returns {boolean} True if page is visible
     */
    isPageVisible() {
        if (typeof document === 'undefined') {
            // Service worker context - assume visible
            return true;
        }
        return !document.hidden;
    }

    /**
     * Handle page visibility changes
     * Automatically pauses when page goes to background
     */
    handleVisibilityChange() {
        if (typeof document === 'undefined') {
            return;
        }

        if (document.hidden) {
            console.log('Page is now in background - pausing location tracking');
            this.pause();
        } else {
            console.log('Page is now visible - resuming location tracking');
            this.resume();
        }
    }

    /**
     * Send location once
     * Wrapper around LocationSender.sendLocation()
     * @returns {Promise<Object>} Result from sendLocation
     */
    async sendLocationOnce() {
        if (typeof LocationSender === 'undefined') {
            throw new Error('LocationSender not loaded. Make sure location-sender.js is loaded first.');
        }

        const result = await LocationSender.sendLocation();

        if (result.success) {
            if (this.onLocationSent) {
                this.onLocationSent(result.data);
            }
        } else {
            if (this.onError) {
                this.onError(result.error);
            }
        }

        return result;
    }

    /**
     * Start tracking location at regular intervals
     * @param {Function} onLocationSent - Optional callback when location is sent successfully
     * @param {Function} onError - Optional callback when error occurs
     */
    start(onLocationSent = null, onError = null) {
        if (this.isTracking) {
            console.warn('Location tracking is already started');
            return;
        }

        this.onLocationSent = onLocationSent;
        this.onError = onError;
        this.isTracking = true;
        this.isPaused = false;

        // Send location immediately
        this.sendLocationOnce();

        // Set up interval
        this.intervalId = setInterval(() => {
            if (!this.isPaused && this.isPageVisible()) {
                this.sendLocationOnce();
            }
        }, this.intervalMs);

        // Listen for visibility changes (if in browser context)
        if (typeof document !== 'undefined') {
            document.addEventListener('visibilitychange', this.handleVisibilityChange);
        }

        console.log(`Location tracking started (interval: ${this.intervalMs}ms)`);
    }

    /**
     * Stop tracking location
     */
    stop() {
        if (!this.isTracking) {
            return;
        }

        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }

        // Remove visibility change listener
        if (typeof document !== 'undefined') {
            document.removeEventListener('visibilitychange', this.handleVisibilityChange);
        }

        this.isTracking = false;
        this.isPaused = false;
        this.onLocationSent = null;
        this.onError = null;

        console.log('Location tracking stopped');
    }

    /**
     * Pause tracking (page is in background)
     */
    pause() {
        if (!this.isTracking || this.isPaused) {
            return;
        }
        this.isPaused = true;
        console.log('Location tracking paused');
    }

    /**
     * Resume tracking (page is visible again)
     */
    resume() {
        if (!this.isTracking || !this.isPaused) {
            return;
        }
        this.isPaused = false;
        // Send location immediately when resuming
        this.sendLocationOnce();
        console.log('Location tracking resumed');
    }

    /**
     * Update tracking interval
     * @param {number} intervalMs - New interval in milliseconds
     */
    setInterval(intervalMs) {
        const wasTracking = this.isTracking;
        if (wasTracking) {
            this.stop();
        }
        this.intervalMs = intervalMs;
        if (wasTracking) {
            this.start(this.onLocationSent, this.onError);
        }
    }

    /**
     * Get current tracking status
     * @returns {Object} Status information
     */
    getStatus() {
        return {
            isTracking: this.isTracking,
            isPaused: this.isPaused,
            intervalMs: this.intervalMs,
            isPageVisible: this.isPageVisible()
        };
    }
}

// Create a default instance for convenience
let defaultTracker = null;

/**
 * Get or create default location tracker instance
 * @param {number} intervalMs - Interval in milliseconds (only used if creating new instance)
 * @returns {LocationTracker} Tracker instance
 */
function getDefaultTracker(intervalMs = 5000) {
    if (!defaultTracker) {
        defaultTracker = new LocationTracker(intervalMs);
    }
    return defaultTracker;
}

/**
 * Start location tracking with default tracker
 * Convenience function for easy usage
 * @param {number} intervalMs - Interval in milliseconds (default: 5000 = 5 seconds)
 * @param {Function} onLocationSent - Optional success callback
 * @param {Function} onError - Optional error callback
 */
function startLocationTracking(intervalMs = 5000, onLocationSent = null, onError = null) {
    const tracker = getDefaultTracker(intervalMs);
    tracker.start(onLocationSent, onError);
    return tracker;
}

/**
 * Stop location tracking
 * Convenience function for easy usage
 */
function stopLocationTracking() {
    if (defaultTracker) {
        defaultTracker.stop();
    }
}

/**
 * Pause location tracking
 * Convenience function for easy usage
 */
function pauseLocationTracking() {
    if (defaultTracker) {
        defaultTracker.pause();
    }
}

/**
 * Resume location tracking
 * Convenience function for easy usage
 */
function resumeLocationTracking() {
    if (defaultTracker) {
        defaultTracker.resume();
    }
}

// Export for use in other scripts
if (typeof window !== 'undefined') {
    window.LocationTracker = LocationTracker;
    window.getDefaultTracker = getDefaultTracker;
    window.startLocationTracking = startLocationTracking;
    window.stopLocationTracking = stopLocationTracking;
    window.pauseLocationTracking = pauseLocationTracking;
    window.resumeLocationTracking = resumeLocationTracking;
}

// Auto-start when DOM is ready (optional - can be disabled)
if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('DOMContentLoaded', function() {
        // Only auto-start if there's a data attribute on the page
        if (document.body && document.body.dataset.autoStartLocationTracking === 'true') {
            const interval = parseInt(document.body.dataset.locationTrackingInterval || '5000', 10);
            startLocationTracking(interval, (data) => {
                console.log('Location shared:', data);
            }, (error) => {
                console.error('Location sharing error:', error);
            });
        }
    });
}

