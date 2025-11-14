"""
Marshmallow schemas for Location API
These schemas define the request/response DTOs and are automatically used by Swagger
"""

from marshmallow import Schema, fields, validate
from flasgger import Schema as SwaggerSchema
from enum import Enum


class EntityTypeEnum(str, Enum):
    """Entity type enumeration"""
    RESPONDER = "responder"
    CIVILIAN = "civilian"
    INCIDENT = "incident"
    RESOURCE = "resource"
    HAZARD = "hazard"


class PositionSchema(Schema):
    """Position/geolocation schema"""
    lat = fields.Float(required=True, description="Latitude", example=52.5200)
    lon = fields.Float(required=True, description="Longitude", example=13.4050)
    alt = fields.Float(required=False, allow_none=True, description="Altitude in meters", example=100.0)
    accuracy = fields.Float(required=False, allow_none=True, description="Accuracy in meters", example=10.0)


class LocationRequestSchema(Schema):
    """Request schema for adding a location"""
    entity_type = fields.Str(
        required=True,
        validate=validate.OneOf([e.value for e in EntityTypeEnum]),
        description="Type of entity",
        example="responder"
    )
    entity_id = fields.UUID(
        required=True,
        description="Unique identifier for the entity",
        example="550e8400-e29b-41d4-a716-446655440000"
    )
    node_id = fields.Str(
        required=False,
        allow_none=True,
        description="Node ID (optional - will use current node if not provided)",
        example="node1"
    )
    position = fields.Nested(
        PositionSchema,
        required=True,
        description="Geographic position"
    )
    metadata = fields.Dict(
        required=False,
        allow_none=True,
        description="Additional metadata",
        example={"name": "Team Alpha", "status": "active"}
    )


class LocationResponseSchema(Schema):
    """Response schema for a location report"""
    id = fields.Str(description="Location report ID", example="loc-123")
    entity_type = fields.Str(description="Entity type", example="responder")
    entity_id = fields.UUID(description="Entity UUID", example="550e8400-e29b-41d4-a716-446655440000")
    node_id = fields.Str(description="Node ID", example="node1")
    position = fields.Nested(PositionSchema, description="Geographic position")
    created_at = fields.DateTime(description="Creation timestamp")
    metadata = fields.Dict(description="Additional metadata")


class LocationListResponseSchema(Schema):
    """Response schema for a list of locations"""
    status = fields.Str(description="Response status", example="success")
    count = fields.Int(description="Number of locations", example=10)
    data = fields.List(fields.Nested(LocationResponseSchema), description="List of locations")


class LocationSuccessResponseSchema(Schema):
    """Success response schema for location operations"""
    status = fields.Str(description="Response status", example="success")
    data = fields.Nested(LocationResponseSchema, description="Location data")


class LocationErrorResponseSchema(Schema):
    """Error response schema"""
    status = fields.Str(description="Response status", example="error")
    message = fields.Str(description="Error message", example="Invalid request data")


class NearbyRequestSchema(Schema):
    """Request schema for finding nearby entities"""
    center = fields.Nested(
        PositionSchema,
        required=True,
        description="Center point for search"
    )
    radius_km = fields.Float(
        required=True,
        description="Search radius in kilometers",
        example=5.0
    )
    entity_type = fields.Str(
        required=False,
        allow_none=True,
        validate=validate.OneOf([e.value for e in EntityTypeEnum]),
        description="Filter by entity type (optional)",
        example="resource"
    )


class NearbyResponseSchema(Schema):
    """Response schema for nearby entities"""
    status = fields.Str(description="Response status", example="success")
    center = fields.Nested(PositionSchema, description="Search center point")
    radius_km = fields.Float(description="Search radius in kilometers")
    count = fields.Int(description="Number of entities found", example=5)
    data = fields.List(fields.Nested(LocationResponseSchema), description="List of nearby locations")


class EntityTypesResponseSchema(Schema):
    """Response schema for entity types list"""
    status = fields.Str(description="Response status", example="success")
    data = fields.List(
        fields.Str(validate=validate.OneOf([e.value for e in EntityTypeEnum])),
        description="List of valid entity types",
        example=["responder", "civilian", "incident", "resource", "hazard"]
    )


class NodeIdResponseSchema(Schema):
    """Response schema for node ID"""
    status = fields.Str(description="Response status", example="success")
    node_id = fields.Str(description="Current node ID", example="node-abc123")


class HealthResponseSchema(Schema):
    """Health check response schema"""
    status = fields.Str(description="Service status", example="healthy")
    timestamp = fields.DateTime(description="Current timestamp")

