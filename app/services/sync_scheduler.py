"""
Background scheduler for automatic mesh node synchronization
"""

import threading
import time
import os
from datetime import datetime

# Optional import for requests (only needed when making HTTP calls)
try:
    import requests
    REQUESTS_AVAILABLE = True
except ImportError:
    REQUESTS_AVAILABLE = False


class SyncScheduler:
    """Background scheduler that periodically triggers mesh node synchronization"""
    
    def __init__(self, interval_seconds: int = 10, enabled: bool = True, api_url: str = 'http://localhost:5000'):
        """
        Initialize the sync scheduler.
        
        Args:
            interval_seconds: How often to trigger sync (default: 10 seconds)
            enabled: Whether the scheduler is enabled (default: True)
            api_url: Base URL for the API (default: http://localhost:5000)
        """
        self.interval_seconds = interval_seconds
        self.enabled = enabled
        self.api_url = api_url.rstrip('/')  # Remove trailing slash if present
        self._stop_event = threading.Event()
        self._thread = None
        self._last_sync_time = None
        self._sync_count = 0
        
    def start(self):
        """Start the background sync thread"""
        if not self.enabled:
            print(f"SyncScheduler: Disabled, not starting background sync thread")
            return
            
        if self._thread and self._thread.is_alive():
            print(f"SyncScheduler: Already running")
            return
            
        self._stop_event.clear()
        self._thread = threading.Thread(target=self._run_sync_loop, daemon=True)
        self._thread.start()
        print(f"SyncScheduler: Started background sync thread (interval: {self.interval_seconds}s)")
        
    def stop(self):
        """Stop the background sync thread"""
        if self._thread and self._thread.is_alive():
            print(f"SyncScheduler: Stopping background sync thread...")
            self._stop_event.set()
            self._thread.join(timeout=5)
            print(f"SyncScheduler: Background sync thread stopped")
        else:
            print(f"SyncScheduler: Not running")
            
    def _run_sync_loop(self):
        """Main loop that runs in background thread"""
        print(f"SyncScheduler: Background sync thread started")
        
        if not REQUESTS_AVAILABLE:
            print(f"SyncScheduler: ERROR - 'requests' library not available!")
            print(f"SyncScheduler: Install it with: pip install requests")
            return
        
        # Wait a bit on startup before first sync
        time.sleep(2)
        
        while not self._stop_event.is_set():
            try:
                print(f"\n{'='*60}")
                print(f"🔄 AUTO SYNC CALLED (#{self._sync_count + 1})")
                print(f"{'='*60}")
                
                # Call the POST /api/sync endpoint via HTTP
                sync_url = f"{self.api_url}/api/sync"
                
                try:
                    response = requests.post(
                        sync_url,
                        timeout=30  # 30 second timeout for sync operation
                    )
                    
                    response.raise_for_status()
                    results = response.json()
                    
                    if results.get('status') != 'success':
                        error_msg = results.get('message', 'Unknown error')
                        print(f"❌ AUTO SYNC FAILED: {error_msg}")
                    else:
                        self._last_sync_time = datetime.now()
                        self._sync_count += 1
                        
                        # Summary of results
                        peers_found = results.get('peers_found', 0)
                        peers_attempted = results.get('peers_attempted', 0)
                        reports_pulled = results.get('total_reports_pulled', 0)
                        reports_saved = results.get('total_reports_saved', 0)
                        reports_skipped = results.get('total_reports_skipped', 0)
                        errors_count = len(results.get('errors', []))
                        
                        print(f"\n✅ AUTO SYNC FINISHED")
                        print(f"   Peers found: {peers_found} | Attempted: {peers_attempted}")
                        print(f"   Reports: {reports_pulled} pulled, {reports_saved} saved, {reports_skipped} skipped")
                        if errors_count > 0:
                            print(f"   ⚠️  Errors: {errors_count}")
                        
                except requests.exceptions.RequestException as e:
                    print(f"❌ AUTO SYNC ERROR: {type(e).__name__}: {e}")
                        
                print(f"{'='*60}")
                print(f"### END AUTO SYNC ###\n")
                
            except Exception as e:
                print(f"SyncScheduler: ERROR in sync loop: {type(e).__name__}: {e}")
                import traceback
                traceback.print_exc()
            
            # Wait for next interval (check stop_event periodically)
            waited = 0
            while waited < self.interval_seconds and not self._stop_event.is_set():
                time.sleep(1)
                waited += 1
                
        print(f"SyncScheduler: Background sync thread exiting")
        
    def get_status(self) -> dict:
        """Get current status of the scheduler"""
        return {
            "enabled": self.enabled,
            "interval_seconds": self.interval_seconds,
            "running": self._thread.is_alive() if self._thread else False,
            "sync_count": self._sync_count,
            "last_sync_time": self._last_sync_time.isoformat() if self._last_sync_time else None
        }


# Global scheduler instance
_scheduler = None


def get_sync_scheduler() -> SyncScheduler:
    """Get the global sync scheduler instance"""
    global _scheduler
    if _scheduler is None:
        # Get interval from environment variable or use default (10 seconds)
        interval = int(os.environ.get('SYNC_INTERVAL_SECONDS', '10'))
        # Get enabled flag from environment variable (default: True)
        enabled = os.environ.get('SYNC_ENABLED', 'true').lower() in ('true', '1', 'yes')
        # Get API URL from environment variable or use default (localhost:5000)
        api_url = os.environ.get('SYNC_API_URL', 'http://localhost:5000')
        
        _scheduler = SyncScheduler(interval_seconds=interval, enabled=enabled, api_url=api_url)
    return _scheduler

