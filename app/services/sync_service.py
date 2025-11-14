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
        (MOCK: Returns a string for testing)
        """
        print(f"  MOCK PULL: Calling http://{peer_ip}/api/sync?since={since_timestamp}")
        
        # --- REAL IMPLEMENTATION (for later) ---
        # try:
        #    response = requests.get(f"http://{peer_ip}/api/sync?since={since_timestamp}", timeout=5)
        #    response.raise_for_status()
        #    new_reports_data = response.json()  # This is a list of dicts
        #    
        #    # Convert dicts back to LocationReport dataclasses
        #    new_reports = [LocationReport.from_dict(data) for data in new_reports_data]
        #
        #    # Save to our database
        #    # location_service = get_location_service()
        #    # for report in new_reports:
        #    #     location_service.add_location(report)  # Use INSERT OR IGNORE
        #
        #    return f"Pulled {len(new_reports)} new reports."
        # except requests.exceptions.RequestException as e:
        #    print(f"  Pull failed: {e}")
        #    return "Pull failed"
        
        # MOCK IMPLEMENTATION
        return f"MOCK: Pulled 1 new report from {peer_ip}"
    
    def get_own_data_since(self, since_timestamp: int) -> List[Dict[str, Any]]:
        """
        Gets this node's own data that is newer than the timestamp.
        (MOCK: Returns a dict for testing)
        """
        my_node_id = self.get_my_node_id()
        print(f"  MOCK SERVE: Peer asked for {my_node_id} data since {since_timestamp}")
        
        # --- REAL IMPLEMENTATION (for later) ---
        # conn = sqlite3.connect(self.db_path)
        # conn.row_factory = sqlite3.Row
        # cursor = conn.cursor()
        #
        # cursor.execute('''
        #     SELECT * FROM location_reports
        #     WHERE node_id = ? AND created_at > ?
        #     ORDER BY created_at ASC
        # ''', (my_node_id, since_timestamp))
        #
        # rows = cursor.fetchall()
        # conn.close()
        #
        # # Convert DB rows to LocationReport dataclasses, then to dicts
        # reports = []
        # for row in rows:
        #     metadata = {}
        #     if row['metadata']:
        #         try:
        #             metadata = json.loads(row['metadata'])
        #         except json.JSONDecodeError:
        #             metadata = {}
        #
        #     report = LocationReport(
        #         id=UUID(row['id']),
        #         entity_type=EntityType(row['entity_type']),
        #         entity_id=UUID(row['entity_id']),
        #         node_id=row['node_id'],
        #         position=GeoLocation(
        #             latitude=row['latitude'],
        #             longitude=row['longitude'],
        #             altitude=row['altitude'],
        #             accuracy=row['accuracy']
        #         ),
        #         created_at=row['created_at'],
        #         metadata=metadata
        #     )
        #     reports.append(report.to_dict())
        #
        # return reports
        
        # MOCK IMPLEMENTATION
        return [
            {
                "id": str(uuid.uuid4()),
                "entity_type": "responder",
                "entity_id": str(uuid.uuid4()),
                "node_id": my_node_id,
                "created_at": int(datetime.now(timezone.utc).timestamp() * 1000),
                "position": {"lat": 52.37, "lon": 4.91, "alt": None, "accuracy": None},
                "metadata": {"name": "Mock Responder Data"}
            }
        ]
    
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
                
                # Update sync time
                self.update_last_sync_time(peer_mac, peer_ip)
                results["peers_synced"] += 1
                
            except Exception as e:
                error_msg = f"Error syncing with {peer_mac} ({peer_ip}): {str(e)}"
                results["errors"].append(error_msg)
                print(f"SyncService: {error_msg}")
        
        return results


# --- Singleton setup (matches cluster_service.py) ---
_sync_service = None

def get_sync_service() -> SyncService:
    """Get the singleton SyncService instance"""
    global _sync_service
    if _sync_service is None:
        _sync_service = SyncService()
    return _sync_service

