"""
Service for handling data synchronization between mesh nodes.
"""

import subprocess
import json
import platform
import uuid
import sqlite3
from typing import List, Dict, Any, Optional
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
from models.location import LocationReport, EntityType, GeoLocation


class SyncService:
    """Service for synchronizing data between mesh nodes"""
    
    def __init__(self, db_path: str = None, cluster_service=None):
        if db_path is None:
            db_path = str(Path(__file__).parent.parent / 'data' / 'messaging.db')
        self.db_path = db_path
        self.cluster_service = cluster_service or get_cluster_service()
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
            print("SyncService: WARNING: Cannot run 'batctl' on Windows. Returning mock peers.")
            return {
                "aa:aa:aa:aa:aa:aa": "169.254.170.170",
                "bb:bb:bb:bb:bb:bb": "169.254.187.187",
            }
        
        try:
            # Run `batctl o -f json` to get the list of mesh originators (nodes)
            result = subprocess.run(
                ['sudo', 'batctl', 'o', '-f', 'json'],
                capture_output=True, text=True, timeout=5, check=True
            )
            
            # The output is a stream of JSON objects, one per line
            for line in result.stdout.strip().split('\n'):
                if not line.strip():
                    continue
                try:
                    data = json.loads(line)
                    # The 'originator' is the node's MAC address
                    peer_mac = data.get("originator")
                    if peer_mac and peer_mac != my_node_id:
                        peer_ip = self._calculate_ip_from_mac(peer_mac)
                        if peer_ip:
                            peers[peer_mac] = peer_ip
                except json.JSONDecodeError:
                    print(f"SyncService: Warning: Could not parse batctl line: {line}")
                    
        except FileNotFoundError:
            print("SyncService: Error: 'sudo' or 'batctl' command not found.")
            return {}
        except subprocess.CalledProcessError as e:
            print(f"SyncService: Error running batctl: {e.stderr}")
            return {}
        except Exception as e:
            print(f"SyncService: Error processing batctl output: {e}")
            return {}
            
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
            
            return f"{self.ip_range_base}.{o3}.{o4}"
        except Exception as e:
            print(f"SyncService: Error calculating IP for {mac}: {e}")
            return None
    
    def get_last_sync_time(self, peer_node_id: str) -> int:
        """
        Gets the last sync timestamp (ms) for a given peer from the local DB.
        """
        try:
            conn = sqlite3.connect(self.db_path)
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            
            cursor.execute('SELECT last_sync_at FROM sync_log WHERE peer_node_id = ?', (peer_node_id,))
            row = cursor.fetchone()
            conn.close()
            
            return row['last_sync_at'] if row else 0
        except Exception as e:
            print(f"SyncService: Error getting last sync time for {peer_node_id}: {e}")
            return 0  # Default to 0 on error
    
    def update_last_sync_time(self, peer_node_id: str, peer_ip: str):
        """
        Updates the last sync timestamp and IP for a peer.
        """
        try:
            now_ms = int(datetime.now(timezone.utc).timestamp() * 1000)
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            # Check if entry exists
            cursor.execute('SELECT peer_node_id FROM sync_log WHERE peer_node_id = ?', (peer_node_id,))
            exists = cursor.fetchone()
            
            if exists:
                cursor.execute('''
                    UPDATE sync_log 
                    SET last_sync_at = ?, last_known_ip = ?
                    WHERE peer_node_id = ?
                ''', (now_ms, peer_ip, peer_node_id))
            else:
                cursor.execute('''
                    INSERT INTO sync_log (peer_node_id, last_known_ip, last_sync_at)
                    VALUES (?, ?, ?)
                ''', (peer_node_id, peer_ip, now_ms))
            
            conn.commit()
            conn.close()
        except Exception as e:
            print(f"SyncService: Error updating sync time for {peer_node_id}: {e}")
    
    def pull_data_from_peer(self, peer_ip: str, since_timestamp: int) -> str:
        """
        Pulls new data from a peer's /api/sync endpoint.
        Calls the peer's API and prints the received data (does not save to DB yet).
        """
        if requests is None:
            return f"Error: 'requests' library not installed. Cannot pull data from {peer_ip}"
        
        try:
            url = f"http://{peer_ip}:5000/api/sync?since={since_timestamp}"
            print(f"  Pulling data from peer {peer_ip}...")
            print(f"  URL: {url}")
            
            response = requests.get(url, timeout=5)
            response.raise_for_status()
            
            # Parse response
            response_data = response.json()
            
            if response_data.get('status') != 'success':
                error_msg = f"Peer returned error: {response_data.get('message', 'Unknown error')}"
                print(f"  Error: {error_msg}")
                return error_msg
            
            # Get the data array from the response
            data_list = response_data.get('data', [])
            count = response_data.get('count', 0)
            
            print(f"  Successfully pulled {count} location reports from {peer_ip}")
            print(f"  Data received:")
            for i, report in enumerate(data_list, 1):
                print(f"    Report {i}:")
                print(f"      ID: {report.get('id')}")
                print(f"      Entity Type: {report.get('entity_type')}")
                print(f"      Entity ID: {report.get('entity_id')}")
                print(f"      Node ID: {report.get('node_id')}")
                print(f"      Position: {report.get('position')}")
                print(f"      Created At: {report.get('created_at')}")
                print(f"      Metadata: {report.get('metadata')}")
            
            return f"Pulled {count} new reports from {peer_ip} (printed, not saved to DB)"
            
        except requests.exceptions.Timeout:
            error_msg = f"Timeout connecting to {peer_ip}"
            print(f"  Error: {error_msg}")
            return error_msg
        except requests.exceptions.ConnectionError as e:
            error_msg = f"Connection error to {peer_ip}: {str(e)}"
            print(f"  Error: {error_msg}")
            return error_msg
        except requests.exceptions.RequestException as e:
            error_msg = f"Request failed: {str(e)}"
            print(f"  Error: {error_msg}")
            return error_msg
        except json.JSONDecodeError as e:
            error_msg = f"Failed to parse response from {peer_ip}: {str(e)}"
            print(f"  Error: {error_msg}")
            return error_msg
        except Exception as e:
            error_msg = f"Unexpected error pulling data from {peer_ip}: {str(e)}"
            print(f"  Error: {error_msg}")
            return error_msg
    
    def get_own_data_since(self, since_timestamp: int) -> List[Dict[str, Any]]:
        """
        Gets this node's own data that is newer than the timestamp.
        Queries the database for location_reports where node_id matches this node
        and created_at is greater than since_timestamp.
        """
        my_node_id = self.get_my_node_id()
        
        try:
            conn = sqlite3.connect(self.db_path)
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            
            # Query location_reports for this node_id with created_at > since_timestamp
            cursor.execute('''
                SELECT * FROM location_reports
                WHERE node_id = ? AND created_at > ?
                ORDER BY created_at ASC
            ''', (my_node_id, since_timestamp))
            
            rows = cursor.fetchall()
            conn.close()
            
            # Convert DB rows to LocationReport dataclasses, then to dicts
            reports = []
            for row in rows:
                # Parse metadata JSON
                metadata = {}
                if row['metadata']:
                    try:
                        metadata = json.loads(row['metadata'])
                    except json.JSONDecodeError:
                        metadata = {}
                
                # Create LocationReport from database row
                report = LocationReport(
                    id=UUID(row['id']),
                    entity_type=EntityType(row['entity_type']),
                    entity_id=UUID(row['entity_id']),
                    node_id=row['node_id'],
                    position=GeoLocation(
                        latitude=row['latitude'],
                        longitude=row['longitude'],
                        altitude=row['altitude'],
                        accuracy=row['accuracy']
                    ),
                    created_at=row['created_at'],
                    metadata=metadata
                )
                reports.append(report.to_dict())
            
            print(f"  Found {len(reports)} location reports for node {my_node_id} since {since_timestamp}")
            return reports
            
        except sqlite3.Error as e:
            print(f"SyncService: Database error getting own data: {e}")
            return []
        except Exception as e:
            print(f"SyncService: Error getting own data: {e}")
            return []
    
    def sync_with_all_peers(self) -> Dict[str, Any]:
        """
        Syncs with all visible peers in the mesh network.
        Returns a summary of the sync operation.
        """
        peers = self.get_all_peers()
        results = {
            "peers_found": len(peers),
            "peers_synced": 0,
            "errors": [],
            "messages": []
        }
        
        my_node_id = self.get_my_node_id()
        
        for peer_mac, peer_ip in peers.items():
            try:
                # Get last sync time for this peer
                last_sync = self.get_last_sync_time(peer_mac)
                
                # Pull data from peer
                pull_result = self.pull_data_from_peer(peer_ip, last_sync)
                results["messages"].append(f"Peer {peer_mac} ({peer_ip}): {pull_result}")
                
                # Check if pull was successful (not an error message)
                if pull_result.startswith("Pulled") or "new reports" in pull_result:
                    # Update sync time only if pull was successful
                    self.update_last_sync_time(peer_mac, peer_ip)
                    results["peers_synced"] += 1
                else:
                    # Pull failed, add to errors
                    results["errors"].append(f"Failed to pull from {peer_mac} ({peer_ip}): {pull_result}")
                
            except Exception as e:
                error_msg = f"Error syncing with {peer_mac} ({peer_ip}): {str(e)}"
                results["errors"].append(error_msg)
                print(f"SyncService: {error_msg}")
        
        return results
    
    def test_pull_all_peers(self, since_timestamp: int = 0) -> Dict[str, Any]:
        """
        Test function that pulls data from all peers with a given timestamp.
        This is a simpler version for testing - it doesn't update sync logs.
        
        Args:
            since_timestamp: Timestamp to use for all peers (default: 0)
            
        Returns:
            Dictionary with results of the test pull operation
        """
        peers = self.get_all_peers()
        results = {
            "peers_found": len(peers),
            "peers_attempted": 0,
            "messages": [],
            "errors": []
        }
        
        print(f"Test: Pulling data from {len(peers)} peers with since={since_timestamp}")
        
        for peer_mac, peer_ip in peers.items():
            try:
                results["peers_attempted"] += 1
                print(f"\nTest: Attempting to pull from peer {peer_mac} ({peer_ip})...")
                
                # Pull data from peer (will print to console)
                pull_result = self.pull_data_from_peer(peer_ip, since_timestamp)
                results["messages"].append(f"Peer {peer_mac} ({peer_ip}): {pull_result}")
                
                # Check if it was successful
                if pull_result.startswith("Pulled") or "new reports" in pull_result:
                    print(f"Test: ✓ Successfully pulled from {peer_mac}")
                else:
                    results["errors"].append(f"Peer {peer_mac} ({peer_ip}): {pull_result}")
                    print(f"Test: ✗ Failed to pull from {peer_mac}")
                    
            except Exception as e:
                error_msg = f"Error testing pull from {peer_mac} ({peer_ip}): {str(e)}"
                results["errors"].append(error_msg)
                print(f"Test: Exception - {error_msg}")
        
        print(f"\nTest: Completed. Attempted {results['peers_attempted']} peers, "
              f"{len([m for m in results['messages'] if 'Pulled' in m])} successful, "
              f"{len(results['errors'])} errors")
        
        return results


# --- Singleton setup (matches cluster_service.py) ---
_sync_service = None

def get_sync_service() -> SyncService:
    """Get the singleton SyncService instance"""
    global _sync_service
    if _sync_service is None:
        _sync_service = SyncService()
    return _sync_service

