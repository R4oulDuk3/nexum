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
from services.cluster_service import get_cluster_service


class LocationService:
    """Service for tracking and querying entity locations"""
    
    def __init__(self, db_path: str = None):
        if db_path is None:
            # Default to app/data/messaging.db
            db_path = str(Path(__file__).parent.parent / 'data' / 'messaging.db')
        self.db_path = db_path
        self.cluster_service = get_cluster_service()
        # Schema is now managed by migrations in app/migrations/
    
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
            ON CONFLICT(id) DO NOTHING
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
    
    def add_locations_batch(self, reports: List[LocationReport], use_transaction: bool = True):
        """
        Add multiple location reports in batch
        
        Args:
            reports: List of LocationReport objects to store
            use_transaction: Whether to use a transaction for atomicity (default: True)
        """
        if not reports:
            return
        
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        if use_transaction:
            cursor.execute('BEGIN TRANSACTION')
        
        for report in reports:
            cursor.execute('''
                INSERT INTO location_reports (
                    id, entity_type, entity_id, node_id,
                    latitude, longitude, altitude, accuracy,
                    created_at, metadata
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO NOTHING
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
                json.dumps(report.metadata)
            ))
        
        conn.commit()
        conn.close()


    def get_locations_in_range(self, node_id: str, from_timestamp: int, to_timestamp: int) -> List[LocationReport]:
        """
        Get locations in range
        
        Args:
            node_id: Node ID
            from_timestamp: From timestamp
            to_timestamp: To timestamp
        """
        conn = None
        try:
            conn = sqlite3.connect(self.db_path)
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            
            cursor.execute('''
                SELECT * FROM location_reports WHERE node_id = ? AND created_at >= ? AND created_at <= ?
            ''', (node_id, from_timestamp, to_timestamp))
            
            rows = cursor.fetchall()
            # Verify rows are Row objects (not tuples)
            if rows and not isinstance(rows[0], sqlite3.Row):
                raise ValueError(f"Expected sqlite3.Row objects, got {type(rows[0])}")
            # Convert rows to LocationReport objects before closing connection
            reports = [self._row_to_report(row) for row in rows]
            conn.close()
            
            return reports
        except Exception as e:
            if conn:
                conn.close()
            print(f"LocationService: Error getting locations in range: {e}")
            raise
    
    
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

