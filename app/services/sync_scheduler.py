"""
Background scheduler for automatic mesh node synchronization
"""

import threading
import time
import os
from datetime import datetime
from services.sync_service import get_sync_service


class SyncScheduler:
    """Background scheduler that periodically triggers mesh node synchronization"""
    
    def __init__(self, interval_seconds: int = 10, enabled: bool = True):
        """
        Initialize the sync scheduler.
        
        Args:
            interval_seconds: How often to trigger sync (default: 10 seconds)
            enabled: Whether the scheduler is enabled (default: True)
        """
        self.interval_seconds = interval_seconds
        self.enabled = enabled
        self._stop_event = threading.Event()
        self._thread = None
        self._sync_service = get_sync_service()
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
        
        # Wait a bit on startup before first sync
        time.sleep(2)
        
        while not self._stop_event.is_set():
            try:
                print(f"\n{'='*60}")
                print(f"SyncScheduler: Triggering automatic sync ({self._sync_count + 1})")
                print(f"SyncScheduler: Time: {datetime.now().isoformat()}")
                print(f"{'='*60}")
                
                # Trigger sync using test_pull_all_peers (which now updates sync_log)
                # This uses sync_log for incremental sync
                results = self._sync_service.test_pull_all_peers(
                    since_timestamp=None,  # Use sync_log timestamps per peer
                    use_sync_log=True
                )
                
                self._last_sync_time = datetime.now()
                self._sync_count += 1
                
                print(f"\nSyncScheduler: Sync completed")
                print(f"  Peers found: {results.get('peers_found', 0)}")
                print(f"  Peers attempted: {results.get('peers_attempted', 0)}")
                print(f"  Reports pulled: {results.get('total_reports_pulled', 0)}")
                print(f"  Reports saved: {results.get('total_reports_saved', 0)}")
                print(f"  Reports skipped: {results.get('total_reports_skipped', 0)}")
                print(f"  Errors: {len(results.get('errors', []))}")
                
                if results.get('errors'):
                    print(f"SyncScheduler: Errors encountered:")
                    for error in results.get('errors', []):
                        print(f"  - {error}")
                        
                print(f"{'='*60}\n")
                
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
        
        _scheduler = SyncScheduler(interval_seconds=interval, enabled=enabled)
    return _scheduler

