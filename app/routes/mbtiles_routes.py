"""
MBTiles serving routes
"""

from flask import Blueprint, Response, jsonify, request
from flasgger import swag_from
from pathlib import Path
import os
import sys
sys.path.append(str(Path(__file__).parent.parent))

from services.mbtiles_service import MBTilesService

tiles_bp = Blueprint('tiles', __name__, url_prefix='/api/tiles')

# Path to MBTiles file
MBTILES_FILE = os.path.join(os.path.dirname(__file__), '..', 'tiles', 'berlin_tiles2.mbtiles')

# Initialize service
mbtiles_service = None
try:
    if os.path.exists(MBTILES_FILE):
        mbtiles_service = MBTilesService(MBTILES_FILE)
        print(f"MBTiles service initialized with: {MBTILES_FILE}")
        metadata = mbtiles_service.get_metadata()
        print(f"  Map name: {metadata.get('name', 'Unknown')}")
        print(f"  Zoom range: {metadata.get('minzoom', 0)}-{metadata.get('maxzoom', 18)}")
        print(f"  Format: {metadata.get('format', 'png')}")
    else:
        print(f"MBTiles file not found: {MBTILES_FILE}")
        print(f"  Place .mbtiles files in: {os.path.dirname(MBTILES_FILE)}")
except Exception as e:
    print(f"Error initializing MBTiles service: {e}")


@tiles_bp.route('/<int:z>/<int:x>/<int:y>.<ext>')
@tiles_bp.route('/<int:z>/<int:x>/<int:y>')
@swag_from({
    'tags': ['tiles'],
    'summary': 'Get a map tile',
    'description': 'Retrieve a map tile image for the given zoom level and coordinates',
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
            'description': 'MBTiles service not available',
            'content': {
                'application/json': {
                    'schema': {
                        'type': 'object',
                        'properties': {
                            'error': {'type': 'string', 'example': 'MBTiles service not available'}
                        }
                    }
                }
            }
        }
    }
})
def get_tile(z: int, x: int, y: int, ext: str = 'png'):
    """
    Serve a map tile from MBTiles
    
    Args:
        z: Zoom level
        x: Tile X coordinate
        y: Tile Y coordinate
        ext: File extension (png, jpg, etc.)
    """
    if not mbtiles_service:
        return jsonify({'error': 'MBTiles service not available'}), 503
    
    # Validate zoom level
    metadata = mbtiles_service.get_metadata()
    minzoom = int(metadata.get('minzoom', 0))
    maxzoom = int(metadata.get('maxzoom', 18))
    
    if z < minzoom or z > maxzoom:
        return Response(status=204)  # No Content - return empty for out of range
    
    # Get tile data
    tile_data = mbtiles_service.get_tile(z, x, y)
    
    if tile_data is None:
        return Response(status=204)  # No Content - tile doesn't exist
    
    # Determine content type based on extension
    content_types = {
        'png': 'image/png',
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'webp': 'image/webp',
        'pbf': 'application/x-protobuf',  # Vector tiles
        'mvt': 'application/x-protobuf'
    }
    
    content_type = content_types.get(ext.lower(), 'image/png')
    
    # Return tile with appropriate headers
    response = Response(tile_data, mimetype=content_type)
    response.headers['Cache-Control'] = 'public, max-age=31536000'  # Cache for 1 year
    response.headers['Access-Control-Allow-Origin'] = '*'  # CORS for map clients
    
    return response


@tiles_bp.route('/metadata')
@swag_from({
    'tags': ['tiles'],
    'summary': 'Get MBTiles metadata',
    'description': 'Retrieve metadata information from the MBTiles file',
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
            'description': 'MBTiles service not available',
            'content': {
                'application/json': {
                    'schema': {
                        'type': 'object',
                        'properties': {
                            'error': {'type': 'string', 'example': 'MBTiles service not available'}
                        }
                    }
                }
            }
        }
    }
})
def get_metadata():
    """Get metadata from MBTiles file"""
    if not mbtiles_service:
        return jsonify({'error': 'MBTiles service not available'}), 503
    
    return jsonify(mbtiles_service.get_metadata())


@tiles_bp.route('/tilejson')
@swag_from({
    'tags': ['tiles'],
    'summary': 'Get TileJSON specification',
    'description': 'Retrieve TileJSON specification for the MBTiles map (used by map clients)',
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
            'description': 'MBTiles service not available',
            'content': {
                'application/json': {
                    'schema': {
                        'type': 'object',
                        'properties': {
                            'error': {'type': 'string', 'example': 'MBTiles service not available'}
                        }
                    }
                }
            }
        }
    }
})
def get_tilejson():
    """Get TileJSON representation of the MBTiles"""
    if not mbtiles_service:
        return jsonify({'error': 'MBTiles service not available'}), 503
    
    # Get base URL from request
    base_url = request.url_root.rstrip('/') + '/api/tiles'
    
    return jsonify(mbtiles_service.get_tilejson(base_url))

