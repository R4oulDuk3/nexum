"""
Cluster service for node identification and mesh network management
"""

import subprocess
import platform
from pathlib import Path


class ClusterService:
    """Service for cluster/node identification and management"""
    
    def __init__(self):
        self._node_id = None
    
    def get_current_node_id(self) -> str:
        """
        Get the current node's unique identifier (MAC address)
        
        Returns:
            MAC address of the bat0 interface (mesh network interface)
            Falls back to primary network interface if bat0 not available
        """
        if self._node_id:
            return self._node_id
        
        # Try to get MAC address from bat0 (mesh interface)
        node_id = self._get_mac_from_interface('bat0')
        
        # Fallback to wlan0 if bat0 not available
        if not node_id:
            node_id = self._get_mac_from_interface('wlan0')
        
        # Fallback to eth0 if wlan0 not available
        if not node_id:
            node_id = self._get_mac_from_interface('eth0')
        
        # Final fallback: use system method
        if not node_id:
            node_id = self._get_mac_system()
        
        # Cache the result
        self._node_id = node_id
        return node_id
    
    def _get_mac_from_interface(self, interface: str) -> str:
        """Get MAC address from a specific network interface"""
        try:
            if platform.system() == 'Windows':
                # Windows: use ipconfig or getmac
                result = subprocess.run(
                    ['getmac', '/fo', 'csv', '/nh'],
                    capture_output=True,
                    text=True,
                    timeout=5
                )
                if result.returncode == 0:
                    # Parse output to find interface
                    for line in result.stdout.split('\n'):
                        if interface.lower() in line.lower():
                            parts = line.split(',')
                            if len(parts) > 0:
                                mac = parts[0].strip().replace('-', ':')
                                return mac
            else:
                # Linux/macOS: read from /sys/class/net
                mac_file = Path(f'/sys/class/net/{interface}/address')
                if mac_file.exists():
                    mac = mac_file.read_text().strip()
                    if mac and mac != '00:00:00:00:00:00':
                        return mac
        except Exception:
            pass
        
        return None
    
    def _get_mac_system(self) -> str:
        """Get MAC address using system commands"""
        try:
            if platform.system() == 'Windows':
                # Windows: use ipconfig
                result = subprocess.run(
                    ['ipconfig', '/all'],
                    capture_output=True,
                    text=True,
                    timeout=5
                )
                if result.returncode == 0:
                    # Find first non-zero MAC address
                    for line in result.stdout.split('\n'):
                        if 'Physical Address' in line or 'MAC Address' in line:
                            parts = line.split(':')
                            if len(parts) > 1:
                                mac = parts[-1].strip().replace('-', ':')
                                if mac and mac != '00:00:00:00:00:00':
                                    return mac
            else:
                # Linux: use ip link
                result = subprocess.run(
                    ['ip', 'link', 'show'],
                    capture_output=True,
                    text=True,
                    timeout=5
                )
                if result.returncode == 0:
                    for line in result.stdout.split('\n'):
                        if 'link/ether' in line:
                            parts = line.split('link/ether')
                            if len(parts) > 1:
                                mac = parts[1].strip().split()[0]
                                if mac and mac != '00:00:00:00:00:00':
                                    return mac
        except Exception:
            pass
        
        # Ultimate fallback: return a placeholder
        return '00:00:00:00:00:00'
    
    def get_node_id_formatted(self) -> str:
        """
        Get node ID in a formatted way (without colons, for use in IDs)
        
        Returns:
            MAC address without colons
        """
        return self.get_current_node_id().replace(':', '')


# Singleton instance
_cluster_service = None

def get_cluster_service() -> ClusterService:
    """Get the singleton ClusterService instance"""
    global _cluster_service
    if _cluster_service is None:
        _cluster_service = ClusterService()
    return _cluster_service

