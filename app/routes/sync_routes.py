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
        
        # Get peer IP from request
        peer_ip = request.remote_addr
        
        # Log incoming sync request (when peer pulls data from us)
        sync_service.log_incoming_sync_request(peer_ip)
        
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


@sync_bp.route('/node/list', methods=['GET'])
@swag_from({
    'tags': ['sync'],
    'summary': 'Get list of all node IDs',
    'description': 'Returns a combined list of this node ID and all peer node IDs',
    'responses': {
        200: {
            'description': 'Node list retrieved successfully',
            'content': {
                'application/json': {
                    'schema': {
                        'type': 'object',
                        'properties': {
                            'status': {'type': 'string', 'example': 'success'},
                            'node_ids': {
                                'type': 'array',
                                'items': {'type': 'string'},
                                'example': ['aa:aa:aa:aa:aa:aa', 'bb:bb:bb:bb:bb:bb']
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
def get_node_list():
    """Get combined list of this node ID and all peer node IDs"""
    try:
        my_node_id = sync_service.get_my_node_id()
        peers = sync_service.get_all_peers()
        peer_node_ids = list(peers.keys())
        
        # Combine my node ID with peer IDs
        all_node_ids = [my_node_id] + peer_node_ids
        
        return jsonify({
            'status': 'success',
            'node_ids': all_node_ids
        })
        
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': f'Server error: {str(e)}'
        }), 500


@sync_bp.route('/node/<node_id>/data', methods=['GET'])
@swag_from({
    'tags': ['sync'],
    'summary': 'Get node data since timestamp',
    'description': 'Retrieve location data for a specific node that is newer than the specified timestamp',
    'parameters': [
        {
            'name': 'node_id',
            'in': 'path',
            'required': True,
            'schema': {
                'type': 'string'
            },
            'description': 'Node ID (MAC address)'
        },
        {
            'name': 'since',
            'in': 'query',
            'required': False,
            'schema': {
                'type': 'integer',
                'default': 0
            },
            'description': 'UTC milliseconds timestamp (optional, defaults to 0)'
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
def get_node_data(node_id):
    """Get location data for a specific node since a timestamp"""
    try:
        since = request.args.get('since', type=int, default=0)
        
        # Get data from sync service
        data = sync_service.get_node_data_since(node_id, since)
        
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


@sync_bp.route('/test', methods=['GET'])
@swag_from({
    'tags': ['sync'],
    'summary': 'Test: Pull data from all peers',
    'description': 'Test endpoint that pulls data from all peers using since=0 (or specified timestamp). Does not update sync logs.',
    'parameters': [
        {
            'name': 'since',
            'in': 'query',
            'required': False,
            'schema': {
                'type': 'integer',
                'default': 0
            },
            'description': 'UTC milliseconds timestamp to use for all peers (default: 0)'
        }
    ],
    'responses': {
        200: {
            'description': 'Test pull completed',
            'content': {
                'application/json': {
                    'schema': {
                        'type': 'object',
                        'properties': {
                            'status': {'type': 'string', 'example': 'success'},
                            'peers_found': {'type': 'integer', 'example': 2},
                            'peers_attempted': {'type': 'integer', 'example': 2},
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
def test_pull_all_peers():
    """Test endpoint to pull data from all peers with a specified timestamp"""
    try:
        # Get since parameter (default to 0)
        since = request.args.get('since', type=int, default=0)
        
        # Call test function in sync service
        results = sync_service.test_pull_all_peers(since_timestamp=since)
        
        return jsonify({
            'status': 'success',
            **results
        })
        
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': f'Server error: {str(e)}'
        }), 500
