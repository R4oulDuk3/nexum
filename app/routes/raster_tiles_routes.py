"""
Raster tiles serving routes for PNG/JPEG tiles
"""

from flask import Blueprint, Response, jsonify, request
from flasgger import swag_from
from pathlib import Path
import os
import sys
sys.path.append(str(Path(__file__).parent.parent))

from services.mbtiles_service import MBTilesService

raster_tiles_bp = Blueprint('raster_tiles', __name__, url_prefix='/api/tiles/raster')

# Path to raster MBTiles file (PNG/JPEG format)
RASTER_MBTILES_FILE = os.path.join(os.path.dirname(__file__), '..', 'tiles', 'berlin-lowres-raster.mbtiles')

# Initialize service
raster_tiles_service = None
try:
    if os.path.exists(RASTER_MBTILES_FILE):
        raster_tiles_service = MBTilesService(RASTER_MBTILES_FILE)
        print(f"Raster Tiles service initialized with: {RASTER_MBTILES_FILE}")
        metadata = raster_tiles_service.get_metadata()
        print(f"  Map name: {metadata.get('name', 'Unknown')}")
        print(f"  Zoom range: {metadata.get('minzoom', 0)}-{metadata.get('maxzoom', 18)}")
        print(f"  Format: {metadata.get('format', 'png')}")
    else:
        print(f"Raster MBTiles file not found: {RASTER_MBTILES_FILE}")
        print(f"  Place .mbtiles files in: {os.path.dirname(RASTER_MBTILES_FILE)}")
except Exception as e:
    print(f"Error initializing Raster Tiles service: {e}")


@raster_tiles_bp.route('/<int:z>/<int:x>/<int:y>.<ext>')
@raster_tiles_bp.route('/<int:z>/<int:x>/<int:y>')
@swag_from({
    'tags': ['tiles'],
    'summary': 'Get a raster map tile',
    'description': 'Retrieve a raster map tile image (PNG/JPEG) for the given zoom level and coordinates',
    'parameters': [
        {
            'name': 'z',
            'in': 'path',
            'required': True,
            'schema': {'type': 'integer', 'minimum': 0, 'maximum': 18},
            'description': 'Zoom level',
            'example': 0
        },
        {
            'name': 'x',
            'in': 'path',
            'required': True,
            'schema': {'type': 'integer', 'minimum': 0},
            'description': 'Tile X coordinate',
            'example': 0
        },
        {
            'name': 'y',
            'in': 'path',
            'required': True,
            'schema': {'type': 'integer', 'minimum': 0},
            'description': 'Tile Y coordinate',
            'example': 0
        },
        {
            'name': 'ext',
            'in': 'path',
            'required': False,
            'schema': {'type': 'string', 'enum': ['png', 'jpg', 'jpeg', 'webp']},
            'description': 'Image format extension',
            'example': 'png'
        }
    ],
    'responses': {
        200: {
            'description': 'Tile image',
            'content': {
                'image/png': {'schema': {'type': 'string', 'format': 'binary'}},
                'image/jpeg': {'schema': {'type': 'string', 'format': 'binary'}}
            }
        },
        204: {
            'description': 'No content - tile not found or out of range'
        },
        503: {
            'description': 'Raster tiles service not available',
            'content': {
                'application/json': {
                    'schema': {
                        'type': 'object',
                        'properties': {
                            'error': {'type': 'string', 'example': 'Raster tiles service not available'}
                        }
                    }
                }
            }
        }
    }
})
def get_raster_tile(z: int, x: int, y: int, ext: str = 'png'):
    """
    Serve a raster map tile from MBTiles
    
    Args:
        z: Zoom level
        x: Tile X coordinate
        y: Tile Y coordinate
        ext: File extension (png, jpg, etc.)
    """
    if not raster_tiles_service:
        return jsonify({'error': 'Raster tiles service not available'}), 503
    
    # Validate zoom level
    metadata = raster_tiles_service.get_metadata()
    minzoom = int(metadata.get('minzoom', 0))
    maxzoom = int(metadata.get('maxzoom', 18))
    
    if z < minzoom or z > maxzoom:
        return Response(status=204)  # No Content - return empty for out of range
    
    # Get tile data
    tile_data = raster_tiles_service.get_tile(z, x, y)
    
    if tile_data is None:
        return Response(status=204)  # No Content - tile doesn't exist
    
    # Determine content type based on extension
    content_types = {
        'png': 'image/png',
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'webp': 'image/webp'
    }
    
    content_type = content_types.get(ext.lower(), 'image/png')
    
    # Return tile with appropriate headers
    response = Response(tile_data, mimetype=content_type)
    response.headers['Cache-Control'] = 'public, max-age=31536000'  # Cache for 1 year
    response.headers['Access-Control-Allow-Origin'] = '*'  # CORS for map clients
    
    return response


@raster_tiles_bp.route('/metadata')
@swag_from({
    'tags': ['tiles'],
    'summary': 'Get raster MBTiles metadata',
    'description': 'Retrieve metadata information from the raster MBTiles file',
    'responses': {
        200: {
            'description': 'Metadata retrieved successfully',
            'content': {
                'application/json': {
                    'schema': {
                        'type': 'object',
                        'properties': {
                            'name': {'type': 'string'},
                            'format': {'type': 'string'},
                            'bounds': {'type': 'string'},
                            'center': {'type': 'string'},
                            'minzoom': {'type': 'string'},
                            'maxzoom': {'type': 'string'},
                            'attribution': {'type': 'string'}
                        }
                    }
                }
            }
        },
        503: {
            'description': 'Raster tiles service not available',
            'content': {
                'application/json': {
                    'schema': {
                        'type': 'object',
                        'properties': {
                            'error': {'type': 'string', 'example': 'Raster tiles service not available'}
                        }
                    }
                }
            }
        }
    }
})
def get_raster_metadata():
    """Get metadata from raster MBTiles file"""
    if not raster_tiles_service:
        return jsonify({'error': 'Raster tiles service not available'}), 503
    
    return jsonify(raster_tiles_service.get_metadata())


@raster_tiles_bp.route('/tilejson')
@swag_from({
    'tags': ['tiles'],
    'summary': 'Get TileJSON specification for raster tiles',
    'description': 'Retrieve TileJSON specification for the raster MBTiles map (used by Leaflet and other map clients)',
    'responses': {
        200: {
            'description': 'TileJSON retrieved successfully',
            'content': {
                'application/json': {
                    'schema': {
                        'type': 'object',
                        'properties': {
                            'tilejson': {'type': 'string', 'example': '2.1.0'},
                            'scheme': {'type': 'string', 'example': 'xyz'},
                            'format': {'type': 'string', 'example': 'png'},
                            'name': {'type': 'string'},
                            'description': {'type': 'string'},
                            'version': {'type': 'string'},
                            'attribution': {'type': 'string'},
                            'bounds': {'type': 'array', 'items': {'type': 'number'}},
                            'center': {'type': 'array', 'items': {'type': 'number'}},
                            'minzoom': {'type': 'integer'},
                            'maxzoom': {'type': 'integer'},
                            'tiles': {'type': 'array', 'items': {'type': 'string'}}
                        }
                    }
                }
            }
        },
        503: {
            'description': 'Raster tiles service not available',
            'content': {
                'application/json': {
                    'schema': {
                        'type': 'object',
                        'properties': {
                            'error': {'type': 'string', 'example': 'Raster tiles service not available'}
                        }
                    }
                }
            }
        }
    }
})
def get_raster_tilejson():
    """Get TileJSON representation of the raster MBTiles"""
    if not raster_tiles_service:
        return jsonify({'error': 'Raster tiles service not available'}), 503
    
    # Get base URL from request
    base_url = request.url_root.rstrip('/') + '/api/tiles/raster'
    
    return jsonify(raster_tiles_service.get_tilejson(base_url))

