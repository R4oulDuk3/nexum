"""
Location tracking API routes
"""

from flask import Blueprint, request, jsonify
from flasgger import swag_from
from marshmallow import ValidationError
from apispec import APISpec
from apispec.ext.marshmallow import MarshmallowPlugin
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
        
        report = LocationReport.create_new(
            entity_type=EntityType(data['entity_type']),
            entity_id=data['entity_id'],
            node_id=cluster_service.get_current_node_id(),
            position=GeoLocation.from_dict(data['position']),
            metadata=data.get('metadata', {}),
            created_at=data.get('created_at')
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


@location_bp.route('/batch', methods=['POST'])
@swag_from({
    'tags': ['locations'],
    'summary': 'Add multiple location reports in batch',
    'description': 'Record multiple location reports in a single request. Useful for scenario generation.',
    'requestBody': {
        'required': True,
        'content': {
            'application/json': {
                'schema': {
                    'type': 'object',
                    'properties': {
                        'locations': {
                            'type': 'array',
                            'items': {
                                '$ref': '#/components/schemas/LocationRequestSchema'
                            },
                            'minItems': 1,
                            'maxItems': 1000,
                            'description': 'Array of location reports to add'
                        }
                    },
                    'required': ['locations']
                },
                'example': {
                    'locations': [
                        {
                            'entity_type': 'responder',
                            'entity_id': '550e8400-e29b-41d4-a716-446655440000',
                            'position': {'lat': 52.5200, 'lon': 13.4050},
                            'metadata': {'name': 'Team Alpha'},
                            'created_at': 1640995200000
                        }
                    ]
                }
            }
        }
    },
    'responses': {
        201: {
            'description': 'Locations created successfully',
            'content': {
                'application/json': {
                    'schema': {
                        'type': 'object',
                        'properties': {
                            'status': {'type': 'string', 'example': 'success'},
                            'created': {'type': 'integer', 'example': 10},
                            'failed': {'type': 'integer', 'example': 0},
                            'errors': {
                                'type': 'array',
                                'items': {'type': 'string'}
                            },
                            'data': {
                                'type': 'array',
                                'items': {'$ref': '#/components/schemas/LocationResponseSchema'}
                            }
                        }
                    }
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
def add_locations_batch():
    """Record multiple location reports in batch"""
    try:
        if not request.json or 'locations' not in request.json:
            return jsonify({
                'status': 'error',
                'message': 'Missing "locations" array in request body'
            }), 400
        
        locations = request.json['locations']
        
        if len(locations) == 0:
            return jsonify({
                'status': 'error',
                'message': '"locations" array cannot be empty'
            }), 400
        
        if len(locations) > 1000:
            return jsonify({
                'status': 'error',
                'message': f'Batch size too large. Maximum 1000 locations, got {len(locations)}'
            }), 400
        
        node_id = request.json.get('node_id') or cluster_service.get_current_node_id()
        
        reports = []
        errors = []
        
        for idx, location_data in enumerate(locations):
            try:
                errors_validate = location_request_schema.validate(location_data)
                if errors_validate:
                    errors.append(f'Location {idx}: Validation error - {errors_validate}')
                    continue
                
                data = location_request_schema.load(location_data)
                
                report = LocationReport.create_new(
                    entity_type=EntityType(data['entity_type']),
                    entity_id=data['entity_id'],
                    node_id=data.get('node_id') or node_id,
                    position=GeoLocation.from_dict(data['position']),
                    created_at=data.get('created_at'),
                    metadata=data.get('metadata', {})
                )
                
                reports.append(report)
                
            except Exception as e:
                errors.append(f'Location {idx}: {str(e)}')
                continue
        
        # Add locations in batch
        if reports:
            location_service.add_locations_batch(reports)
            created_count = len(reports)
            created_reports = reports
        else:
            created_count = 0
            created_reports = []
        
        failed_count = len(errors)
        
        return jsonify({
            'status': 'success',
            'created': created_count,
            'failed': failed_count,
            'errors': errors if errors else None,
            'data': [r.to_dict() for r in created_reports]
        }), 201
        
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': f'Server error: {str(e)}'
        }), 500
