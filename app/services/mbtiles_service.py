"""
MBTiles service for serving map tiles from MBTiles files
"""

import sqlite3
from pathlib import Path
from typing import Optional, Dict, Any


class MBTilesService:
    """Service for reading and serving tiles from MBTiles files"""
    
    def __init__(self, mbtiles_path: str):
        """
        Initialize MBTiles service
        
        Args:
            mbtiles_path: Path to the .mbtiles file
        """
        self.mbtiles_path = Path(mbtiles_path)
        if not self.mbtiles_path.exists():
            raise FileNotFoundError(f"MBTiles file not found: {mbtiles_path}")
    
    def get_tile(self, z: int, x: int, y: int) -> Optional[bytes]:
        """
        Get a tile from the MBTiles database
        
        Args:
            z: Zoom level
            x: Tile X coordinate (XYZ format)
            y: Tile Y coordinate (XYZ format, will convert to TMS)
        
        Returns:
            Tile image data as bytes, or None if tile doesn't exist
        """
        # Convert XYZ Y coordinate to TMS Y coordinate
        # MBTiles uses TMS format (row 0 at bottom), web maps use XYZ (row 0 at top)
        y_tms = (2 ** z - 1) - y
        
        try:
            conn = sqlite3.connect(str(self.mbtiles_path))
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            
            cursor.execute(
                'SELECT tile_data FROM tiles WHERE zoom_level = ? AND tile_column = ? AND tile_row = ?',
                (z, x, y_tms)
            )
            
            result = cursor.fetchone()
            conn.close()
            
            if result:
                return result['tile_data']
            return None
            
        except sqlite3.Error as e:
            print(f"Error reading tile from MBTiles: {e}")
            return None
    
    def get_metadata(self) -> Dict[str, Any]:
        """
        Get metadata from MBTiles file
        
        Returns:
            Dictionary of metadata key-value pairs
        """
        try:
            conn = sqlite3.connect(str(self.mbtiles_path))
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            
            cursor.execute('SELECT name, value FROM metadata')
            results = cursor.fetchall()
            conn.close()
            
            metadata = {row['name']: row['value'] for row in results}
            return metadata
            
        except sqlite3.Error as e:
            print(f"Error reading metadata from MBTiles: {e}")
            return {}
    
    def get_tilejson(self, base_url: str = '/api/tiles') -> Dict[str, Any]:
        """
        Get TileJSON representation of this MBTiles file
        
        Args:
            base_url: Base URL for tile endpoint
        
        Returns:
            TileJSON dictionary
        """
        metadata = self.get_metadata()
        
        # Parse bounds if available
        bounds = [-180, -85, 180, 85]
        if 'bounds' in metadata:
            try:
                bounds = [float(x) for x in metadata['bounds'].split(',')]
            except:
                pass
        
        # Parse center if available
        center = [0, 0, 2]
        if 'center' in metadata:
            try:
                center_parts = metadata['center'].split(',')
                center = [float(center_parts[0]), float(center_parts[1]), int(center_parts[2])]
            except:
                pass
        
        format_ext = metadata.get('format', 'png').lower()
        if format_ext == 'jpg':
            format_ext = 'jpeg'
        
        tilejson = {
            'tilejson': '2.1.0',
            'scheme': 'xyz',
            'format': format_ext,
            'name': metadata.get('name', 'MBTiles Map'),
            'description': metadata.get('description', ''),
            'version': metadata.get('version', '1.0.0'),
            'attribution': metadata.get('attribution', ''),
            'bounds': bounds,
            'center': center,
            'minzoom': int(metadata.get('minzoom', 0)),
            'maxzoom': int(metadata.get('maxzoom', 18)),
            'tiles': [f'{base_url}/{{z}}/{{x}}/{{y}}.{format_ext}']
        }
        
        return tilejson

