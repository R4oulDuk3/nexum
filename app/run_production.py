#!/usr/bin/env python3
"""
Production server runner for Nexum Mesh Messaging
Uses Waitress WSGI server for production deployment
"""

import os
import sys
from pathlib import Path

# Add app directory to path
sys.path.insert(0, str(Path(__file__).parent.resolve()))

from waitress import serve
from app import app

if __name__ == '__main__':
    # Get configuration from environment or use defaults
    host = os.environ.get('HOST', '0.0.0.0')
    port = int(os.environ.get('PORT', 5000))
    workers = int(os.environ.get('WORKERS', 4))
    
    # Set Flask environment if not already set
    if 'FLASK_ENV' not in os.environ:
        os.environ['FLASK_ENV'] = 'production'
    
    print('=' * 50)
    print('Nexum Mesh Messaging - Production Mode')
    print('=' * 50)
    print(f'Host: {host}')
    print(f'Port: {port}')
    print(f'Workers: {workers}')
    print(f'Environment: {os.environ.get("FLASK_ENV", "production")}')
    print('')
    print('Starting Waitress WSGI server...')
    print(f'Server will be available at http://{host}:{port}')
    print('Press Ctrl+C to stop the server')
    print('')
    
    serve(
        app,
        host=host,
        port=port,
        threads=workers,
        channel_timeout=120,
        cleanup_interval=30,
        asyncore_use_poll=True
    )

