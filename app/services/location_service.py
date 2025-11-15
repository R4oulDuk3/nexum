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
    
    def add_locations_batch(self, reports: List[LocationReport], use_transaction: bool = True) -> dict:
        """
        Add multiple location reports in batch
        
        Args:
            reports: List of LocationReport objects to store
            use_transaction: Whether to use a transaction for atomicity (default: True)
            
        Returns:
            Dictionary with 'created', 'failed', and 'errors' keys
        """
        if not reports:
            return {'created': 0, 'failed': 0, 'errors': []}
        
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        created = []
        errors = []
        
        try:
            if use_transaction:
                cursor.execute('BEGIN TRANSACTION')
            
            for idx, report in enumerate(reports):
                try:
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
                        json.dumps(report.metadata)
                    ))
                    created.append(report)
                except Exception as e:
                    errors.append(f'Location {idx}: {str(e)}')
                    continue
            
            if use_transaction:
                conn.commit()
            else:
                conn.commit()
            
        except Exception as e:
            if use_transaction:
                conn.rollback()
            errors.append(f'Batch error: {str(e)}')
            raise
        finally:
            conn.close()
        
        return {
            'created': len(created),
            'failed': len(errors),
            'errors': errors if errors else None
        }
    
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
    
    def print_all_database_tables(self):
        """
        Print all database tables to console for debugging.
        Useful for testing to see what's in the database.
        """
        try:
            conn = sqlite3.connect(self.db_path)
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            
            # Get all table names
            cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
            tables = cursor.fetchall()
            
            print("\n" + "="*80)
            print("DATABASE TABLES DEBUG OUTPUT")
            print("="*80)
            
            for table_row in tables:
                table_name = table_row['name']
                print(f"\n--- Table: {table_name} ---")
                
                # Get all rows from table
                cursor.execute(f"SELECT * FROM {table_name}")
                rows = cursor.fetchall()
                
                if len(rows) == 0:
                    print("  (empty)")
                else:
                    # Print column names
                    column_names = [description[0] for description in cursor.description]
                    print(f"  Columns: {', '.join(column_names)}")
                    print(f"  Rows: {len(rows)}")
                    
                    # Print each row
                    for i, row in enumerate(rows, 1):
                        print(f"\n  Row {i}:")
                        for col_name in column_names:
                            value = row[col_name]
                            # Truncate long values for readability
                            if isinstance(value, str) and len(value) > 100:
                                value = value[:100] + "..."
                            print(f"    {col_name}: {value}")
            
            print("\n" + "="*80 + "\n")
            conn.close()
        except Exception as e:
            print(f"LocationService: Error printing database tables: {e}")
            import traceback
            traceback.print_exc()
    
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

