"""
Location tracking models for disaster relief operations
"""

from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from enum import Enum
from typing import Optional, Dict, Any
from uuid import UUID, uuid4
import json


class EntityType(Enum):
    """Types of entities that can be tracked"""
    RESPONDER = "responder"      # Emergency responder/volunteer
    CIVILIAN = "civilian"        # Person needing help
    INCIDENT = "incident"        # Event/emergency situation
    RESOURCE = "resource"        # Safe spot, shelter, supply point
    HAZARD = "hazard"           # Danger zone, obstacle


@dataclass
class GeoLocation:
    """Geographic coordinates"""
    latitude: float
    longitude: float
    altitude: Optional[float] = None  # meters above sea level
    accuracy: Optional[float] = None   # meters (GPS accuracy)
    
    def to_dict(self) -> dict:
        """Convert to dictionary for JSON serialization"""
        return {
            'lat': self.latitude,
            'lon': self.longitude,
            'alt': self.altitude,
            'accuracy': self.accuracy
        }
    
    @classmethod
    def from_dict(cls, data: dict) -> 'GeoLocation':
        """Create from dictionary"""
        return cls(
            latitude=data['lat'],
            longitude=data['lon'],
            altitude=data.get('alt'),
            accuracy=data.get('accuracy')
        )


@dataclass
class LocationReport:
    """A location report for a tracked entity"""
    id: UUID
    entity_type: EntityType
    entity_id: UUID
    node_id: str                    # Which mesh node reported this
    position: GeoLocation
    created_at: int                 # UTC milliseconds timestamp
    metadata: Dict[str, Any]        # Additional context
    
    def to_dict(self) -> dict:
        """Convert to dictionary for JSON serialization"""
        return {
            'id': str(self.id),
            'entity_type': self.entity_type.value,
            'entity_id': str(self.entity_id),
            'node_id': self.node_id,
            'position': self.position.to_dict(),
            'created_at': self.created_at,
            'metadata': self.metadata
        }
    
    @classmethod
    def from_dict(cls, data: dict) -> 'LocationReport':
        """Create from dictionary"""
        return cls(
            id=UUID(data['id']),
            entity_type=EntityType(data['entity_type']),
            entity_id=UUID(data['entity_id']),
            node_id=data['node_id'],
            position=GeoLocation.from_dict(data['position']),
            created_at=data['created_at'],
            metadata=data.get('metadata', {})
        )
    
    @staticmethod
    def create_new(
        entity_type: EntityType,
        entity_id: UUID,
        node_id: str,
        position: GeoLocation,
        metadata: Optional[Dict[str, Any]] = None,
        created_at: Optional[int] = None
    ) -> 'LocationReport':
        """Factory method to create a new location report
        
        Args:
            entity_type: Type of entity
            entity_id: Unique identifier for the entity
            node_id: Mesh node ID
            position: Geographic position
            metadata: Optional metadata dictionary
            created_at: Optional UTC milliseconds timestamp (defaults to now())
        """
        if created_at is None:
            created_at = int(datetime.now(timezone.utc).timestamp() * 1000)
        
        return LocationReport(
            id=uuid4(),
            entity_type=entity_type,
            entity_id=entity_id,
            node_id=node_id,
            position=position,
            created_at=created_at,
            metadata=metadata or {}
        )

