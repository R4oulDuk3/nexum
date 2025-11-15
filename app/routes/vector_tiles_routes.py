"""
Vector tiles serving routes for PBF/MVT tiles
"""

from flask import Blueprint, Response, jsonify, request
from flasgger import swag_from
from pathlib import Path
import os
import sys
sys.path.append(str(Path(__file__).parent.parent))

from services.vector_tiles_service import VectorTilesService

vector_tiles_bp = Blueprint('vector_tiles', __name__, url_prefix='/api/tiles/vector')

# Add CORS headers for all routes
@vector_tiles_bp.after_request
def add_cors_headers(response):
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Methods'] = 'GET, OPTIONS'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type'
    return response

# Handle OPTIONS preflight requests
@vector_tiles_bp.route('/<path:path>', methods=['OPTIONS'])
def handle_options(path):
    return Response(status=200)

# Path to vector MBTiles file (PBF format)
VECTOR_MBTILES_FILE = os.path.join(os.path.dirname(__file__), '..', 'tiles', 'berlin_tiles2.mbtiles')

# Initialize service
vector_tiles_service = None
try:
    if os.path.exists(VECTOR_MBTILES_FILE):
        vector_tiles_service = VectorTilesService(VECTOR_MBTILES_FILE)
        print(f"Vector Tiles service initialized with: {VECTOR_MBTILES_FILE}")
        metadata = vector_tiles_service.get_metadata()
        print(f"  Map name: {metadata.get('name', 'Unknown')}")
        print(f"  Zoom range: {metadata.get('minzoom', 0)}-{metadata.get('maxzoom', 18)}")
        print(f"  Format: {metadata.get('format', 'pbf')}")
        if 'vector_layers' in metadata:
            print(f"  Vector layers: {len(metadata['vector_layers'])} layers")
    else:
        print(f"Vector MBTiles file not found: {VECTOR_MBTILES_FILE}")
        print(f"  Place .mbtiles files in: {os.path.dirname(VECTOR_MBTILES_FILE)}")
except Exception as e:
    print(f"Error initializing Vector Tiles service: {e}")


@vector_tiles_bp.route('/<int:z>/<int:x>/<int:y>.pbf')
@vector_tiles_bp.route('/<int:z>/<int:x>/<int:y>')
@swag_from({
    'tags': ['tiles'],
    'summary': 'Get a vector map tile (PBF)',
    'description': 'Retrieve a vector map tile (PBF/MVT format) for the given zoom level and coordinates. Tiles are automatically decompressed if gzip-compressed.',
    'parameters': [
        {
            'name': 'z',
            'in': 'path',
            'required': True,
            'schema': {'type': 'integer', 'minimum': 0, 'maximum': 18},
            'description': 'Zoom level',
            'example': 13
        },
        {
            'name': 'x',
            'in': 'path',
            'required': True,
            'schema': {'type': 'integer', 'minimum': 0},
            'description': 'Tile X coordinate',
            'example': 4395
        },
        {
            'name': 'y',
            'in': 'path',
            'required': True,
            'schema': {'type': 'integer', 'minimum': 0},
            'description': 'Tile Y coordinate',
            'example': 5508
        }
    ],
    'responses': {
        200: {
            'description': 'Vector tile (PBF format, uncompressed)',
            'content': {
                'application/x-protobuf': {'schema': {'type': 'string', 'format': 'binary'}}
            }
        },
        204: {
            'description': 'No content - tile not found or out of range'
        },
        503: {
            'description': 'Vector tiles service not available',
            'content': {
                'application/json': {
                    'schema': {
                        'type': 'object',
                        'properties': {
                            'error': {'type': 'string', 'example': 'Vector tiles service not available'}
                        }
                    }
                }
            }
        }
    }
})
def get_vector_tile(z: int, x: int, y: int):
    """
    Serve a vector map tile (PBF) from MBTiles
    
    Args:
        z: Zoom level
        x: Tile X coordinate
        y: Tile Y coordinate
    """
    if not vector_tiles_service:
        return jsonify({'error': 'Vector tiles service not available'}), 503
    
    # Validate zoom level
    metadata = vector_tiles_service.get_metadata()
    minzoom = int(metadata.get('minzoom', 0))
    maxzoom = int(metadata.get('maxzoom', 18))
    
    if z < minzoom or z > maxzoom:
        return Response(status=204)  # No Content - return empty for out of range
    
    # Get tile data (automatically decompressed)
    tile_data = vector_tiles_service.get_tile(z, x, y, decompress=True)
    
    if tile_data is None:
        return Response(status=204)  # No Content - tile doesn't exist
    
    # Return uncompressed PBF tile
    response = Response(tile_data, mimetype='application/x-protobuf')
    response.headers['Cache-Control'] = 'public, max-age=31536000'  # Cache for 1 year
    response.headers['Access-Control-Allow-Origin'] = '*'  # CORS for map clients
    response.headers['Access-Control-Allow-Methods'] = 'GET, OPTIONS'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type'
    response.headers['Content-Type'] = 'application/x-protobuf'
    
    return response


@vector_tiles_bp.route('/metadata')
@swag_from({
    'tags': ['tiles'],
    'summary': 'Get vector MBTiles metadata',
    'description': 'Retrieve metadata information from the vector MBTiles file, including vector_layers information',
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
                            'attribution': {'type': 'string'},
                            'vector_layers': {'type': 'array'}
                        }
                    }
                }
            }
        },
        503: {
            'description': 'Vector tiles service not available'
        }
    }
})
def get_vector_metadata():
    """Get metadata from vector MBTiles file"""
    if not vector_tiles_service:
        return jsonify({'error': 'Vector tiles service not available'}), 503
    
    return jsonify(vector_tiles_service.get_metadata())


@vector_tiles_bp.route('/style')
@swag_from({
    'tags': ['tiles'],
    'summary': 'Get auto-generated MapLibre GL JS style',
    'description': 'Generate a MapLibre GL JS style from vector_layers metadata with sensible defaults',
    'responses': {
        200: {
            'description': 'MapLibre GL JS style retrieved successfully',
            'content': {
                'application/json': {
                    'schema': {
                        'type': 'object',
                        'description': 'MapLibre GL JS style specification (version 8)'
                    }
                }
            }
        },
        503: {
            'description': 'Vector tiles service not available'
        }
    }
})
def get_vector_style():
    """Get auto-generated MapLibre GL JS style from vector_layers metadata"""
    if not vector_tiles_service:
        return jsonify({'error': 'Vector tiles service not available'}), 503
    
    # Get base URL from request - use the request's origin to ensure absolute URL
    base_url = request.url_root.rstrip('/')
    tiles_url = f'{base_url}/api/tiles/vector/{{z}}/{{x}}/{{y}}.pbf'
    
    try:
        style = vector_tiles_service.generate_maplibre_style(
            source_name='osm',
            tiles_url=tiles_url,
            glyphs_url='https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf'
        )
        return jsonify(style)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@vector_tiles_bp.route('/tilejson')
@swag_from({
    'tags': ['tiles'],
    'summary': 'Get TileJSON specification for vector tiles',
    'description': 'Retrieve TileJSON specification for the vector MBTiles map (used by MapLibre GL JS and other map clients)',
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
                            'format': {'type': 'string', 'example': 'pbf'},
                            'name': {'type': 'string'},
                            'description': {'type': 'string'},
                            'version': {'type': 'string'},
                            'attribution': {'type': 'string'},
                            'bounds': {'type': 'array', 'items': {'type': 'number'}},
                            'center': {'type': 'array', 'items': {'type': 'number'}},
                            'minzoom': {'type': 'integer'},
                            'maxzoom': {'type': 'integer'},
                            'tiles': {'type': 'array', 'items': {'type': 'string'}},
                            'vector_layers': {'type': 'array'}
                        }
                    }
                }
            }
        },
        503: {
            'description': 'Vector tiles service not available'
        }
    }
})
def get_vector_tilejson():
    """Get TileJSON representation of the vector MBTiles"""
    if not vector_tiles_service:
        return jsonify({'error': 'Vector tiles service not available'}), 503
    
    # Get base URL from request
    base_url = request.url_root.rstrip('/') + '/api/tiles/vector'
    
    return jsonify(vector_tiles_service.get_tilejson(base_url))

