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
from datetime import datetime, timezone

sys.path.append(str(Path(__file__).parent.parent))

from services.sync_service import get_sync_service
from services.location_service import LocationService

sync_bp = Blueprint('sync', __name__, url_prefix='/api/sync')
sync_service = get_sync_service()
location_service = LocationService()

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
        
        # Get data from sync service (default until to current time)
        until = int(datetime.now(timezone.utc).timestamp() * 1000)
        data = sync_service.get_own_data_since(since, until)
        
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
        sync_service.sync_with_all_peers()
        
        return jsonify({
            'status': 'success'
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


@sync_bp.route('/node/<node_id>/from/<from_timestamp>/to/<to_timestamp>', methods=['GET'])
@swag_from({
    'tags': ['sync'],
    'summary': 'Get locations in range',
    'description': 'Get locations in range for a specific node',
    'parameters': [
        {
            'name': 'node_id',
            'in': 'path',
            'required': True,
            'schema': {
                'type': 'string'
            }
        },
        {
            'name': 'from_timestamp',
            'in': 'path',
            'required': True,
            'schema': {
                'type': 'integer'
            }
        },
        {
            'name': 'to_timestamp',
            'in': 'path',
            'required': True,
            'schema': {
                'type': 'integer'
            }
        }
    ],
    'responses': {
        200: {
            'description': 'Locations retrieved successfully',
            'content': {
                'application/json': {
                    'schema': {
                        'type': 'object',
                        'properties': {
                            'status': {'type': 'string', 'example': 'success'},
                            'data': {
                                'type': 'array',
                                'items': {'type': 'object'}
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
def get_locations_in_range(node_id, from_timestamp, to_timestamp):
    """Get locations in range"""
    try:
        locations = location_service.get_locations_in_range(node_id, int(from_timestamp), int(to_timestamp))
        return jsonify({
            'status': 'success',
            'data': [l.to_dict() for l in locations]
        }), 200
    except Exception as e:
        print(f'Server error on getting locations in range: {str(e)}')
        return jsonify({
            'status': 'error',
            'message': f'Server error: {str(e)}'
        }), 500


@sync_bp.route('/node/sync/from/<from_timestamp>/to/<to_timestamp>', methods=['GET'])
@swag_from({
    'tags': ['sync'],
    'summary': 'Get locations in range for sync',
    'description': 'Get locations in range for the current node (for sync)',
    'parameters': [
        {
            'name': 'from_timestamp',
            'in': 'path',
            'required': True,
            'schema': {
                'type': 'integer'
            }
        },
        {
            'name': 'to_timestamp',
            'in': 'path',
            'required': True,
            'schema': {
                'type': 'integer'
            }
        }
    ],
    'responses': {
        200: {
            'description': 'Locations retrieved successfully',
            'content': {
                'application/json': {
                    'schema': {
                        'type': 'object',
                        'properties': {
                            'status': {'type': 'string', 'example': 'success'},
                            'data': {
                                'type': 'array',
                                'items': {'type': 'object'}
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
def get_locations_in_range_sync(from_timestamp, to_timestamp):
    """Get locations in range for sync"""
    try:
        node_id = sync_service.get_my_node_id()
        locations = location_service.get_locations_in_range(node_id, int(from_timestamp), int(to_timestamp))
        return jsonify({
            'status': 'success',
            'data': [l.to_dict() for l in locations]
        }), 200
    except Exception as e:
        print(f'Server error on getting sync data: {str(e)}')
        return jsonify({
            'status': 'error',
            'message': f'Server error: {str(e)}'
        }), 500


@sync_bp.route('/status', methods=['GET'])
@swag_from({
    'tags': ['sync'],
    'summary': 'Get sync log status',
    'description': 'Get sync_log status for all peers, showing last sync times and IPs',
    'responses': {
        200: {
            'description': 'Sync log status retrieved successfully',
            'content': {
                'application/json': {
                    'schema': {
                        'type': 'object',
                        'properties': {
                            'status': {'type': 'string', 'example': 'success'},
                            'sync_log': {
                                'type': 'array',
                                'items': {
                                    'type': 'object',
                                    'properties': {
                                        'peer_node_id': {'type': 'string'},
                                        'last_known_ip': {'type': 'string'},
                                        'last_sync_at': {'type': 'integer'},
                                        'last_sync_at_readable': {'type': 'string'},
                                        'sync_age_ms': {'type': 'integer', 'nullable': True},
                                        'sync_age_seconds': {'type': 'number', 'nullable': True}
                                    }
                                }
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
def get_sync_status():
    """Get sync_log status for all peers"""
    try:
        sync_log = sync_service.get_sync_log_status()
        
        # Include scheduler status if available
        try:
            from services.sync_scheduler import get_sync_scheduler
            scheduler_status = get_sync_scheduler().get_status()
        except Exception:
            scheduler_status = None
        
        response = {
            'status': 'success',
            'sync_log': sync_log
        }
        
        if scheduler_status:
            response['scheduler'] = scheduler_status
        
        return jsonify(response)
        
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': f'Server error: {str(e)}'
        }), 500