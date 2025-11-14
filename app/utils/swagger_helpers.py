"""
Helper utilities for Swagger/OpenAPI documentation
Automatically generates Swagger docs from Marshmallow schemas
"""

from functools import wraps
from flasgger import swag_from


def auto_doc(schema=None, request_schema=None, response_schema=None, 
             summary=None, description=None, tags=None, method='POST'):
    """
    Decorator that automatically generates Swagger documentation from Marshmallow schemas
    
    Usage:
        @location_bp.route('/', methods=['POST'])
        @auto_doc(
            request_schema=LocationRequestSchema,
            response_schema=LocationSuccessResponseSchema,
            summary='Add location',
            tags=['locations']
        )
        def add_location():
            ...
    """
    def decorator(func):
        # Build Swagger spec dict from schemas
        spec_dict = {
            'summary': summary or func.__doc__ or func.__name__.replace('_', ' ').title(),
            'description': description or func.__doc__ or '',
            'tags': tags or []
        }
        
        # Add request body for POST/PUT/PATCH
        if method in ['POST', 'PUT', 'PATCH'] and request_schema:
            spec_dict['requestBody'] = {
                'required': True,
                'content': {
                    'application/json': {
                        'schema': schema_ref(request_schema)
                    }
                }
            }
        
        # Add response schemas
        spec_dict['responses'] = {}
        
        if response_schema:
            status_code = 201 if method == 'POST' else 200
            spec_dict['responses'][status_code] = {
                'description': 'Success',
                'content': {
                    'application/json': {
                        'schema': schema_ref(response_schema)
                    }
                }
            }
        
        # Add error response
        spec_dict['responses'][400] = {
            'description': 'Invalid request',
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
        
        # Apply swag_from with generated spec
        return swag_from(spec_dict)(func)
    
    return decorator


def schema_ref(schema_class):
    """Return OpenAPI schema reference for a Marshmallow schema class"""
    return {'$ref': f'#/components/schemas/{schema_class.__name__}'}

