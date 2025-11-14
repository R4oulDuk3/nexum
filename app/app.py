#!/usr/bin/env python3
"""
Nexum Mesh Messaging - Flask Application
Web-based messaging system for BATMAN-adv mesh networks
"""

from flask import Flask, render_template, jsonify, request
import os
import sqlite3
from datetime import datetime
from pathlib import Path

# Initialize Flask app
# Configure static files to be served from 'assets' directory
app = Flask(__name__, static_folder='assets', static_url_path='/assets')
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'dev-secret-key-change-in-production')
app.config['DATABASE'] = os.path.join(os.path.dirname(__file__), 'data', 'messaging.db')

# Register blueprints
from routes.location_routes import location_bp
app.register_blueprint(location_bp)

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


@app.route('/test/location')
def test_location():
    """Location service test page"""
    return render_template('location_test.html')


@app.route('/api/health')
def health():
    """Health check endpoint"""
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

