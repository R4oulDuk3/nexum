"""
Location tracking API routes
"""

from flask import Blueprint, request, jsonify
from flasgger import swag_from
from marshmallow import ValidationError
from apispec import APISpec
from apispec.ext.marshmallow import MarshmallowPlugin
from uuid import UUID
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).parent.parent))

from services.location_service import LocationService
from services.cluster_service import get_cluster_service
from models.location import LocationReport, EntityType, GeoLocation
from schemas.location_schemas import (
    PositionSchema,
    LocationRequestSchema,
    LocationSuccessResponseSchema,
    LocationResponseSchema,
    LocationListResponseSchema,
    NearbyRequestSchema,
    NearbyResponseSchema,
    EntityTypesResponseSchema,
    NodeIdResponseSchema
)

location_bp = Blueprint('location', __name__, url_prefix='/api/locations')
location_service = LocationService()
cluster_service = get_cluster_service()

# Create APISpec instance for schema conversion
_apispec = APISpec(
    title='Nexum Mesh API',
    version='1.0.0',
    openapi_version='3.0.0',
    plugins=[MarshmallowPlugin()]
)

# Register all schemas with APISpec once
# Register nested schemas first (required by schemas that use them)
_apispec.components.schema('PositionSchema', schema=PositionSchema)
_apispec.components.schema('LocationResponseSchema', schema=LocationResponseSchema)
# Register request/response schemas
_apispec.components.schema('LocationRequestSchema', schema=LocationRequestSchema)
_apispec.components.schema('LocationSuccessResponseSchema', schema=LocationSuccessResponseSchema)
_apispec.components.schema('LocationListResponseSchema', schema=LocationListResponseSchema)
_apispec.components.schema('NearbyRequestSchema', schema=NearbyRequestSchema)
_apispec.components.schema('NearbyResponseSchema', schema=NearbyResponseSchema)
_apispec.components.schema('EntityTypesResponseSchema', schema=EntityTypesResponseSchema)
_apispec.components.schema('NodeIdResponseSchema', schema=NodeIdResponseSchema)

# Helper function to convert Marshmallow schema to OpenAPI dict
# This extracts the full schema definition from APISpec so Flasgger can include it
def schema_to_dict(schema_class):
    """Convert Marshmallow schema to OpenAPI dict that Flasgger understands"""
    spec_dict = _apispec.to_dict()
    schema_name = schema_class.__name__
    
    # Get the schema definition from APISpec's components
    if 'components' in spec_dict and 'schemas' in spec_dict['components']:
        schemas = spec_dict['components']['schemas']
        if schema_name in schemas:
            return schemas[schema_name]
    
    # Fallback: if schema not found, return a reference (shouldn't happen)
    return {'$ref': f'#/components/schemas/{schema_name}'}

# Initialize schema instances for validation (used in route handlers)
location_request_schema = LocationRequestSchema()
location_response_schema = LocationSuccessResponseSchema()
location_list_schema = LocationListResponseSchema()
nearby_request_schema = NearbyRequestSchema()
nearby_response_schema = NearbyResponseSchema()
entity_types_schema = EntityTypesResponseSchema()
node_id_schema = NodeIdResponseSchema()


@location_bp.route('/', methods=['POST'])
@swag_from({
    'tags': ['locations'],
    'summary': 'Record a new location report',
    'description': 'Add a location report for an entity (responder, civilian, etc.)',
    'requestBody': {
        'required': True,
        'content': {
            'application/json': {
                'schema': schema_to_dict(LocationRequestSchema)
            }
        }
    },
    'responses': {
        201: {
            'description': 'Location added successfully',
            'content': {
            'application/json': {
                'schema': schema_to_dict(LocationSuccessResponseSchema)
            }
            }
        },
        400: {
            'description': 'Invalid request data',
            'content': {
                'application/json': {
                    'schema': {
                        'type': 'object',
                        'properties': {
                            'status': {'type': 'string', 'example': 'error'},
                            'message': {'type': 'string', 'example': 'Invalid request data'}
                        }
                    }
                }
            }
        }
    }
})
def add_location():
    """Record a new location report"""
    try:
        # Validate and deserialize request
        errors = location_request_schema.validate(request.json)
        if errors:
            return jsonify({
                'status': 'error',
                'message': f'Validation error: {errors}'
            }), 400
        
        data = location_request_schema.load(request.json)
        
        # Use provided node_id or get from cluster service
        node_id = data.get('node_id') or cluster_service.get_current_node_id()
        
        # Marshmallow already deserializes UUID fields to UUID objects
        # So data['entity_id'] is already a UUID object, not a string
        entity_id = data['entity_id']
        if isinstance(entity_id, str):
            entity_id = UUID(entity_id)
        
        report = LocationReport.create_new(
            entity_type=EntityType(data['entity_type']),
            entity_id=entity_id,
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
@swag_from({
    'tags': ['locations'],
    'summary': 'Get latest location for each entity',
    'description': 'Retrieve the most recent location report for each entity',
    'parameters': [
        {
            'name': 'type',
            'in': 'query',
            'schema': {
                'type': 'string',
                'enum': ['responder', 'civilian', 'incident', 'resource', 'hazard']
            },
            'description': 'Filter by entity type (optional)',
            'required': False
        },
        {
            'name': 'limit',
            'in': 'query',
            'schema': {
                'type': 'integer',
                'default': 100
            },
            'description': 'Maximum number of results (default: 100)',
            'required': False
        }
    ],
    'responses': {
        200: {
            'description': 'Latest locations retrieved successfully',
            'content': {
                'application/json': {
                    'schema': schema_to_dict(LocationListResponseSchema)
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
def get_latest_locations():
    """Get latest location for each entity"""
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
@swag_from({
    'tags': ['locations'],
    'summary': 'Get location history for an entity',
    'description': 'Retrieve location history for a specific entity',
    'parameters': [
        {
            'name': 'entity_id',
            'in': 'path',
            'required': True,
            'schema': {
                'type': 'string',
                'format': 'uuid'
            },
            'description': 'Entity UUID'
        },
        {
            'name': 'since',
            'in': 'query',
            'required': False,
            'schema': {
                'type': 'integer'
            },
            'description': 'UTC milliseconds timestamp (optional)'
        },
        {
            'name': 'limit',
            'in': 'query',
            'required': False,
            'schema': {
                'type': 'integer',
                'default': 100
            },
            'description': 'Maximum number of results (default: 100)'
        }
    ],
    'responses': {
        200: {
            'description': 'Location history retrieved successfully',
            'content': {
                'application/json': {
                    'schema': schema_to_dict(LocationListResponseSchema)
                }
            }
        },
        400: {
            'description': 'Invalid UUID or parameter',
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
def get_location_history(entity_id):
    """Get location history for an entity"""
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
@swag_from({
    'tags': ['locations'],
    'summary': 'Find entities near a location',
    'description': 'Search for entities within a specified radius of a location',
    'requestBody': {
        'required': True,
        'content': {
            'application/json': {
                'schema': schema_to_dict(NearbyRequestSchema)
            }
        }
    },
    'responses': {
        200: {
            'description': 'Nearby entities found',
            'content': {
            'application/json': {
                'schema': schema_to_dict(NearbyResponseSchema)
            }
            }
        },
        400: {
            'description': 'Invalid request data',
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
def get_nearby():
    """Find entities near a location"""
    try:
        # Validate request
        errors = nearby_request_schema.validate(request.json)
        if errors:
            return jsonify({
                'status': 'error',
                'message': f'Validation error: {errors}'
            }), 400
        
        data = nearby_request_schema.load(request.json)
        
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
@swag_from({
    'tags': ['locations'],
    'summary': 'Get list of valid entity types',
    'description': 'Retrieve all valid entity type values',
    'responses': {
        200: {
            'description': 'List of entity types',
            'content': {
            'application/json': {
                'schema': schema_to_dict(EntityTypesResponseSchema)
            }
            }
        }
    }
})
def get_entity_types():
    """Get list of valid entity types"""
    return jsonify({
        'status': 'success',
        'data': [e.value for e in EntityType]
    })


@location_bp.route('/node-id', methods=['GET'])
@swag_from({
    'tags': ['locations'],
    'summary': 'Get current node ID',
    'description': 'Retrieve the ID of the current mesh node',
    'responses': {
        200: {
            'description': 'Current node ID',
            'content': {
            'application/json': {
                'schema': schema_to_dict(NodeIdResponseSchema)
            }
            }
        }
    }
})
def get_node_id():
    """Get current node ID"""
    return jsonify({
        'status': 'success',
        'node_id': cluster_service.get_current_node_id()
    })

