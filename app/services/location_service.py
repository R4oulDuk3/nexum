"""
Location tracking service for disaster relief operations
"""

import sqlite3
import json
from typing import List, Optional
from uuid import UUID
from pathlib import Path

import sys
sys.path.append(str(Path(__file__).parent.parent))

from models.location import LocationReport, EntityType, GeoLocation


class LocationService:
    """Service for tracking and querying entity locations"""
    
    def __init__(self, db_path: str = None):
        if db_path is None:
            # Default to app/data/messaging.db
            db_path = str(Path(__file__).parent.parent / 'data' / 'messaging.db')
        self.db_path = db_path
        self._init_schema()
    
    def _init_schema(self):
        """Create location tables if they don't exist"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS location_reports (
                id TEXT PRIMARY KEY,
                entity_type TEXT NOT NULL,
                entity_id TEXT NOT NULL,
                node_id TEXT NOT NULL,
                latitude REAL NOT NULL,
                longitude REAL NOT NULL,
                altitude REAL,
                accuracy REAL,
                created_at INTEGER NOT NULL,
                metadata TEXT
            )
        ''')
        
        # Create indexes for common queries
        cursor.execute('''
            CREATE INDEX IF NOT EXISTS idx_entity 
            ON location_reports(entity_id)
        ''')
        
        cursor.execute('''
            CREATE INDEX IF NOT EXISTS idx_entity_type 
            ON location_reports(entity_type)
        ''')
        
        cursor.execute('''
            CREATE INDEX IF NOT EXISTS idx_created_at 
            ON location_reports(created_at)
        ''')
        
        cursor.execute('''
            CREATE INDEX IF NOT EXISTS idx_node 
            ON location_reports(node_id)
        ''')
        
        conn.commit()
        conn.close()
    
    def add_location(self, report: LocationReport) -> LocationReport:
        """
        Record a new location report
        
        Args:
            report: LocationReport to store
            
        Returns:
            The stored LocationReport
        """
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute('''
            INSERT INTO location_reports (
                id, entity_type, entity_id, node_id,
                latitude, longitude, altitude, accuracy,
                created_at, metadata
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            str(report.id),
            report.entity_type.value,
            str(report.entity_id),
            report.node_id,
            report.position.latitude,
            report.position.longitude,
            report.position.altitude,
            report.position.accuracy,
            report.created_at,
            json.dumps(report.metadata)  # Store as JSON string
        ))
        
        conn.commit()
        conn.close()
        
        return report
    
    def get_latest_locations(
        self,
        entity_type: Optional[EntityType] = None,
        limit: int = 100
    ) -> List[LocationReport]:
        """
        Get the most recent location for each entity, optionally filtered by type
        
        Args:
            entity_type: Filter by entity type (optional)
            limit: Maximum number of results
            
        Returns:
            List of LocationReports with latest position per entity
        """
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        # Get latest location per entity
        if entity_type:
            query = '''
                SELECT lr.*
                FROM location_reports lr
                INNER JOIN (
                    SELECT entity_id, MAX(created_at) as max_created_at
                    FROM location_reports
                    WHERE entity_type = ?
                    GROUP BY entity_id
                ) latest ON lr.entity_id = latest.entity_id 
                        AND lr.created_at = latest.max_created_at
                ORDER BY lr.created_at DESC
                LIMIT ?
            '''
            cursor.execute(query, (entity_type.value, limit))
        else:
            query = '''
                SELECT lr.*
                FROM location_reports lr
                INNER JOIN (
                    SELECT entity_id, MAX(created_at) as max_created_at
                    FROM location_reports
                    GROUP BY entity_id
                ) latest ON lr.entity_id = latest.entity_id 
                        AND lr.created_at = latest.max_created_at
                ORDER BY lr.created_at DESC
                LIMIT ?
            '''
            cursor.execute(query, (limit,))
        
        rows = cursor.fetchall()
        conn.close()
        
        return [self._row_to_report(row) for row in rows]
    
    def get_location_history(
        self,
        entity_id: UUID,
        since: Optional[int] = None,
        limit: int = 100
    ) -> List[LocationReport]:
        """
        Get location history for a specific entity
        
        Args:
            entity_id: UUID of the entity to track
            since: UTC milliseconds timestamp (optional)
            limit: Maximum number of results
            
        Returns:
            List of LocationReports ordered by time (newest first)
        """
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        if since:
            cursor.execute('''
                SELECT * FROM location_reports
                WHERE entity_id = ? AND created_at > ?
                ORDER BY created_at DESC
                LIMIT ?
            ''', (str(entity_id), since, limit))
        else:
            cursor.execute('''
                SELECT * FROM location_reports
                WHERE entity_id = ?
                ORDER BY created_at DESC
                LIMIT ?
            ''', (str(entity_id), limit))
        
        rows = cursor.fetchall()
        conn.close()
        
        return [self._row_to_report(row) for row in rows]
    
    def get_nearby_entities(
        self,
        center: GeoLocation,
        radius_km: float,
        entity_type: Optional[EntityType] = None
    ) -> List[LocationReport]:
        """
        Find entities near a location (simple bounding box approximation)
        
        Args:
            center: Center point for search
            radius_km: Search radius in kilometers
            entity_type: Filter by entity type (optional)
            
        Returns:
            List of LocationReports within radius
            
        Note: Uses simple bounding box. For production, consider PostGIS or GeoPandas
        """
        # Simple bounding box (approximately 111km per degree)
        lat_delta = radius_km / 111.0
        lon_delta = radius_km / (111.0 * max(0.0001, abs(center.latitude)))
        
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        # Get latest locations within bounding box
        if entity_type:
            query = '''
                SELECT lr.*
                FROM location_reports lr
                INNER JOIN (
                    SELECT entity_id, MAX(created_at) as max_created_at
                    FROM location_reports
                    WHERE latitude BETWEEN ? AND ?
                      AND longitude BETWEEN ? AND ?
                      AND entity_type = ?
                    GROUP BY entity_id
                ) latest ON lr.entity_id = latest.entity_id 
                        AND lr.created_at = latest.max_created_at
            '''
            params = [
                center.latitude - lat_delta,
                center.latitude + lat_delta,
                center.longitude - lon_delta,
                center.longitude + lon_delta,
                entity_type.value
            ]
        else:
            query = '''
                SELECT lr.*
                FROM location_reports lr
                INNER JOIN (
                    SELECT entity_id, MAX(created_at) as max_created_at
                    FROM location_reports
                    WHERE latitude BETWEEN ? AND ?
                      AND longitude BETWEEN ? AND ?
                    GROUP BY entity_id
                ) latest ON lr.entity_id = latest.entity_id 
                        AND lr.created_at = latest.max_created_at
            '''
            params = [
                center.latitude - lat_delta,
                center.latitude + lat_delta,
                center.longitude - lon_delta,
                center.longitude + lon_delta
            ]
        
        cursor.execute(query, params)
        rows = cursor.fetchall()
        conn.close()
        
        return [self._row_to_report(row) for row in rows]
    
    def _row_to_report(self, row: sqlite3.Row) -> LocationReport:
        """Convert database row to LocationReport"""
        metadata = {}
        if row['metadata']:
            try:
                metadata = json.loads(row['metadata'])
            except json.JSONDecodeError:
                metadata = {}
        
        return LocationReport(
            id=UUID(row['id']),
            entity_type=EntityType(row['entity_type']),
            entity_id=UUID(row['entity_id']),
            node_id=row['node_id'],
            position=GeoLocation(
                latitude=row['latitude'],
                longitude=row['longitude'],
                altitude=row['altitude'],
                accuracy=row['accuracy']
            ),
            created_at=row['created_at'],
            metadata=metadata
        )

