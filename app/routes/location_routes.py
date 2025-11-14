"""
Location tracking API routes
"""

from flask import Blueprint, request, jsonify
from uuid import UUID
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).parent.parent))

from services.location_service import LocationService
from services.cluster_service import get_cluster_service
from models.location import LocationReport, EntityType, GeoLocation

location_bp = Blueprint('location', __name__, url_prefix='/api/locations')
location_service = LocationService()
cluster_service = get_cluster_service()


@location_bp.route('/', methods=['POST'])
def add_location():
    """
    Record a new location report
    
    Expected JSON:
    {
        "entity_type": "responder",
        "entity_id": "uuid-string",
        "node_id": "node1",  // optional, will use current node if not provided
        "position": {
            "lat": 52.5200,
            "lon": 13.4050,
            "alt": 100.0,  // optional
            "accuracy": 10.0  // optional
        },
        "metadata": {  // optional
            "name": "Team Alpha",
            "status": "active"
        }
    }
    """
    try:
        data = request.json
        
        # Use provided node_id or get from cluster service
        node_id = data.get('node_id') or cluster_service.get_current_node_id()
        
        report = LocationReport.create_new(
            entity_type=EntityType(data['entity_type']),
            entity_id=UUID(data['entity_id']),
            node_id=node_id,
            position=GeoLocation.from_dict(data['position']),
            metadata=data.get('metadata', {})
        )
        
        location_service.add_location(report)
        
        return jsonify({
            'status': 'success',
            'data': report.to_dict()
        }), 201
        
    except (KeyError, ValueError) as e:
        return jsonify({
            'status': 'error',
            'message': f'Invalid request data: {str(e)}'
        }), 400
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': f'Server error: {str(e)}'
        }), 500


@location_bp.route('/latest', methods=['GET'])
def get_latest_locations():
    """
    Get latest location for each entity
    
    Query params:
    - type: Filter by entity type (optional)
    - limit: Maximum number of results (default: 100)
    
    Example: /api/locations/latest?type=responder&limit=50
    """
    try:
        entity_type = request.args.get('type')
        limit = int(request.args.get('limit', 100))
        
        entity_type_filter = EntityType(entity_type) if entity_type else None
        reports = location_service.get_latest_locations(entity_type_filter, limit)
        
        return jsonify({
            'status': 'success',
            'count': len(reports),
            'data': [r.to_dict() for r in reports]
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


@location_bp.route('/history/<entity_id>', methods=['GET'])
def get_location_history(entity_id):
    """
    Get location history for an entity
    
    Query params:
    - since: UTC milliseconds timestamp (optional)
    - limit: Maximum number of results (default: 100)
    
    Example: /api/locations/history/uuid-string?since=1234567890000&limit=50
    """
    try:
        since = request.args.get('since', type=int)
        limit = int(request.args.get('limit', 100))
        
        reports = location_service.get_location_history(
            UUID(entity_id), since, limit
        )
        
        return jsonify({
            'status': 'success',
            'entity_id': entity_id,
            'count': len(reports),
            'data': [r.to_dict() for r in reports]
        })
        
    except ValueError as e:
        return jsonify({
            'status': 'error',
            'message': f'Invalid UUID or parameter: {str(e)}'
        }), 400
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': f'Server error: {str(e)}'
        }), 500


@location_bp.route('/nearby', methods=['POST'])
def get_nearby():
    """
    Find entities near a location
    
    Expected JSON:
    {
        "center": {
            "lat": 52.5200,
            "lon": 13.4050
        },
        "radius_km": 5.0,
        "entity_type": "resource"  // optional
    }
    """
    try:
        data = request.json
        
        center = GeoLocation.from_dict(data['center'])
        radius_km = float(data['radius_km'])
        entity_type = data.get('entity_type')
        
        entity_type_filter = EntityType(entity_type) if entity_type else None
        reports = location_service.get_nearby_entities(
            center, radius_km, entity_type_filter
        )
        
        return jsonify({
            'status': 'success',
            'center': center.to_dict(),
            'radius_km': radius_km,
            'count': len(reports),
            'data': [r.to_dict() for r in reports]
        })
        
    except (KeyError, ValueError) as e:
        return jsonify({
            'status': 'error',
            'message': f'Invalid request data: {str(e)}'
        }), 400
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': f'Server error: {str(e)}'
        }), 500


@location_bp.route('/types', methods=['GET'])
def get_entity_types():
    """Get list of valid entity types"""
    return jsonify({
        'status': 'success',
        'data': [e.value for e in EntityType]
    })


@location_bp.route('/node-id', methods=['GET'])
def get_node_id():
    """Get current node ID"""
    return jsonify({
        'status': 'success',
        'node_id': cluster_service.get_current_node_id()
    })

