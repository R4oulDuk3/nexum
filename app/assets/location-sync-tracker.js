/**
 * Location Sync Tracker - Automatic mesh node synchronization wrapper
 * 
 * This module sets up automatic synchronization by calling
 * the location-sync module at regular intervals.
 * 
 * Features:
 * - Configurable interval (default: 10 seconds)
 * - Automatic pause when page is in background
 * - Start/stop controls
 * - Page visibility detection
 * - Debug logging
 */

// Import LocationSync module
import * as LocationSync from './location-sync.js';

/**
 * Sync Tracker class
 * Manages automatic synchronization at regular intervals
 */
class SyncTracker {
    constructor(intervalMs = 10000) {
        this.intervalMs = intervalMs;
        this.intervalId = null;
        this.isTracking = false;
        this.isPaused = false;
        this.onSyncComplete = null; // Callback function
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
     * Note: Sync continues even when page is in background (no pause)
     */
    handleVisibilityChange() {
        if (typeof document === 'undefined') {
            return;
        }
        // Sync continues running in background - no pause/resume needed
    }

    /**
     * Sync once
     * Wrapper around LocationSync.syncAllNodes()
     * @returns {Promise<Object>} Result from syncAllNodes
     */
    async syncOnce() {
        const syncStartTime = Date.now();
        console.log(`[SyncTracker] Starting sync at ${new Date(syncStartTime).toLocaleTimeString()}`);
        
        try {
            const result = await LocationSync.syncAllNodes();
            const syncDuration = Date.now() - syncStartTime;

            if (result && result.synced !== undefined) {
                console.log(`[SyncTracker] Sync completed in ${syncDuration}ms:`, {
                    synced: result.synced,
                    total: result.total,
                    totalCount: result.totalCount || 0,
                    errors: result.errors?.length || 0
                });
                
                if (this.onSyncComplete) {
                    this.onSyncComplete(result);
                }
            } else {
                console.warn(`[SyncTracker] Sync completed with unexpected result:`, result);
                if (this.onError) {
                    this.onError(result);
                }
            }

            return result;
        } catch (error) {
            const syncDuration = Date.now() - syncStartTime;
            console.error(`[SyncTracker] Sync failed after ${syncDuration}ms:`, error);
            if (this.onError) {
                this.onError(error);
            }
            throw error;
        }
    }

    /**
     * Start syncing at regular intervals
     * @param {Function} onSyncComplete - Optional callback when sync completes successfully
     * @param {Function} onError - Optional callback when error occurs
     */
    start(onSyncComplete = null, onError = null) {
        if (this.isTracking) {
            console.warn('[SyncTracker] Sync tracking is already started');
            return;
        }

        this.onSyncComplete = onSyncComplete;
        this.onError = onError;
        this.isTracking = true;
        this.isPaused = false;

        console.log(`[SyncTracker] Starting automatic sync tracking (interval: ${this.intervalMs}ms = ${this.intervalMs/1000}s)`);
        
        // Sync immediately
        this.syncOnce();

        // Set up interval - sync continues even when page is hidden
        this.intervalId = setInterval(() => {
            if (!this.isPaused) {
                this.syncOnce();
            } else {
                console.log(`[SyncTracker] Skipping sync (paused: ${this.isPaused})`);
            }
        }, this.intervalMs);

        console.log(`[SyncTracker] Sync tracking started (interval: ${this.intervalMs}ms)`);
    }

    /**
     * Stop tracking sync
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
        this.onSyncComplete = null;
        this.onError = null;

        console.log('[SyncTracker] Sync tracking stopped');
    }

    /**
     * Pause tracking (page is in background)
     */
    pause() {
        if (!this.isTracking || this.isPaused) {
            return;
        }
        this.isPaused = true;
        console.log('[SyncTracker] Sync tracking paused');
    }

    /**
     * Resume tracking (page is visible again)
     */
    resume() {
        if (!this.isTracking || !this.isPaused) {
            return;
        }
        this.isPaused = false;
        // Sync immediately when resuming
        console.log('[SyncTracker] Sync tracking resumed - syncing immediately');
        this.syncOnce();
    }

    /**
     * Update sync interval
     * @param {number} intervalMs - New interval in milliseconds
     */
    setInterval(intervalMs) {
        const wasTracking = this.isTracking;
        if (wasTracking) {
            this.stop();
        }
        this.intervalMs = intervalMs;
        if (wasTracking) {
            this.start(this.onSyncComplete, this.onError);
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
 * Get or create default sync tracker instance
 * @param {number} intervalMs - Interval in milliseconds (only used if creating new instance)
 * @returns {SyncTracker} Tracker instance
 */
function getDefaultTracker(intervalMs = 10000) {
    if (!defaultTracker) {
        defaultTracker = new SyncTracker(intervalMs);
    }
    return defaultTracker;
}

/**
 * Start sync tracking with default tracker
 * Convenience function for easy usage
 * @param {number} intervalMs - Interval in milliseconds (default: 10000 = 10 seconds)
 * @param {Function} onSyncComplete - Optional success callback
 * @param {Function} onError - Optional error callback
 */
function startSyncTracking(intervalMs = 10000, onSyncComplete = null, onError = null) {
    const tracker = getDefaultTracker(intervalMs);
    tracker.start(onSyncComplete, onError);
    return tracker;
}

/**
 * Stop sync tracking
 * Convenience function for easy usage
 */
function stopSyncTracking() {
    if (defaultTracker) {
        defaultTracker.stop();
    }
}

/**
 * Pause sync tracking
 * Convenience function for easy usage
 */
function pauseSyncTracking() {
    if (defaultTracker) {
        defaultTracker.pause();
    }
}

/**
 * Resume sync tracking
 * Convenience function for easy usage
 */
function resumeSyncTracking() {
    if (defaultTracker) {
        defaultTracker.resume();
    }
}

// Export as ES6 module
export {
    SyncTracker,
    getDefaultTracker,
    startSyncTracking,
    stopSyncTracking,
    pauseSyncTracking,
    resumeSyncTracking
};

// Export default tracker class
export default SyncTracker;

// Keep window exports for backward compatibility (optional)
if (typeof window !== 'undefined') {
    window.SyncTracker = SyncTracker;
    window.getDefaultSyncTracker = getDefaultTracker;
    window.startSyncTracking = startSyncTracking;
    window.stopSyncTracking = stopSyncTracking;
    window.pauseSyncTracking = pauseSyncTracking;
    window.resumeSyncTracking = resumeSyncTracking;
}

