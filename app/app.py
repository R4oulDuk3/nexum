#!/usr/bin/env python3
"""
Nexum Mesh Messaging - Flask Application
Web-based messaging system for BATMAN-adv mesh networks
"""

from flask import Flask, render_template, jsonify, request
from flask_marshmallow import Marshmallow
from flasgger import Swagger
from marshmallow import ValidationError
import os
import sqlite3
from datetime import datetime
from pathlib import Path

# Initialize Flask app
# Configure static files to be served from 'assets' directory
app = Flask(__name__, static_folder='assets', static_url_path='/assets')
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'dev-secret-key-change-in-production')
app.config['DATABASE'] = os.path.join(os.path.dirname(__file__), 'data', 'messaging.db')

# Development mode: disable caching for JS/CSS files
@app.after_request
def add_no_cache_headers(response):
    """Add no-cache headers for static assets in development mode"""
    # Check if running in debug/development mode
    is_debug = (
        app.debug or 
        os.environ.get('FLASK_ENV') == 'development' or 
        os.environ.get('FLASK_DEBUG') == '1' or
        os.environ.get('FLASK_DEBUG') == 'True'
    )
    
    if is_debug:
        # Check if this is a static file request (JS, CSS, or other assets)
        if request.path.startswith('/assets/'):
            # Disable caching for JS, CSS, and other development files
            if any(request.path.endswith(ext) for ext in ['.js', '.css', '.html', '.map']):
                response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
                response.headers['Pragma'] = 'no-cache'
                response.headers['Expires'] = '0'
    return response

# Initialize Marshmallow
ma = Marshmallow(app)

# Configure Swagger/OpenAPI with Marshmallow support
app.config['SWAGGER'] = {
    'title': 'Nexum Mesh API',
    'uiversion': 3,
    'openapi': '3.0.0',
    'version': '1.0.0',
    'description': 'API for Nexum Mesh Network - Disaster Relief Communication System',
    'specs': [
        {
            'endpoint': 'apispec',
            'route': '/apispec.json',
            'rule_filter': lambda rule: True,
            'model_filter': lambda tag: True,
        }
    ],
    'static_url_path': '/flasgger_static',
    'swagger_ui': True,
    'specs_route': '/apidocs',
    'tags': [
        {
            'name': 'locations',
            'description': 'Location tracking and queries'
        },
        {
            'name': 'health',
            'description': 'Health check endpoints'
        },
        {
            'name': 'sync',
            'description': 'Mesh node synchronization endpoints'
        },
        {
            'name': 'tiles',
            'description': 'MBTiles map tile serving'
        }
    ]
}

# Register blueprints FIRST (before Swagger initialization)
from routes.location_routes import location_bp, _apispec
from routes.sync_routes import sync_bp
app.register_blueprint(location_bp)
app.register_blueprint(sync_bp)

# Register Raster Tiles blueprint (PNG/JPEG)
from routes.raster_tiles_routes import raster_tiles_bp
app.register_blueprint(raster_tiles_bp)

# Register Vector Tiles blueprint (PBF/MVT)
from routes.vector_tiles_routes import vector_tiles_bp
app.register_blueprint(vector_tiles_bp)

# Get schema components from APISpec
# This registers all Marshmallow schemas with Swagger automatically
try:
    apispec_dict = _apispec.to_dict()
    schema_components = apispec_dict.get('components', {}).get('schemas', {})
except Exception as e:
    print(f"Warning: Could not extract schemas from APISpec: {e}")
    schema_components = {}

# Configure Swagger with registered schemas from APISpec
swagger_template = {
    'swagger': '3.0',
    'info': {
        'title': 'Nexum Mesh API',
        'version': '1.0.0',
        'description': 'API for Nexum Mesh Network - Disaster Relief Communication System'
    }
}

# Add components if we have schemas
if schema_components:
    swagger_template['components'] = {
        'schemas': schema_components
    }

swagger = Swagger(app, template=swagger_template)

# Ensure data directory exists
DATA_DIR = os.path.join(os.path.dirname(__file__), 'data')
os.makedirs(DATA_DIR, exist_ok=True)


def get_db():
    """Get database connection"""
    conn = sqlite3.connect(app.config['DATABASE'])
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    """Initialize database with schema"""
    conn = get_db()
    cursor = conn.cursor()
    
    # Create migrations tracking table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS migrations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            filename TEXT UNIQUE NOT NULL,
            applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # Run migrations
    migrations_dir = Path(__file__).parent / 'migrations'
    migrations_dir.mkdir(exist_ok=True)
    
    # Get all migration files sorted
    migration_files = sorted(migrations_dir.glob('*.sql'))
    
    for migration_file in migration_files:
        filename = migration_file.name
        
        # Check if migration already applied
        cursor.execute('SELECT id FROM migrations WHERE filename = ?', (filename,))
        if cursor.fetchone():
            continue  # Skip already applied migrations
        
        # Apply migration
        try:
            with open(migration_file, 'r') as f:
                sql = f.read()
                cursor.executescript(sql)
            
            # Record migration
            cursor.execute('INSERT INTO migrations (filename) VALUES (?)', (filename,))
            print(f"Applied migration: {filename}")
        except Exception as e:
            print(f"Error applying migration {filename}: {e}")
            raise
    
    conn.commit()
    conn.close()


@app.route('/')
def index():
    """Main dashboard"""
    return render_template('dashboard.html')


@app.route('/settings')
def settings():
    """Settings/Configuration page"""
    return render_template('settings.html')


@app.route('/test/location')
def test_location():
    """Location service test page"""
    return render_template('location_test.html')

@app.route('/test/map')
def test_map():
    """MapLibre GL JS test page"""
    return render_template('map_test.html')

@app.route('/test/map-marker')
def test_map_marker():
    """Map marker test page - minimal test for marker positioning"""
    return render_template('map_marker_test.html')

@app.route('/sync')
def sync_page():
    """Location sync management page"""
    return render_template('sync_page.html')


@app.route('/api/health')
def health():
    """
    Health check endpoint
    ---
    tags:
      - health
    responses:
      200:
        description: Service health status
        content:
          application/json:
            schema:
              type: object
              properties:
                status:
                  type: string
                  example: healthy
                timestamp:
                  type: string
                  format: date-time
    """
    return jsonify({
        'status': 'healthy',
        'timestamp': datetime.now().isoformat()
    })


@app.route('/api/demo')
def demo_data():
    """Demo endpoint to test database"""
    conn = get_db()
    cursor = conn.cursor()
    
    try:
        cursor.execute("SELECT * FROM demo_table ORDER BY id DESC LIMIT 10")
        rows = cursor.fetchall()
        data = [dict(row) for row in rows]
        return jsonify({'data': data})
    except sqlite3.OperationalError:
        return jsonify({'error': 'Demo table not found. Run migrations first.'}), 404
    finally:
        conn.close()


if __name__ == '__main__':
    # Initialize database on first run
    init_db()
    
    # Get host and port from environment or use defaults
    host = os.environ.get('HOST', '0.0.0.0')
    port = int(os.environ.get('PORT', 5000))
    
    print(f"Starting Nexum Mesh Messaging on {host}:{port}")
    print(f"Database: {app.config['DATABASE']}")
    
    app.run(host=host, port=port, debug=True)

