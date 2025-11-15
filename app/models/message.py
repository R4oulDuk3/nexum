"""
Messaging models for mesh communication
"""

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Dict, Any, Optional
from uuid import UUID, uuid4


@dataclass
class MeshMessage:
    """Represents a message sent across the mesh network"""
    id: UUID
    sender_id: UUID              # UUID of sender entity (responder, device, etc.)
    recipient_id: Optional[UUID] # UUID of recipient (None = broadcast)
    message: str                 # The message content
    timestamp: int               # UTC milliseconds
    
    metadata: Dict[str, Any]     # Extra optional info (e.g., priority, node_id, etc.)

    def to_dict(self) -> dict:
        """Convert to dictionary for JSON serialization"""
        return {
            "id": str(self.id),
            "sender_id": str(self.sender_id),
            "recipient_id": str(self.recipient_id) if self.recipient_id else None,
            "message": self.message,
            "timestamp": self.timestamp,
            "metadata": self.metadata
        }

    @classmethod
    def from_dict(cls, data: dict) -> 'MeshMessage':
        """Create from dictionary"""
        return cls(
            id=UUID(data["id"]),
            sender_id=UUID(data["sender_id"]),
            recipient_id=UUID(data["recipient_id"]) if data.get("recipient_id") else None,
            message=data["message"],
            timestamp=data["timestamp"],
            metadata=data.get("metadata", {})
        )

    @staticmethod
    def create_new(
        sender_id: UUID,
        message: str,
        recipient_id: Optional[UUID] = None,
        metadata: Optional[Dict[str, Any]] = None
    ) -> 'MeshMessage':
        """Factory method for creating a new message"""
        return MeshMessage(
            id=uuid4(),
            sender_id=sender_id,
            recipient_id=recipient_id,
            message=message,
            timestamp=int(datetime.now(timezone.utc).timestamp() * 1000),
            metadata=metadata or {}
        )