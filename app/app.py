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
import socket
import platform
import subprocess
from datetime import datetime
from pathlib import Path

# Try to import netifaces, fallback to subprocess if not available
try:
    import netifaces
    NETIFACES_AVAILABLE = True
except ImportError:
    NETIFACES_AVAILABLE = False

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
from routes.scenario_routes import scenario_bp
app.register_blueprint(location_bp)
app.register_blueprint(sync_bp)
app.register_blueprint(scenario_bp)

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


def get_interface_ip(interface_name):
    """Get the IPv4 address of a network interface"""
    if NETIFACES_AVAILABLE:
        try:
            if interface_name in netifaces.interfaces():
                addrs = netifaces.ifaddresses(interface_name)
                if netifaces.AF_INET in addrs:
                    ip_info = addrs[netifaces.AF_INET][0]
                    return ip_info.get('addr')
        except Exception:
            pass
    else:
        # Fallback: use ip command
        try:
            result = subprocess.run(
                ['ip', 'addr', 'show', interface_name],
                capture_output=True,
                text=True,
                timeout=2
            )
            if result.returncode == 0:
                for line in result.stdout.split('\n'):
                    if 'inet ' in line and '127.' not in line:
                        # Extract IP from line like "    inet 192.168.1.1/24 ..."
                        parts = line.strip().split()
                        if len(parts) >= 2:
                            ip = parts[1].split('/')[0]
                            return ip
        except Exception:
            pass
    return None


def get_access_point_ip():
    """Get the IP address of the access point interface (wlan1 or bridge)"""
    # Mesh interfaces that should NOT be used for AP access
    mesh_interfaces = {'wlan0', 'wlan1', 'bat0', 'lo'}
    
    # Try to find the AP IP address in this order:
    # 1. br-ap (bridge interface for AP - this is what clients should use)
    # 2. Other bridge interfaces (br0, br1, etc.)
    # 3. wlan1 (AP interface, but may not have IP if bridged)
    # 4. Other wlan interfaces that aren't wlan0 (the mesh interface)
    
    # Priority order for AP interfaces
    ap_priority_interfaces = ['br-ap', 'br0', 'br1', 'wlan1']
    
    for iface in ap_priority_interfaces:
        ip = get_interface_ip(iface)
        if ip:
            return ip, iface
    
    # Check all interfaces for bridge or AP-like names (excluding mesh interfaces)
    if NETIFACES_AVAILABLE:
        try:
            # First, check bridge interfaces
            for iface in netifaces.interfaces():
                if iface.startswith('br-') and iface not in mesh_interfaces:
                    ip = get_interface_ip(iface)
                    if ip:
                        return ip, iface
            
            # Then check other AP-like interfaces (but exclude wlan0 which is mesh)
            for iface in netifaces.interfaces():
                if (iface.startswith('br') or 
                    (iface.startswith('wlan') and iface != 'wlan0') or
                    iface.startswith('ap')):
                    if iface not in mesh_interfaces:
                        ip = get_interface_ip(iface)
                        if ip:
                            return ip, iface
        except Exception:
            pass
    else:
        # Fallback: use ip command to list all interfaces
        try:
            result = subprocess.run(
                ['ip', 'link', 'show'],
                capture_output=True,
                text=True,
                timeout=2
            )
            if result.returncode == 0:
                # First pass: find bridge interfaces
                for line in result.stdout.split('\n'):
                    if ': ' in line:
                        parts = line.split(':')
                        if len(parts) >= 2:
                            iface = parts[1].strip().split('@')[0]
                            if iface.startswith('br-') and iface not in mesh_interfaces:
                                ip = get_interface_ip(iface)
                                if ip:
                                    return ip, iface
                
                # Second pass: find other AP interfaces (but exclude wlan0)
                for line in result.stdout.split('\n'):
                    if ': ' in line:
                        parts = line.split(':')
                        if len(parts) >= 2:
                            iface = parts[1].strip().split('@')[0]
                            if ((iface.startswith('br') or 
                                 (iface.startswith('wlan') and iface != 'wlan0') or
                                 iface.startswith('ap')) and 
                                iface not in mesh_interfaces):
                                ip = get_interface_ip(iface)
                                if ip:
                                    return ip, iface
        except Exception:
            pass
    
    # Last resort fallback: get the first non-loopback IPv4 address (excluding mesh)
    # but only if no AP interface was found
    if NETIFACES_AVAILABLE:
        try:
            for iface in netifaces.interfaces():
                if iface in mesh_interfaces:
                    continue
                ip = get_interface_ip(iface)
                if ip and not ip.startswith('127.'):
                    return ip, iface
        except Exception:
            pass
    else:
        # Use ip addr show to find first non-loopback IP (excluding mesh interfaces)
        try:
            result = subprocess.run(
                ['ip', 'addr', 'show'],
                capture_output=True,
                text=True,
                timeout=2
            )
            if result.returncode == 0:
                current_iface = None
                for line in result.stdout.split('\n'):
                    if ': ' in line and not line.startswith(' '):
                        # Extract interface name
                        parts = line.split(':')
                        if len(parts) >= 2:
                            current_iface = parts[1].strip().split('@')[0]
                    elif 'inet ' in line and current_iface and '127.' not in line:
                        if current_iface not in mesh_interfaces:
                            parts = line.strip().split()
                            if len(parts) >= 2:
                                ip = parts[1].split('/')[0]
                                return ip, current_iface
        except Exception:
            pass
    
    return None, None


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


@app.route('/api/network')
def network_info():
    """
    Get network information for accessing the app
    ---
    tags:
      - health
    responses:
      200:
        description: Network access information
        content:
          application/json:
            schema:
              type: object
              properties:
                access_point_ip:
                  type: string
                  nullable: true
                  example: "169.254.1.1"
                access_point_interface:
                  type: string
                  nullable: true
                  example: "br-ap"
                port:
                  type: integer
                  example: 5000
                access_url:
                  type: string
                  nullable: true
                  example: "http://169.254.1.1:5000"
    """
    ap_ip, ap_interface = get_access_point_ip()
    port = int(os.environ.get('PORT', 5000))
    
    return jsonify({
        'access_point_ip': ap_ip,
        'access_point_interface': ap_interface,
        'port': port,
        'access_url': f'http://{ap_ip}:{port}' if ap_ip else None
    })


if __name__ == '__main__':
    # Initialize database on first run
    init_db()
    
    # Get host and port from environment or use defaults
    host = os.environ.get('HOST', '0.0.0.0')
    port = int(os.environ.get('PORT', 5000))
    
    print(f"Starting Nexum Mesh Messaging on {host}:{port}")
    print(f"Database: {app.config['DATABASE']}")
    
    # Try to get the access point IP address for WiFi access
    ap_ip, ap_interface = get_access_point_ip()
    if ap_ip:
        print(f"\n{'='*60}")
        print(f"Network Access Information:")
        print(f"  Interface: {ap_interface}")
        print(f"  IP Address: {ap_ip}")
        print(f"  Access from your phone: http://{ap_ip}:{port}")
        print(f"  Local access: http://localhost:{port}")
        print(f"{'='*60}\n")
    else:
        print(f"\n{'='*60}")
        print(f"Network Access Information:")
        print(f"  Could not detect access point IP address")
        print(f"  Local access: http://localhost:{port}")
        print(f"  To find your IP, run: ip addr show")
        print(f"{'='*60}\n")
    
    # Start background sync scheduler
    from services.sync_scheduler import get_sync_scheduler
    sync_scheduler = get_sync_scheduler()
    sync_scheduler.start()
    
    print(f"Sync Scheduler Status:")
    status = sync_scheduler.get_status()
    print(f"  Enabled: {status['enabled']}")
    print(f"  Interval: {status['interval_seconds']} seconds")
    print(f"  Running: {status['running']}")
    print()
    
    try:
        app.run(host=host, port=port, debug=True)
    finally:
        # Stop scheduler when Flask shuts down
        sync_scheduler.stop()

