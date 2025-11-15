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
        print(f"SyncService: get_all_peers() - My node ID: {my_node_id}")
        
        # Mock data for local testing on Windows
        if platform.system() == "Windows":
            print("SyncService: WARNING: Cannot run 'batctl' on Windows. Returning mock peers.")
            return {
                "aa:aa:aa:aa:aa:aa": "169.254.170.170",
                "bb:bb:bb:bb:bb:bb": "169.254.187.187",
            }
        
        try:
            print("SyncService: Running 'sudo batctl o' to get mesh originators...")
            # Run `batctl o` to get the list of mesh originators (nodes)
            # Note: `-f json` is not supported in all versions, so we parse text output
            result = subprocess.run(
                ['sudo', 'batctl', 'o'],
                capture_output=True, text=True, timeout=5, check=True
            )
            
            print(f"SyncService: batctl stdout length: {len(result.stdout)} chars")
            print(f"SyncService: batctl stderr: {result.stderr if result.stderr else '(empty)'}")
            
            if not result.stdout.strip():
                print("SyncService: batctl returned empty output")
                return {}
            
            # Parse text output - each line contains originator info
            # Format is typically: "Originator      last-seen" or MAC addresses in lines
            lines = result.stdout.strip().split('\n')
            print(f"SyncService: Parsing {len(lines)} lines from batctl output")
            
            # Regular expression to match MAC addresses (xx:xx:xx:xx:xx:xx)
            mac_pattern = re.compile(r'([0-9a-fA-F]{2}[:-]){5}([0-9a-fA-F]{2})')
            
            for line_num, line in enumerate(lines, 1):
                if not line.strip():
                    continue
                
                print(f"SyncService: Line {line_num}: {line[:80]}")  # Print first 80 chars
                
                # Skip header lines
                if 'Originator' in line and 'last-seen' in line:
                    print(f"SyncService: Skipping header line")
                    continue
                if line.startswith('[B.A.T.M.A.N.'):
                    print(f"SyncService: Skipping B.A.T.M.A.N. version line")
                    continue
                
                # Find MAC address in the line
                mac_matches = mac_pattern.findall(line)
                if mac_matches:
                    # Extract the full MAC address
                    # mac_pattern.findall returns tuples, we need to reconstruct
                    mac_match = mac_pattern.search(line)
                    if mac_match:
                        peer_mac = mac_match.group(0).replace('-', ':')  # Normalize to colons
                        peer_mac = peer_mac.lower()  # Normalize to lowercase
                        
                        print(f"SyncService: Found MAC: {peer_mac}")
                        
                        # Skip if it's our own node ID
                        if peer_mac == my_node_id:
                            print(f"SyncService: Skipping own node ID: {peer_mac}")
                            continue
                        
                        # Calculate IP from MAC
                        peer_ip = self._calculate_ip_from_mac(peer_mac)
                        if peer_ip:
                            peers[peer_mac] = peer_ip
                            print(f"SyncService: Added peer {peer_mac} -> {peer_ip}")
                        else:
                            print(f"SyncService: Failed to calculate IP for {peer_mac}")
                    else:
                        print(f"SyncService: Could not extract MAC from line")
                else:
                    print(f"SyncService: No MAC address found in line")
                    
        except FileNotFoundError as e:
            print(f"SyncService: Error: 'sudo' or 'batctl' command not found: {e}")
            return {}
        except subprocess.CalledProcessError as e:
            print(f"SyncService: Error running batctl:")
            print(f"  Return code: {e.returncode}")
            print(f"  stdout: {e.stdout}")
            print(f"  stderr: {e.stderr}")
            return {}
        except Exception as e:
            print(f"SyncService: Unexpected error processing batctl output: {type(e).__name__}: {e}")
            import traceback
            traceback.print_exc()
            return {}
        
        print(f"SyncService: Found {len(peers)} peers total: {list(peers.keys())}")
        return peers
    
    def _calculate_ip_from_mac(self, mac: str) -> Optional[str]:
        """
        Calculates a node's IP from its MAC address,
        using the exact logic from setup-mesh.sh.
        """
        try:
            print(f"SyncService: Calculating IP for MAC: {mac}")
            parts = mac.split(':')
            print(f"SyncService: MAC parts: {parts} (count: {len(parts)})")
            
            if len(parts) != 6:
                print(f"SyncService: Invalid MAC format - expected 6 parts, got {len(parts)}")
                return None
            
            # This is the logic from setup-mesh.sh:
            # Extract last 2 bytes (parts[4] and parts[5])
            # Convert hex to decimal for octet 3 and 4
            o3 = int(parts[4], 16)
            o4 = int(parts[5], 16)
            
            ip = f"{self.ip_range_base}.{o3}.{o4}"
            print(f"SyncService: Calculated IP: {ip} (from octets {parts[4]}={o3}, {parts[5]}={o4})")
            return ip
        except Exception as e:
            print(f"SyncService: Error calculating IP for {mac}: {type(e).__name__}: {e}")
            import traceback
            traceback.print_exc()
            return None
    
    def get_last_sync_time(self, peer_node_id: str) -> int:
        """
        Gets the last sync timestamp (ms) for a given peer from the local DB sync_log table.
        Returns 0 if no sync_log entry exists for this peer.
        """
        try:
            conn = sqlite3.connect(self.db_path)
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            
            # First check if table exists
            cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='sync_log'")
            table_exists = cursor.fetchone()
            
            if not table_exists:
                print(f"SyncService: WARNING - sync_log table does not exist!")
                conn.close()
                return 0
            
            # Query the sync_log table
            cursor.execute('SELECT last_sync_at, last_known_ip FROM sync_log WHERE peer_node_id = ?', (peer_node_id,))
            row = cursor.fetchone()
            
            if row:
                last_sync_at = row['last_sync_at'] if row['last_sync_at'] else 0
                last_ip = row['last_known_ip'] if row['last_known_ip'] else 'unknown'
                conn.close()
                return last_sync_at
            else:
                # No entry in sync_log yet
                conn.close()
                return 0
        except sqlite3.Error as e:
            print(f"SyncService: Database error getting last sync time for {peer_node_id}: {e}")
            import traceback
            traceback.print_exc()
            if 'conn' in locals():
                conn.close()
            return 0  # Default to 0 on error
        except Exception as e:
            print(f"SyncService: Error getting last sync time for {peer_node_id}: {e}")
            import traceback
            traceback.print_exc()
            if 'conn' in locals():
                conn.close()
            return 0  # Default to 0 on error
    
    def update_last_sync_time(self, peer_node_id: str, peer_ip: str):
        """
        Updates the last sync timestamp and IP for a peer in the sync_log table.
        Creates a new entry if one doesn't exist, or updates existing entry.
        """
        try:
            now_ms = int(datetime.now(timezone.utc).timestamp() * 1000)
            now_readable = datetime.fromtimestamp(now_ms / 1000, tz=timezone.utc).isoformat()
            
            print(f"\n{'='*60}")
            print(f"SyncService: update_last_sync_time() - ENTRY")
            print(f"{'='*60}")
            print(f"  peer_node_id: '{peer_node_id}'")
            print(f"  peer_ip: '{peer_ip}'")
            print(f"  new_timestamp: {now_ms}")
            print(f"  new_timestamp_readable: {now_readable}")
            print(f"  db_path: {self.db_path}")
            
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            # Check if entry exists BEFORE update
            cursor.execute('SELECT peer_node_id, last_known_ip, last_sync_at FROM sync_log WHERE peer_node_id = ?', (peer_node_id,))
            existing = cursor.fetchone()
            
            if existing:
                old_timestamp = existing[2] if existing[2] else 0
                old_ip = existing[1] if existing[1] else 'unknown'
                old_readable = datetime.fromtimestamp(old_timestamp / 1000, tz=timezone.utc).isoformat() if old_timestamp > 0 else 'never'
                
                print(f"  Found existing entry:")
                print(f"    old_timestamp: {old_timestamp}")
                print(f"    old_timestamp_readable: {old_readable}")
                print(f"    old_ip: {old_ip}")
                
                # Update the entry
                cursor.execute('''
                    UPDATE sync_log 
                    SET last_sync_at = ?, last_known_ip = ?
                    WHERE peer_node_id = ?
                ''', (now_ms, peer_ip, peer_node_id))
                
                print(f"  Executing UPDATE...")
                print(f"    UPDATE sync_log SET last_sync_at={now_ms}, last_known_ip='{peer_ip}' WHERE peer_node_id='{peer_node_id}'")
            else:
                print(f"  No existing entry found, creating new entry")
                
                # Insert new entry
                cursor.execute('''
                    INSERT INTO sync_log (peer_node_id, last_known_ip, last_sync_at)
                    VALUES (?, ?, ?)
                ''', (peer_node_id, peer_ip, now_ms))
                
                print(f"  Executing INSERT...")
                print(f"    INSERT INTO sync_log (peer_node_id, last_known_ip, last_sync_at)")
                print(f"    VALUES ('{peer_node_id}', '{peer_ip}', {now_ms})")
            
            # Commit the transaction
            conn.commit()
            print(f"  Transaction committed")
            
            # Verify the update/insert by querying the table
            cursor.execute('SELECT peer_node_id, last_known_ip, last_sync_at FROM sync_log WHERE peer_node_id = ?', (peer_node_id,))
            verify_row = cursor.fetchone()
            
            if verify_row:
                verify_timestamp = verify_row[2] if verify_row[2] else 0
                verify_ip = verify_row[1] if verify_row[1] else 'unknown'
                verify_readable = datetime.fromtimestamp(verify_timestamp / 1000, tz=timezone.utc).isoformat() if verify_timestamp > 0 else 'never'
                
                print(f"  ✓ VERIFICATION - Entry in sync_log table:")
                print(f"    peer_node_id: '{verify_row[0]}'")
                print(f"    last_known_ip: '{verify_ip}'")
                print(f"    last_sync_at: {verify_timestamp}")
                print(f"    last_sync_at_readable: {verify_readable}")
                
                if verify_timestamp == now_ms and verify_ip == peer_ip:
                    print(f"  ✓ VERIFICATION PASSED - Data matches!")
                else:
                    print(f"  ✗ VERIFICATION FAILED - Data mismatch!")
                    print(f"    Expected timestamp: {now_ms}, Got: {verify_timestamp}")
                    print(f"    Expected IP: {peer_ip}, Got: {verify_ip}")
            else:
                print(f"  ✗ VERIFICATION FAILED - Entry not found in table after insert/update!")
            
            # Also show all entries in sync_log for debugging
            cursor.execute('SELECT COUNT(*) FROM sync_log')
            total_count = cursor.fetchone()[0]
            print(f"  Total entries in sync_log table: {total_count}")
            
            if total_count > 0:
                cursor.execute('SELECT peer_node_id, last_known_ip, last_sync_at FROM sync_log ORDER BY last_sync_at DESC')
                all_rows = cursor.fetchall()
                print(f"  All entries in sync_log:")
                for idx, row in enumerate(all_rows, 1):
                    row_timestamp = row[2] if row[2] else 0
                    row_readable = datetime.fromtimestamp(row_timestamp / 1000, tz=timezone.utc).isoformat() if row_timestamp > 0 else 'never'
                    print(f"    {idx}. peer_node_id='{row[0]}', IP='{row[1]}', last_sync_at={row_timestamp} ({row_readable})")
            
            conn.close()
            print(f"{'='*60}\n")
            
        except Exception as e:
            print(f"\n{'='*60}")
            print(f"SyncService: ERROR updating sync time for {peer_node_id}")
            print(f"  Error: {type(e).__name__}: {e}")
            print(f"{'='*60}\n")
            import traceback
            traceback.print_exc()
    
    def log_incoming_sync_request(self, peer_ip: str, peer_node_id: Optional[str] = None):
        """
        Log when a peer pulls data from us (incoming sync request).
        If we don't know the peer's node_id, we'll try to find it from IP or create a placeholder entry.
        
        Args:
            peer_ip: IP address of the peer making the request
            peer_node_id: Optional node ID (MAC address) of the peer
        """
        try:
            # If we don't have node_id, try to find it from peers list or use IP as identifier
            if peer_node_id is None:
                # Try to find node_id from known peers by IP
                peers = self.get_all_peers()
                for mac, ip in peers.items():
                    if ip == peer_ip:
                        peer_node_id = mac
                        break
                
                # If still not found, use IP as temporary identifier
                # (Note: sync_log uses peer_node_id as primary key, so this won't work perfectly)
                # For now, we'll just log it if we can find a matching peer
                if peer_node_id is None:
                    print(f"SyncService: Incoming sync request from {peer_ip} - peer not in known peers list, skipping log")
                    return
            
            now_ms = int(datetime.now(timezone.utc).timestamp() * 1000)
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            # Check if entry exists
            cursor.execute('SELECT peer_node_id FROM sync_log WHERE peer_node_id = ?', (peer_node_id,))
            exists = cursor.fetchone()
            
            if exists:
                # Update the entry (update IP if changed, but don't update last_sync_at)
                # The last_sync_at in this table tracks when WE synced with THEM, not when they sync with us
                # But we can still log the IP
                cursor.execute('''
                    UPDATE sync_log 
                    SET last_known_ip = ?
                    WHERE peer_node_id = ?
                ''', (peer_ip, peer_node_id))
            else:
                # Create new entry with last_sync_at = 0 since we haven't synced with them yet
                cursor.execute('''
                    INSERT INTO sync_log (peer_node_id, last_known_ip, last_sync_at)
                    VALUES (?, ?, ?)
                ''', (peer_node_id, peer_ip, 0))
            
            conn.commit()
            conn.close()
            print(f"SyncService: Logged incoming sync request from peer {peer_node_id} ({peer_ip})")
        except Exception as e:
            print(f"SyncService: Error logging incoming sync request from {peer_ip}: {e}")
    
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
    
    def pull_data_from_peer(self, peer_ip: str, since_timestamp: int) -> Tuple[str, List[Dict[str, Any]]]:
        """
        Pulls new data from a peer's /api/sync endpoint.
        
        Returns:
            Tuple of (status_message, data_list) where:
            - status_message: Human-readable status message
            - data_list: List of location report dicts (empty on error)
        """
        if requests is None:
            error_msg = f"Error: 'requests' library not installed. Cannot pull data from {peer_ip}"
            return (error_msg, [])
        
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
                return (error_msg, [])
            
            # Get the data array from the response
            data_list = response_data.get('data', [])
            count = response_data.get('count', 0)
            
            print(f"  Successfully pulled {count} location reports from {peer_ip}")
            
            return (f"Pulled {count} new reports from {peer_ip}", data_list)
            
        except requests.exceptions.Timeout:
            error_msg = f"Timeout connecting to {peer_ip} (peer may be slow or unreachable)"
            print(f"  Error: {error_msg}")
            return (error_msg, [])
        except requests.exceptions.ConnectionError as e:
            # Extract more specific error information
            specific_error = self._extract_connection_error_type(e)
            error_msg = f"Connection error to {peer_ip}: {specific_error}"
            print(f"  Error: {error_msg}")
            print(f"  Full error details: {str(e)}")
            return (error_msg, [])
        except requests.exceptions.RequestException as e:
            error_msg = f"Request failed to {peer_ip}: {str(e)[:200]}"
            print(f"  Error: {error_msg}")
            return (error_msg, [])
        except json.JSONDecodeError as e:
            error_msg = f"Failed to parse response from {peer_ip}: {str(e)}"
            print(f"  Error: {error_msg}")
            return (error_msg, [])
        except Exception as e:
            error_msg = f"Unexpected error pulling data from {peer_ip}: {str(e)}"
            print(f"  Error: {error_msg}")
            return (error_msg, [])
    
    def save_location_reports(self, reports: List[Dict[str, Any]]) -> Tuple[int, int]:
        """
        Save location reports from peer data to the database.
        
        Args:
            reports: List of location report dicts (from peer API response)
            
        Returns:
            Tuple of (saved_count, skipped_count) where:
            - saved_count: Number of reports successfully saved
            - skipped_count: Number of reports skipped (duplicates or errors)
        """
        saved_count = 0
        skipped_count = 0
        
        for report_dict in reports:
            try:
                # Convert dict to LocationReport object
                report = LocationReport.from_dict(report_dict)
                
                # Check if this report already exists (by id)
                try:
                    conn = sqlite3.connect(self.db_path)
                    cursor = conn.cursor()
                    cursor.execute('SELECT id FROM location_reports WHERE id = ?', (str(report.id),))
                    exists = cursor.fetchone()
                    conn.close()
                    
                    if exists:
                        print(f"  Skipping duplicate report ID: {report.id}")
                        skipped_count += 1
                        continue
                except Exception as e:
                    print(f"  Warning: Error checking for duplicate report {report.id}: {e}")
                    # Continue anyway - try to save and catch duplicate error
                
                # Save the report using LocationService
                # Wrap in try/except to catch IntegrityError if duplicate somehow gets through
                try:
                    self.location_service.add_location(report)
                    saved_count += 1
                except sqlite3.IntegrityError:
                    # Duplicate primary key - already exists
                    print(f"  Skipping duplicate report ID (integrity error): {report.id}")
                    skipped_count += 1
                
            except Exception as e:
                print(f"  Error saving report: {e}")
                print(f"    Report data: {report_dict}")
                skipped_count += 1
        
        return (saved_count, skipped_count)
    
    def get_own_data_since(self, since_timestamp: int) -> List[Dict[str, Any]]:
        """
        Gets this node's own data that is newer than the timestamp.
        Queries the database for location_reports where node_id matches this node
        and created_at is greater than since_timestamp.
        """
        my_node_id = self.get_my_node_id()
        print(f"\n{'='*60}")
        print(f"SyncService: get_own_data_since() - DEBUG INFO")
        print(f"{'='*60}")
        print(f"SyncService: My node ID from get_my_node_id(): '{my_node_id}'")
        print(f"SyncService: My node ID type: {type(my_node_id)}")
        print(f"SyncService: My node ID length: {len(my_node_id)}")
        print(f"SyncService: My node ID repr: {repr(my_node_id)}")
        print(f"SyncService: Since timestamp: {since_timestamp}")
        print(f"{'='*60}\n")
        
        try:
            conn = sqlite3.connect(self.db_path)
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            
            # Check total count of reports
            cursor.execute('SELECT COUNT(*) FROM location_reports')
            total_count = cursor.fetchone()[0]
            print(f"SyncService: Total location reports in database: {total_count}\n")
            
            # Get ALL entries from the database to see what's stored
            print(f"SyncService: {'-'*60}")
            print(f"SyncService: ALL ENTRIES IN DATABASE:")
            print(f"SyncService: {'-'*60}")
            cursor.execute('SELECT id, node_id, entity_type, entity_id, created_at FROM location_reports ORDER BY created_at')
            all_rows = cursor.fetchall()
            
            if len(all_rows) == 0:
                print("SyncService:   (No entries found)")
            else:
                for idx, row in enumerate(all_rows, 1):
                    print(f"SyncService:   Entry {idx}:")
                    print(f"SyncService:     ID: {row['id']}")
                    print(f"SyncService:     node_id: '{row['node_id']}' (type: {type(row['node_id'])}, len: {len(row['node_id'])})")
                    print(f"SyncService:     node_id repr: {repr(row['node_id'])}")
                    print(f"SyncService:     entity_type: {row['entity_type']}")
                    print(f"SyncService:     entity_id: {row['entity_id']}")
                    print(f"SyncService:     created_at: {row['created_at']}")
                    
                    # Compare with my_node_id
                    matches_exact = row['node_id'] == my_node_id
                    matches_lower = row['node_id'].lower() == my_node_id.lower()
                    print(f"SyncService:     Matches my node_id exactly: {matches_exact}")
                    print(f"SyncService:     Matches my node_id (case-insensitive): {matches_lower}")
                    if matches_lower and not matches_exact:
                        print(f"SyncService:     ⚠ CASE MISMATCH DETECTED!")
                    print()
            
            print(f"SyncService: {'-'*60}\n")
            
            # First, let's check what node_ids exist in the database
            cursor.execute('SELECT DISTINCT node_id FROM location_reports')
            all_node_ids = [row[0] for row in cursor.fetchall()]
            print(f"SyncService: Unique node_ids in database: {all_node_ids}")
            print(f"SyncService: Unique node_ids count: {len(all_node_ids)}")
            for db_node_id in all_node_ids:
                print(f"SyncService:   - '{db_node_id}' (repr: {repr(db_node_id)}, len: {len(db_node_id)})")
            print()
            
            # Check count for our node_id
            cursor.execute('SELECT COUNT(*) FROM location_reports WHERE node_id = ?', (my_node_id,))
            my_count = cursor.fetchone()[0]
            print(f"SyncService: Location reports matching my node_id exactly ('{my_node_id}'): {my_count}")
            
            # Try case-insensitive match
            cursor.execute('''
                SELECT COUNT(*) FROM location_reports 
                WHERE LOWER(node_id) = LOWER(?)
            ''', (my_node_id,))
            my_count_case_insensitive = cursor.fetchone()[0]
            print(f"SyncService: Location reports matching my node_id (case-insensitive): {my_count_case_insensitive}")
            print()
            
            # Query location_reports for this node_id with created_at > since_timestamp
            print(f"SyncService: Executing query:")
            print(f"SyncService:   WHERE node_id = '{my_node_id}' AND created_at > {since_timestamp}")
            cursor.execute('''
                SELECT * FROM location_reports
                WHERE node_id = ? AND created_at > ?
                ORDER BY created_at ASC
            ''', (my_node_id, since_timestamp))
            
            rows = cursor.fetchall()
            print(f"SyncService: Query returned {len(rows)} rows\n")
            
            # If no rows but we found matches, try case-insensitive
            if len(rows) == 0 and my_count_case_insensitive > 0:
                print(f"SyncService: ⚠ WARNING: Exact match found 0, but case-insensitive found {my_count_case_insensitive}!")
                print(f"SyncService: Trying case-insensitive query...")
                cursor.execute('''
                    SELECT * FROM location_reports
                    WHERE LOWER(node_id) = LOWER(?) AND created_at > ?
                    ORDER BY created_at ASC
                ''', (my_node_id, since_timestamp))
                rows = cursor.fetchall()
                print(f"SyncService: Case-insensitive query returned {len(rows)} rows\n")
            
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
            
            print(f"SyncService: Returning {len(reports)} location reports for node {my_node_id} since {since_timestamp}")
            return reports
            
        except sqlite3.Error as e:
            print(f"SyncService: Database error getting own data: {type(e).__name__}: {e}")
            import traceback
            traceback.print_exc()
            return []
    
    def get_node_data_since(self, node_id: str, from_timestamp: int) -> List[Dict[str, Any]]:
        """
        Gets location data for a specific node that is newer than the timestamp.
        Queries the database for location_reports where node_id matches and created_at > from_timestamp.
        """
        try:
            conn = sqlite3.connect(self.db_path)
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            
            cursor.execute('''
                SELECT * FROM location_reports
                WHERE node_id = ? AND created_at > ?
                ORDER BY created_at ASC
            ''', (node_id, from_timestamp))
            
            rows = cursor.fetchall()
            conn.close()
            
            # Convert DB rows to LocationReport dataclasses, then to dicts
            reports = []
            for row in rows:
                metadata = {}
                if row['metadata']:
                    try:
                        metadata = json.loads(row['metadata'])
                    except json.JSONDecodeError:
                        metadata = {}
                
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
            
            return reports
            
        except sqlite3.Error as e:
            print(f"SyncService: Database error getting node data: {type(e).__name__}: {e}")
            return []
        except Exception as e:
            print(f"SyncService: Error getting node data: {type(e).__name__}: {e}")
            return []
    
    def sync_with_all_peers(self) -> Dict[str, Any]:
        """
        Syncs with all visible peers in the mesh network.
        Pulls data from peers and saves it to the database.
        Uses sync_log to track timestamps per peer for incremental sync.
        Returns a summary of the sync operation.
        """
        peers = self.get_all_peers()
        results = {
            "peers_found": len(peers),
            "peers_synced": 0,
            "total_reports_pulled": 0,
            "total_reports_saved": 0,
            "total_reports_skipped": 0,
            "errors": [],
            "messages": []
        }
        
        my_node_id = self.get_my_node_id()
        
        print(f"SyncService: sync_with_all_peers() - Starting sync with {len(peers)} peers")
        
        # Check sync_log table state before sync
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            cursor.execute('SELECT COUNT(*) FROM sync_log')
            sync_log_count = cursor.fetchone()[0]
            print(f"SyncService: sync_log table currently has {sync_log_count} entries")
            if sync_log_count > 0:
                cursor.execute('SELECT peer_node_id, last_known_ip, last_sync_at FROM sync_log')
                for row in cursor.fetchall():
                    print(f"  - {row[0]} ({row[1]}): last_sync_at={row[2]}")
            conn.close()
        except Exception as e:
            print(f"SyncService: Error checking sync_log table: {e}")
        
        for peer_mac, peer_ip in peers.items():
            try:
                # Get last sync time for this peer from sync_log
                last_sync = self.get_last_sync_time(peer_mac)
                
                if last_sync > 0:
                    # Convert timestamp to readable format for logging
                    last_sync_readable = datetime.fromtimestamp(last_sync / 1000, tz=timezone.utc).isoformat()
                    age_seconds = (int(datetime.now(timezone.utc).timestamp() * 1000) - last_sync) / 1000
                    print(f"  Peer {peer_mac} ({peer_ip}): Last sync {age_seconds:.1f}s ago (at {last_sync_readable})")
                else:
                    print(f"  Peer {peer_mac} ({peer_ip}): No previous sync found, using since=0 (full sync)")
                
                # Pull data from peer using the last sync timestamp
                status_msg, data_list = self.pull_data_from_peer(peer_ip, last_sync)
                
                # Check if pull was successful (has data or success message)
                if data_list or status_msg.startswith("Pulled"):
                    # Save the location reports to database
                    if data_list:
                        saved_count, skipped_count = self.save_location_reports(data_list)
                        results["total_reports_pulled"] += len(data_list)
                        results["total_reports_saved"] += saved_count
                        results["total_reports_skipped"] += skipped_count
                        
                        msg = f"Peer {peer_mac} ({peer_ip}): {status_msg} - Saved {saved_count}, Skipped {skipped_count}"
                        results["messages"].append(msg)
                        print(f"  {msg}")
                    else:
                        results["messages"].append(f"Peer {peer_mac} ({peer_ip}): {status_msg}")
                    
                    # Update sync time since pull was successful (even if no new data)
                    print(f"\n  About to update sync_log for {peer_mac} ({peer_ip})...")
                    self.update_last_sync_time(peer_mac, peer_ip)
                    results["peers_synced"] += 1
                    
                    # Verify sync_log update by querying
                    new_sync_time = self.get_last_sync_time(peer_mac)
                    print(f"  Verification query: last_sync_at for {peer_mac} = {new_sync_time}")
                    
                    if new_sync_time > 0:
                        new_readable = datetime.fromtimestamp(new_sync_time / 1000, tz=timezone.utc).isoformat()
                        print(f"  ✓ Sync_log successfully updated: {new_sync_time} ({new_readable})")
                    else:
                        print(f"  ✗ WARNING: Sync_log update may have failed (timestamp is 0)")
                else:
                    # Pull failed, add to errors
                    error_msg = f"Failed to pull from {peer_mac} ({peer_ip}): {status_msg}"
                    results["errors"].append(error_msg)
                    results["messages"].append(error_msg)
                    print(f"  Sync_log NOT updated (pull failed)")
                
            except Exception as e:
                error_msg = f"Error syncing with {peer_mac} ({peer_ip}): {str(e)}"
                results["errors"].append(error_msg)
                results["messages"].append(error_msg)
                print(f"SyncService: {error_msg}")
        
        # Check sync_log table state AFTER sync
        print(f"\n{'='*60}")
        print(f"SyncService: sync_with_all_peers() - FINAL STATE OF sync_log TABLE")
        print(f"{'='*60}")
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            # Check if table exists
            cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='sync_log'")
            table_exists = cursor.fetchone()
            
            if not table_exists:
                print(f"  ✗ WARNING: sync_log table does not exist!")
            else:
                cursor.execute('SELECT COUNT(*) FROM sync_log')
                sync_log_count = cursor.fetchone()[0]
                print(f"  sync_log table has {sync_log_count} entries")
                
                if sync_log_count > 0:
                    cursor.execute('SELECT peer_node_id, last_known_ip, last_sync_at FROM sync_log ORDER BY last_sync_at DESC')
                    for idx, row in enumerate(cursor.fetchall(), 1):
                        row_timestamp = row[2] if row[2] else 0
                        row_readable = datetime.fromtimestamp(row_timestamp / 1000, tz=timezone.utc).isoformat() if row_timestamp > 0 else 'never'
                        print(f"    {idx}. peer_node_id='{row[0]}', IP='{row[1]}', last_sync_at={row_timestamp} ({row_readable})")
                else:
                    print(f"  ⚠ WARNING: sync_log table is empty!")
            
            conn.close()
        except Exception as e:
            print(f"  ✗ ERROR checking sync_log table: {e}")
            import traceback
            traceback.print_exc()
        
        print(f"{'='*60}\n")
        
        return results
    
    def test_pull_all_peers(self, since_timestamp: Optional[int] = None, use_sync_log: bool = True) -> Dict[str, Any]:
        """
        Test function that pulls data from all peers.
        This version saves the data to the database but doesn't update sync logs.
        
        Args:
            since_timestamp: Optional timestamp to use for all peers (overrides sync_log if provided).
                           If None and use_sync_log=True, uses timestamp from sync_log per peer.
                           If None and use_sync_log=False, defaults to 0 (full sync).
            use_sync_log: If True, use sync_log timestamps per peer. If False, use since_timestamp or 0.
            
        Returns:
            Dictionary with results of the test pull operation
        """
        peers = self.get_all_peers()
        results = {
            "peers_found": len(peers),
            "peers_attempted": 0,
            "total_reports_pulled": 0,
            "total_reports_saved": 0,
            "total_reports_skipped": 0,
            "messages": [],
            "errors": []
        }
        
        if use_sync_log:
            print(f"Test: Pulling data from {len(peers)} peers using sync_log timestamps")
        elif since_timestamp is not None:
            print(f"Test: Pulling data from {len(peers)} peers with since={since_timestamp}")
        else:
            print(f"Test: Pulling data from {len(peers)} peers with since=0 (full sync)")
        
        for peer_mac, peer_ip in peers.items():
            try:
                results["peers_attempted"] += 1
                
                # Determine which timestamp to use
                if use_sync_log and since_timestamp is None:
                    # Use sync_log timestamp for this peer
                    peer_since = self.get_last_sync_time(peer_mac)
                    if peer_since > 0:
                        age_seconds = (int(datetime.now(timezone.utc).timestamp() * 1000) - peer_since) / 1000
                        print(f"\nTest: Attempting to pull from peer {peer_mac} ({peer_ip})...")
                        print(f"  Using sync_log timestamp: {peer_since} ({age_seconds:.1f}s ago)")
                    else:
                        peer_since = 0
                        print(f"\nTest: Attempting to pull from peer {peer_mac} ({peer_ip})...")
                        print(f"  No sync_log entry found, using since=0 (full sync)")
                elif since_timestamp is not None:
                    # Use provided timestamp for all peers
                    peer_since = since_timestamp
                    print(f"\nTest: Attempting to pull from peer {peer_mac} ({peer_ip})...")
                    print(f"  Using provided timestamp: {peer_since}")
                else:
                    # Default to 0
                    peer_since = 0
                    print(f"\nTest: Attempting to pull from peer {peer_mac} ({peer_ip})...")
                    print(f"  Using since=0 (full sync)")
                
                # Pull data from peer using the determined timestamp
                status_msg, data_list = self.pull_data_from_peer(peer_ip, peer_since)
                
                # Check if it was successful
                if data_list or status_msg.startswith("Pulled"):
                    # Save the location reports to database
                    if data_list:
                        # Print pulled data for testing
                        print(f"\nTest: Data pulled from {peer_mac} ({peer_ip}):")
                        print(f"  Number of reports: {len(data_list)}")
                        for i, report in enumerate(data_list, 1):
                            print(f"  Report {i}:")
                            print(f"    ID: {report.get('id')}")
                            print(f"    Entity Type: {report.get('entity_type')}")
                            print(f"    Entity ID: {report.get('entity_id')}")
                            print(f"    Node ID: {report.get('node_id')}")
                            print(f"    Position: lat={report.get('position', {}).get('lat')}, lon={report.get('position', {}).get('lon')}")
                            print(f"    Created At: {report.get('created_at')}")
                            if report.get('metadata'):
                                print(f"    Metadata: {report.get('metadata')}")
                        print()  # Empty line for readability
                        
                        saved_count, skipped_count = self.save_location_reports(data_list)
                        results["total_reports_pulled"] += len(data_list)
                        results["total_reports_saved"] += saved_count
                        results["total_reports_skipped"] += skipped_count
                        
                        msg = f"Peer {peer_mac} ({peer_ip}): {status_msg} - Saved {saved_count}, Skipped {skipped_count}"
                        results["messages"].append(msg)
                        print(f"Test: ✓ Successfully pulled and saved data from {peer_mac}")
                        print(f"      {msg}")
                    else:
                        results["messages"].append(f"Peer {peer_mac} ({peer_ip}): {status_msg}")
                        print(f"Test: ✓ Successfully pulled from {peer_mac} (no new data)")
                else:
                    error_msg = f"Peer {peer_mac} ({peer_ip}): {status_msg}"
                    results["errors"].append(error_msg)
                    results["messages"].append(error_msg)
                    print(f"Test: ✗ Failed to pull from {peer_mac}")
                    
            except Exception as e:
                error_msg = f"Error testing pull from {peer_mac} ({peer_ip}): {str(e)}"
                results["errors"].append(error_msg)
                results["messages"].append(error_msg)
                print(f"Test: Exception - {error_msg}")
        
        print(f"\nTest: Completed. Attempted {results['peers_attempted']} peers, "
              f"Pulled {results['total_reports_pulled']} reports, "
              f"Saved {results['total_reports_saved']}, "
              f"Skipped {results['total_reports_skipped']}, "
              f"{len(results['errors'])} errors")
        
        return results
    
    def get_sync_log_status(self) -> List[Dict[str, Any]]:
        """
        Get sync_log status for all peers.
        Returns a list of sync_log entries with readable timestamps.
        """
        try:
            conn = sqlite3.connect(self.db_path)
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            
            # First verify table exists
            cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='sync_log'")
            table_exists = cursor.fetchone()
            
            if not table_exists:
                print(f"SyncService: get_sync_log_status() - WARNING: sync_log table does not exist!")
                conn.close()
                return []
            
            cursor.execute('''
                SELECT peer_node_id, last_known_ip, last_sync_at
                FROM sync_log
                ORDER BY last_sync_at DESC
            ''')
            
            rows = cursor.fetchall()
            conn.close()
            
            print(f"SyncService: get_sync_log_status() - Found {len(rows)} entries in sync_log")
            
            now_ms = int(datetime.now(timezone.utc).timestamp() * 1000)
            
            status_list = []
            for row in rows:
                last_sync_at = row['last_sync_at'] if row['last_sync_at'] else 0
                age_ms = now_ms - last_sync_at if last_sync_at > 0 else None
                
                status_list.append({
                    'peer_node_id': row['peer_node_id'],
                    'last_known_ip': row['last_known_ip'],
                    'last_sync_at': last_sync_at,
                    'last_sync_at_readable': datetime.fromtimestamp(last_sync_at / 1000, tz=timezone.utc).isoformat() if last_sync_at > 0 else None,
                    'sync_age_ms': age_ms,
                    'sync_age_seconds': age_ms / 1000 if age_ms is not None else None
                })
            
            return status_list
            
        except Exception as e:
            print(f"SyncService: Error getting sync log status: {e}")
            import traceback
            traceback.print_exc()
            return []


# --- Singleton setup (matches cluster_service.py) ---
_sync_service = None

def get_sync_service() -> SyncService:
    """Get the singleton SyncService instance"""
    global _sync_service
    if _sync_service is None:
        _sync_service = SyncService()
    return _sync_service

