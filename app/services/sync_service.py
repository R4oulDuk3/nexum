"""
Service for handling data synchronization between mesh nodes.
"""

import subprocess
import json
import platform
import uuid
import sqlite3
import re
from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime, timezone
from pathlib import Path
from uuid import UUID
import sys

# Optional import for requests (only needed when real implementation is enabled)
try:
    import requests
except ImportError:
    requests = None

sys.path.append(str(Path(__file__).parent.parent))

from services.cluster_service import get_cluster_service
from services.location_service import LocationService
from models.location import LocationReport, EntityType, GeoLocation


class SyncService:
    """Service for synchronizing data between mesh nodes"""
    
    def __init__(self, db_path: str = None, cluster_service=None):
        if db_path is None:
            db_path = str(Path(__file__).parent.parent / 'data' / 'messaging.db')
        self.db_path = db_path
        self.cluster_service = cluster_service or get_cluster_service()
        self.location_service = LocationService(db_path)
        self.ip_range_base = "169.254"  # From setup-mesh.sh
        self._my_node_id = None
    
    def get_my_node_id(self) -> str:
        """Get and cache this node's ID."""
        if self._my_node_id is None:
            self._my_node_id = self.cluster_service.get_current_node_id()
        return self._my_node_id
    
    def get_all_peers(self) -> Dict[str, str]:
        """
        Gets all visible peers from the B.A.T.M.A.N. mesh
        and returns a dict of {mac: ip}.
        """
        peers = {}
        my_node_id = self.get_my_node_id()
        
        # Mock data for local testing on Windows
        if platform.system() == "Windows":
            print("SyncService: WARNING: Cannot run 'batctl' on Windows. Returning empty peers.")
            return {
            }
        
        try:
            # Run `batctl o` to get the list of mesh originators (nodes)
            # Note: `-f json` is not supported in all versions, so we parse text output
            result = subprocess.run(
                ['sudo', 'batctl', 'o'],
                capture_output=True, text=True, timeout=5, check=True
            )
            
            if not result.stdout.strip():
                return {}
            
            # Parse text output - each line contains originator info
            lines = result.stdout.strip().split('\n')
            
            # Regular expression to match MAC addresses (xx:xx:xx:xx:xx:xx)
            mac_pattern = re.compile(r'([0-9a-fA-F]{2}[:-]){5}([0-9a-fA-F]{2})')
            
            for line in lines:
                if not line.strip():
                    continue
                
                # Skip header lines
                if 'Originator' in line and 'last-seen' in line:
                    continue
                if line.startswith('[B.A.T.M.A.N.'):
                    continue
                
                # Find MAC address in the line
                mac_match = mac_pattern.search(line)
                if mac_match:
                    peer_mac = mac_match.group(0).replace('-', ':')  # Normalize to colons
                    peer_mac = peer_mac.lower()  # Normalize to lowercase
                    
                    # Skip if it's our own node ID
                    if peer_mac == my_node_id:
                        continue
                    
                    # Calculate IP from MAC
                    peer_ip = self._calculate_ip_from_mac(peer_mac)
                    if peer_ip:
                        peers[peer_mac] = peer_ip
                    
        except FileNotFoundError as e:
            print(f"SyncService: Error: 'sudo' or 'batctl' command not found: {e}")
            return {}
        except subprocess.CalledProcessError as e:
            print(f"SyncService: Error running batctl (code {e.returncode})")
            return {}
        except Exception as e:
            print(f"SyncService: Error processing batctl output: {e}")
            return {}
        
        if peers:
            print(f"SyncService: Found {len(peers)} peers")
        return peers
    
    def _calculate_ip_from_mac(self, mac: str) -> Optional[str]:
        """
        Calculates a node's IP from its MAC address,
        using the exact logic from setup-mesh.sh.
        """
        try:
            parts = mac.split(':')
            
            if len(parts) != 6:
                return None
            
            # This is the logic from setup-mesh.sh:
            # Extract last 2 bytes (parts[4] and parts[5])
            # Convert hex to decimal for octet 3 and 4
            o3 = int(parts[4], 16)
            o4 = int(parts[5], 16)
            
            ip = f"{self.ip_range_base}.{o3}.{o4}"
            return ip
        except Exception as e:
            print(f"SyncService: Error calculating IP for {mac}: {e}")
            return None
    
    def get_last_sync_times(self, node_id: str) -> Tuple[int, int]:
        """
        Gets the last forward and backward sync timestamps (ms) for a given node from the local DB sync_log table.
        Returns (0, 0) if no sync_log entry exists for this node.
        """
        try:
            conn = sqlite3.connect(self.db_path)
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            
            cursor.execute('SELECT last_forward_sync_at, last_backward_sync_at FROM sync_log WHERE node_id = ?', (node_id,))
            row = cursor.fetchone()
            conn.close()
            
            if row:
                forward = row['last_forward_sync_at'] if row['last_forward_sync_at'] else 0
                backward = row['last_backward_sync_at'] if row['last_backward_sync_at'] else 0
                return (forward, backward)
            else:
                return (0, 0)
        except Exception as e:
            print(f"SyncService: Error getting sync times for {node_id}: {e}")
            if 'conn' in locals():
                conn.close()
            return (0, 0)
    
    def update_sync_times(self, node_id: str, forward_sync_at: int, backward_sync_at: int):
        """
        Updates the forward and backward sync timestamps for a node in the sync_log table.
        Creates a new entry if one doesn't exist, or updates existing entry.
        """
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            cursor.execute('SELECT node_id FROM sync_log WHERE node_id = ?', (node_id,))
            existing = cursor.fetchone()
            
            if existing:
                cursor.execute('''
                    UPDATE sync_log 
                    SET last_forward_sync_at = ?, last_backward_sync_at = ?
                    WHERE node_id = ?
                ''', (forward_sync_at, backward_sync_at, node_id))
            else:
                cursor.execute('''
                    INSERT INTO sync_log (node_id, last_forward_sync_at, last_backward_sync_at)
                    VALUES (?, ?, ?)
                ''', (node_id, forward_sync_at, backward_sync_at))
            
            conn.commit()
            conn.close()
            
        except Exception as e:
            print(f"SyncService: Error updating sync times for {node_id}: {e}")
    
    def log_incoming_sync_request(self, peer_ip: str, peer_node_id: Optional[str] = None):
        """
        Log when a peer pulls data from us (incoming sync request).
        This is a placeholder - sync tracking is now done via forward/backward sync times.
        """
        pass  # No longer needed with new schema
    
    def _extract_connection_error_type(self, error: Exception) -> str:
        """
        Extract a more specific error type from connection errors.
        
        Returns:
            A concise error description (e.g., "No route to host", "Connection refused", etc.)
        """
        error_str = str(error).lower()
        
        # Check for common routing/network errors
        if "no route to host" in error_str or "errno 113" in error_str:
            return "No route to host (check mesh network routing)"
        elif "connection refused" in error_str or "errno 111" in error_str:
            return "Connection refused (peer may not be running service on port 5000)"
        elif "name or service not known" in error_str or "nodename nor servname" in error_str:
            return "DNS/hostname resolution failed"
        elif "network is unreachable" in error_str or "errno 101" in error_str:
            return "Network unreachable"
        elif "connection timed out" in error_str or "timed out" in error_str:
            return "Connection timeout (peer may be slow or unreachable)"
        elif "timeout" in error_str:
            return "Request timeout"
        else:
            # Return a shorter version of the full error
            error_msg = str(error)
            # Try to extract the most relevant part
            if "HTTPConnectionPool" in error_msg:
                # Extract the reason from the HTTPConnectionPool error
                if "Failed to establish" in error_msg:
                    # Try to get the actual error reason
                    if ":" in error_msg:
                        parts = error_msg.split(":")
                        if len(parts) > 1:
                            reason = parts[-1].strip()
                            return f"Connection failed: {reason}"
            return f"Connection error: {error_msg[:150]}"  # Limit length
    
    def pull_data_from_peer(self, peer_ip: str, from_timestamp: int, until_timestamp: int) -> List[LocationReport]:
        """
        Pulls data from a peer's sync endpoint within a time range.
        
        Args:
            peer_ip: IP address of the peer
            from_timestamp: Start timestamp (ms)
            until_timestamp: End timestamp (ms)
        
        Returns:
            List of LocationReport objects (empty on error)
        """
        if requests is None:
            print(f"SyncService: Error: 'requests' library not installed. Cannot pull data from {peer_ip}")
            return []
        
        try:
            url = f"http://{peer_ip}:5000/api/sync/node/sync/from/{from_timestamp}/to/{until_timestamp}"
            
            response = requests.get(url, timeout=5)
            response.raise_for_status()
            
            response_data = response.json()
            
            if response_data.get('status') != 'success':
                error_msg = f"Peer returned error: {response_data.get('message', 'Unknown error')}"
                print(f"SyncService: {error_msg}")
                return []
            
            data_list = response_data.get('data', [])
            
            # Convert dicts to LocationReport objects
            reports = [LocationReport.from_dict(item) for item in data_list]
            
            return reports
        except Exception as e:
            print(f"SyncService: Error pulling data from {peer_ip}: {str(e)}")
            return []
    
    def save_location_reports(self, reports: List[Dict[str, Any]]) -> Tuple[int, int]:
        """
        Save location reports from peer data to the database using INSERT OR IGNORE.
        
        Args:
            reports: List of location report dicts (from peer API response)
            
        Returns:
            Tuple of (saved_count, skipped_count) where:
            - saved_count: Number of reports successfully saved
            - skipped_count: Number of reports skipped (duplicates or errors)
        """
        if not reports:
            return (0, 0)
        
        saved_count = 0
        skipped_count = 0
        
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            for report_dict in reports:
                try:
                    # Convert dict to LocationReport object
                    report = LocationReport.from_dict(report_dict)
                    
                    # Use INSERT OR IGNORE to handle duplicates
                    cursor.execute('''
                        INSERT OR IGNORE INTO location_reports (
                            id, entity_type, entity_id, node_id,
                            latitude, longitude, altitude, accuracy,
                            created_at, metadata
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ''', (
                        str(report.id),
                        report.entity_type.value,
                        str(report.entity_id),
                        report.node_id,
                        report.position.latitude,
                        report.position.longitude,
                        report.position.altitude,
                        report.position.accuracy,
                        report.created_at,
                        json.dumps(report.metadata)
                    ))
                    
                    if cursor.rowcount > 0:
                        saved_count += 1
                    else:
                        skipped_count += 1
                        
                except Exception as e:
                    print(f"SyncService: Error saving report: {e}")
                    skipped_count += 1
            
            conn.commit()
            conn.close()
            
        except Exception as e:
            print(f"SyncService: Error in save_location_reports: {e}")
            skipped_count += len(reports) - saved_count
        
        return (saved_count, skipped_count)
    
    def get_own_data_since(self, since_timestamp: int, until_timestamp: Optional[int] = None) -> List[Dict[str, Any]]:
        """
        Gets this node's location data since a timestamp.
        If until_timestamp is None, defaults to current time.
        """
        if until_timestamp is None:
            until_timestamp = int(datetime.now(timezone.utc).timestamp() * 1000)
        
        node_id = self.get_my_node_id()
        reports = self.location_service.get_locations_in_range(node_id, since_timestamp, until_timestamp)
        return [report.to_dict() for report in reports]

    
    def sync_with_all_peers(self):
        """
        Syncs with all visible peers using forward/backward sync strategy.
        Forward sync: Gets new data from last_forward_sync_at + 30min
        Backward sync: Gets old data from last_backward_sync_at - 30min to last_backward_sync_at
        """
        peers = self.get_all_peers()
        
        now_ms = int(datetime.now(timezone.utc).timestamp() * 1000)
        thirty_minutes_ms = 30 * 60 * 1000  # 30 minutes in milliseconds
        
        print(f"SyncService: Starting sync with {len(peers)} peers")
        
        # Get all nodes that have location reports but aren't in current peers list
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            # Initialize entries for current peers if they don't exist
            for peer_mac, peer_ip in peers.items():
                cursor.execute('SELECT node_id FROM sync_log WHERE node_id = ?', (peer_mac,))
                if not cursor.fetchone():
                    cursor.execute('''
                        INSERT INTO sync_log (node_id, last_forward_sync_at, last_backward_sync_at)
                        VALUES (?, ?, ?)
                    ''', (peer_mac, now_ms, now_ms))
            
            conn.commit()
            conn.close()
            
        except Exception as e:
            print(f"SyncService: Error initializing sync_log entries: {e}")
        
        for peer_mac, peer_ip in peers.items():
            try:
                # Get sync times for this peer
                forward_sync_at, backward_sync_at = self.get_last_sync_times(peer_mac)
                
                # Forward sync: Get new data from last_forward_sync_at to now (in 30min chunks)
                # We sync 30 minutes at a time to avoid pulling too much data at once
                forward_from: int = forward_sync_at
                forward_until: int = min(forward_from + thirty_minutes_ms, now_ms)
                forward_data: List[LocationReport] = self.pull_data_from_peer(peer_ip, forward_from, forward_until)
                
                # Save forward sync data and find latest created_at
                forward_latest = forward_sync_at
                if forward_data:
                    self.location_service.add_locations_batch(forward_data)
                    
                    # Find latest created_at in forward data
                    for report in forward_data:
                        created_at = report.created_at
                        if created_at > forward_latest:
                            forward_latest = created_at
                
                # Backward sync: Get old data from (backward_sync_at - 30min) to backward_sync_at
                # This fills gaps in historical data
                backward_from = max(0, backward_sync_at - thirty_minutes_ms)
                backward_data: List[LocationReport] = self.pull_data_from_peer(peer_ip, backward_from, backward_sync_at)
                
                # Save backward sync data and find oldest created_at
                backward_oldest = backward_sync_at
                if backward_data:
                    self.location_service.add_locations_batch(backward_data)
                    
                    # Find oldest created_at in backward data
                    for report in backward_data:
                        created_at = report.created_at
                        if created_at < backward_oldest or backward_oldest == backward_sync_at:
                            backward_oldest = created_at
                
                self.update_sync_times(peer_mac, forward_latest, backward_oldest)
                
            except Exception as e:
                error_msg = f"Error syncing with {peer_mac} ({peer_ip}): {str(e)}"
                print(f"SyncService: {error_msg}")
    
    def get_sync_log_status(self) -> List[Dict[str, Any]]:
        """
        Get sync_log status for all nodes.
        Returns a list of sync_log entries with readable timestamps.
        """
        try:
            conn = sqlite3.connect(self.db_path)
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            
            cursor.execute('''
                SELECT node_id, last_forward_sync_at, last_backward_sync_at
                FROM sync_log
                ORDER BY last_forward_sync_at DESC
            ''')
            
            rows = cursor.fetchall()
            conn.close()
            
            now_ms = int(datetime.now(timezone.utc).timestamp() * 1000)
            
            status_list = []
            for row in rows:
                forward_sync_at = row['last_forward_sync_at'] if row['last_forward_sync_at'] else 0
                backward_sync_at = row['last_backward_sync_at'] if row['last_backward_sync_at'] else 0
                
                status_list.append({
                    'node_id': row['node_id'],
                    'last_forward_sync_at': forward_sync_at,
                    'last_backward_sync_at': backward_sync_at,
                    'last_forward_sync_at_readable': datetime.fromtimestamp(forward_sync_at / 1000, tz=timezone.utc).isoformat() if forward_sync_at > 0 else None,
                    'last_backward_sync_at_readable': datetime.fromtimestamp(backward_sync_at / 1000, tz=timezone.utc).isoformat() if backward_sync_at > 0 else None,
                    'forward_sync_age_ms': now_ms - forward_sync_at if forward_sync_at > 0 else None,
                    'backward_sync_age_ms': now_ms - backward_sync_at if backward_sync_at > 0 else None
                })
            
            return status_list
            
        except Exception as e:
            print(f"SyncService: Error getting sync log status: {e}")
            return []


# --- Singleton setup (matches cluster_service.py) ---
_sync_service = None

def get_sync_service() -> SyncService:
    """Get the singleton SyncService instance"""
    global _sync_service
    if _sync_service is None:
        _sync_service = SyncService()
    return _sync_service

