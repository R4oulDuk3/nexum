"""
Sync API routes for mesh node synchronization
"""

from flask import Blueprint, request, jsonify
from flasgger import swag_from
from marshmallow import ValidationError
from apispec import APISpec
from apispec.ext.marshmallow import MarshmallowPlugin
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).parent.parent))

from services.sync_service import get_sync_service

sync_bp = Blueprint('sync', __name__, url_prefix='/api/sync')
sync_service = get_sync_service()

# Create APISpec instance for schema conversion (if needed)
_apispec = APISpec(
    title='Nexum Mesh API',
    version='1.0.0',
    openapi_version='3.0.0',
    plugins=[MarshmallowPlugin()]
)


@sync_bp.route('', methods=['GET'])
@swag_from({
    'tags': ['sync'],
    'summary': 'Get data since timestamp',
    'description': 'Retrieve this node\'s data that is newer than the specified timestamp',
    'parameters': [
        {
            'name': 'since',
            'in': 'query',
            'required': False,
            'schema': {
                'type': 'integer'
            },
            'description': 'UTC milliseconds timestamp (optional, defaults to 0)',
            'default': 0
        }
    ],
    'responses': {
        200: {
            'description': 'Data retrieved successfully',
            'content': {
                'application/json': {
                    'schema': {
                        'type': 'object',
                        'properties': {
                            'status': {'type': 'string', 'example': 'success'},
                            'count': {'type': 'integer', 'example': 1},
                            'data': {
                                'type': 'array',
                                'items': {'type': 'object'}
                            }
                        }
                    }
                }
            }
        },
        400: {
            'description': 'Invalid parameter',
            'content': {
                'application/json': {
                    'schema': {
                        'type': 'object',
                        'properties': {
                            'status': {'type': 'string', 'example': 'error'},
                            'message': {'type': 'string'}
                        }
                    }
                }
            }
        }
    }
})
def get_sync_data():
    """Get this node's data since a timestamp (for peers to pull)"""
    try:
        since = request.args.get('since', type=int, default=0)
        
        # Get data from sync service
        data = sync_service.get_own_data_since(since)
        
        return jsonify({
            'status': 'success',
            'count': len(data),
            'data': data
        })
        
    except ValueError as e:
        return jsonify({
            'status': 'error',
            'message': f'Invalid parameter: {str(e)}'
        }), 400
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': f'Server error: {str(e)}'
        }), 500


@sync_bp.route('', methods=['POST'])
@swag_from({
    'tags': ['sync'],
    'summary': 'Trigger sync with all peers',
    'description': 'Initiate synchronization with all visible peers in the mesh network',
    'responses': {
        200: {
            'description': 'Sync completed',
            'content': {
                'application/json': {
                    'schema': {
                        'type': 'object',
                        'properties': {
                            'status': {'type': 'string', 'example': 'success'},
                            'peers_found': {'type': 'integer', 'example': 2},
                            'peers_synced': {'type': 'integer', 'example': 2},
                            'messages': {
                                'type': 'array',
                                'items': {'type': 'string'}
                            },
                            'errors': {
                                'type': 'array',
                                'items': {'type': 'string'}
                            }
                        }
                    }
                }
            }
        },
        500: {
            'description': 'Server error',
            'content': {
                'application/json': {
                    'schema': {
                        'type': 'object',
                        'properties': {
                            'status': {'type': 'string', 'example': 'error'},
                            'message': {'type': 'string'}
                        }
                    }
                }
            }
        }
    }
})
def trigger_sync():
    """Trigger sync with all peers in the mesh network"""
    try:
        # Sync with all peers
        results = sync_service.sync_with_all_peers()
        
        return jsonify({
            'status': 'success',
            **results
        })
        
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': f'Server error: {str(e)}'
        }), 500
