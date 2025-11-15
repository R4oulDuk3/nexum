"""
Vector tiles service for serving PBF/MVT tiles from MBTiles files
Handles gzip decompression for vector tiles
"""

import sqlite3
import gzip
import json
from pathlib import Path
from typing import Optional, Dict, Any


class VectorTilesService:
    """Service for reading and serving vector tiles (PBF/MVT) from MBTiles files"""
    
    def __init__(self, mbtiles_path: str):
        """
        Initialize Vector Tiles service
        
        Args:
            mbtiles_path: Path to the .mbtiles file containing vector tiles
        """
        self.mbtiles_path = Path(mbtiles_path)
        if not self.mbtiles_path.exists():
            raise FileNotFoundError(f"MBTiles file not found: {mbtiles_path}")
    
    def get_tile(self, z: int, x: int, y: int, decompress: bool = True) -> Optional[bytes]:
        """
        Get a vector tile from the MBTiles database
        
        Args:
            z: Zoom level
            x: Tile X coordinate (XYZ format)
            y: Tile Y coordinate (XYZ format, will convert to TMS)
            decompress: Whether to decompress gzip-compressed tiles (default: True)
        
        Returns:
            Uncompressed tile data as bytes, or None if tile doesn't exist
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
                tile_data = result['tile_data']
                
                # Decompress if gzip-compressed and decompress is True
                if decompress and tile_data and len(tile_data) >= 2:
                    # Check for gzip magic bytes (0x1f 0x8b)
                    if tile_data[0:2] == b'\x1f\x8b':
                        try:
                            original_size = len(tile_data)
                            tile_data = gzip.decompress(tile_data)
                            decompressed_size = len(tile_data)
                            print(f"[VectorTiles] Decompressed tile {z}/{x}/{y}.pbf: {original_size} -> {decompressed_size} bytes")
                        except gzip.BadGzipFile:
                            print(f"[VectorTiles] Warning: Tile {z}/{x}/{y}.pbf has gzip magic bytes but failed to decompress, using as-is")
                        except Exception as e:
                            print(f"[VectorTiles] Error decompressing tile {z}/{x}/{y}.pbf: {e}")
                            return None
                    else:
                        print(f"[VectorTiles] Tile {z}/{x}/{y}.pbf is not gzip-compressed (magic bytes: {tile_data[0:2].hex()})")
                
                return tile_data
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
            
            # Parse JSON metadata if present
            if 'json' in metadata:
                try:
                    json_metadata = json.loads(metadata['json'])
                    metadata['vector_layers'] = json_metadata.get('vector_layers', [])
                except json.JSONDecodeError:
                    print(f"[VectorTiles] Warning: Could not parse JSON metadata")
            
            return metadata
            
        except sqlite3.Error as e:
            print(f"Error reading metadata from MBTiles: {e}")
            return {}
    
    def get_tilejson(self, base_url: str = '/api/tiles/vector') -> Dict[str, Any]:
        """
        Get TileJSON representation of this vector MBTiles file
        
        Args:
            base_url: Base URL for tile endpoint
        
        Returns:
            TileJSON dictionary with vector_layers information
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
        
        tilejson = {
            'tilejson': '2.1.0',
            'scheme': 'xyz',
            'format': 'pbf',
            'name': metadata.get('name', 'Vector MBTiles Map'),
            'description': metadata.get('description', ''),
            'version': metadata.get('version', '1.0.0'),
            'attribution': metadata.get('attribution', ''),
            'bounds': bounds,
            'center': center,
            'minzoom': int(metadata.get('minzoom', 0)),
            'maxzoom': int(metadata.get('maxzoom', 18)),
            'tiles': [f'{base_url}/{{z}}/{{x}}/{{y}}.pbf']
        }
        
        # Add vector_layers if available
        if 'vector_layers' in metadata:
            tilejson['vector_layers'] = metadata['vector_layers']
        
        return tilejson
    
    def generate_maplibre_style(self, source_name: str = 'osm', tiles_url: str = '/api/tiles/vector/{z}/{x}/{y}.pbf', glyphs_url: str = 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf') -> Dict[str, Any]:
        """
        Generate a MapLibre GL JS style from vector_layers metadata
        
        This creates a basic style with sensible defaults for each layer type.
        The style can be customized after generation.
        
        Args:
            source_name: Name of the vector source in the style
            tiles_url: URL template for tiles
            glyphs_url: URL template for glyphs (fonts)
        
        Returns:
            MapLibre GL JS style dictionary (version 8)
        """
        metadata = self.get_metadata()
        vector_layers = metadata.get('vector_layers', [])
        
        if not vector_layers:
            raise ValueError("No vector_layers found in metadata")
        
        # Parse bounds and center
        bounds = [-180, -85, 180, 85]
        if 'bounds' in metadata:
            try:
                bounds = [float(x) for x in metadata['bounds'].split(',')]
            except:
                pass
        
        center = [0, 0, 2]
        if 'center' in metadata:
            try:
                center_parts = metadata['center'].split(',')
                center = [float(center_parts[0]), float(center_parts[1]), int(center_parts[2])]
            except:
                pass
        
        # Define layer type mappings based on layer ID patterns
        def infer_layer_type(layer_id: str, fields: Dict[str, str]) -> str:
            """Infer MapLibre layer type from layer ID and fields"""
            # Layers with name fields are typically symbol layers
            if 'name:latin' in fields or 'name' in fields:
                return 'symbol'
            
            # Specific layer type mappings
            layer_type_map = {
                'water': 'fill',
                'waterway': 'line',
                'landuse': 'fill',
                'landcover': 'fill',
                'park': 'fill',
                'building': 'fill',
                'transportation': 'line',
                'transportation_name': 'symbol',
                'boundary': 'line',
                'aeroway': 'line',
                'poi': 'symbol',
                'place': 'symbol',
                'housenumber': 'symbol',
                'water_name': 'symbol',
                'aerodrome_label': 'symbol',
                'mountain_peak': 'symbol'
            }
            
            return layer_type_map.get(layer_id, 'fill')
        
        # Default colors for different layer types
        default_colors = {
            'water': '#a0c8f0',
            'waterway': '#4a90e2',
            'landuse': '#e0e0e0',
            'landcover': '#90d090',
            'park': '#90d090',
            'building': '#d0d0d0',
            'transportation': '#666666',
            'boundary': '#999999',
            'aeroway': '#cccccc'
        }
        
        # Build layers array
        layers = []
        
        # Add background layer first
        layers.append({
            'id': 'background',
            'type': 'background',
            'paint': {
                'background-color': '#f0f0f0'
            }
        })
        
        # Process vector layers in a logical order (background to foreground)
        # Order: water -> landuse -> landcover -> park -> buildings -> transportation -> boundaries -> labels
        layer_order = [
            'water', 'landuse', 'landcover', 'park',
            'building', 'transportation', 'waterway', 'boundary', 'aeroway',
            'transportation_name', 'water_name', 'place', 'poi', 'housenumber', 'aerodrome_label', 'mountain_peak'
        ]
        
        # Sort vector_layers by predefined order
        sorted_layers = sorted(
            vector_layers,
            key=lambda l: layer_order.index(l['id']) if l['id'] in layer_order else 999
        )
        
        for layer_def in sorted_layers:
            layer_id = layer_def['id']
            fields = layer_def.get('fields', {})
            minzoom = layer_def.get('minzoom', 0)
            maxzoom = layer_def.get('maxzoom', 18)
            layer_type = infer_layer_type(layer_id, fields)
            
            # Create layer based on type
            layer = {
                'id': layer_id,
                'type': layer_type,
                'source': source_name,
                'source-layer': layer_id,
                'minzoom': minzoom,
                'maxzoom': maxzoom
            }
            
            if layer_type == 'fill':
                # Fill layers
                color = default_colors.get(layer_id, '#cccccc')
                layer['paint'] = {
                    'fill-color': color,
                    'fill-opacity': 0.6 if layer_id in ['building', 'park', 'landcover'] else 0.8
                }
                
                # Add outline for buildings
                if layer_id == 'building':
                    layers.append(layer)
                    # Add outline layer
                    outline_layer = {
                        'id': f'{layer_id}-outline',
                        'type': 'line',
                        'source': source_name,
                        'source-layer': layer_id,
                        'minzoom': minzoom,
                        'maxzoom': maxzoom,
                        'paint': {
                            'line-color': '#999999',
                            'line-width': 1
                        }
                    }
                    layers.append(outline_layer)
                    continue
            
            elif layer_type == 'line':
                # Line layers
                color = default_colors.get(layer_id, '#666666')
                width = 2 if layer_id == 'transportation' else 1
                
                layer['paint'] = {
                    'line-color': color,
                    'line-width': width
                }
                
                # Add filters for transportation based on class
                if layer_id == 'transportation' and 'class' in fields:
                    # Create separate layers for major and minor roads
                    major_layer = layer.copy()
                    major_layer['id'] = f'{layer_id}-major'
                    major_layer['filter'] = ['in', ['get', 'class'], ['literal', ['motorway', 'trunk', 'primary']]]
                    major_layer['paint']['line-width'] = 3
                    major_layer['paint']['line-color'] = '#f0a0a0'
                    layers.append(major_layer)
                    
                    minor_layer = layer.copy()
                    minor_layer['id'] = f'{layer_id}-minor'
                    minor_layer['filter'] = ['in', ['get', 'class'], ['literal', ['secondary', 'tertiary', 'minor', 'service']]]
                    minor_layer['paint']['line-width'] = 1.5
                    minor_layer['paint']['line-color'] = '#f0c0c0'
                    layers.append(minor_layer)
                    continue
            
            elif layer_type == 'symbol':
                # Symbol layers (labels)
                text_field = None
                if 'name:latin' in fields:
                    text_field = ['get', 'name:latin']
                elif 'name' in fields:
                    text_field = ['get', 'name']
                elif 'housenumber' in fields:
                    text_field = ['get', 'housenumber']
                
                if text_field:
                    layer['layout'] = {
                        'text-field': text_field,
                        'text-font': ['Noto Sans Regular'],
                        'text-size': 14 if layer_id in ['place', 'mountain_peak'] else 12
                    }
                    layer['paint'] = {
                        'text-color': '#000000',
                        'text-halo-color': '#ffffff',
                        'text-halo-width': 1
                    }
                else:
                    # Skip layers without text fields
                    continue
            
            layers.append(layer)
        
        # Build complete style
        style = {
            'version': 8,
            'name': metadata.get('name', 'Auto-generated Style'),
            'metadata': {
                'mapbox:autocomposite': False
            },
            'sources': {
                source_name: {
                    'type': 'vector',
                    'tiles': [tiles_url],
                    'minzoom': int(metadata.get('minzoom', 0)),
                    'maxzoom': int(metadata.get('maxzoom', 18))
                }
            },
            'layers': layers,
            'glyphs': glyphs_url,
            'sprite': '',
            'bounds': bounds,
            'center': center[:2],  # Only lat, lon
            'zoom': center[2] if len(center) > 2 else 2
        }
        
        return style

