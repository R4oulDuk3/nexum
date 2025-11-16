#!/usr/bin/env python3
"""
Production server runner for Nexum Mesh Messaging
Uses Waitress WSGI server for production deployment
Automatically enables HTTPS if SSL certificate files are present
"""

import os
import sys
import ssl
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
    
    # Check for SSL certificate files in the app directory
    app_dir = Path(__file__).parent.resolve()
    cert_file = app_dir / 'cert.pem'
    key_file = app_dir / 'key.pem'
    
    # Check if HTTPS is explicitly enabled/disabled via environment variable
    https_env = os.environ.get('HTTPS', '').lower()
    if https_env == 'true' or https_env == '1' or https_env == 'yes':
        use_https = True
    elif https_env == 'false' or https_env == '0' or https_env == 'no':
        use_https = False
    else:
        # Auto-detect: Use HTTPS if certificate files exist
        use_https = cert_file.exists() and key_file.exists()
    
    print('=' * 50)
    print('Nexum Mesh Messaging - Production Mode')
    print('=' * 50)
    print(f'Host: {host}')
    print(f'Port: {port}')
    print(f'Workers: {workers}')
    print(f'Environment: {os.environ.get("FLASK_ENV", "production")}')
    print(f'HTTPS: {"Enabled" if use_https else "Disabled"}')
    
    if use_https:
        if not cert_file.exists() or not key_file.exists():
            print('')
            print('❌ ERROR: HTTPS enabled but certificate files not found!')
            print(f'   Expected: {cert_file}')
            print(f'   Expected: {key_file}')
            print('   To generate certificates:')
            print('     openssl req -x509 -newkey rsa:4096 -nodes -out cert.pem -keyout key.pem -days 365 -subj "/CN=nexum"')
            print('')
            print('Falling back to HTTP...')
            use_https = False
        else:
            print(f'Certificate: {cert_file}')
            print(f'Private Key: {key_file}')
            if https_env:
                print(f'HTTPS mode: Explicitly set to {https_env}')
            else:
                print('HTTPS mode: Auto-detected (certificates found)')
            print('')
            print('⚠️  Using self-signed certificate')
            print('   Browsers will show a security warning on first visit.')
            print('   Users need to click "Advanced" → "Proceed anyway"')
            print('   This is normal for mesh networks without a certificate authority.')
    else:
        print('')
        if https_env == 'false':
            print('ℹ️  HTTPS explicitly disabled (HTTPS=false)')
        else:
            print('ℹ️  HTTPS disabled (cert.pem and key.pem not found)')
        print('   GPS geolocation will not work on HTTP sites.')
        print('   To enable HTTPS:')
        print('     1. Generate certificate:')
        print('        openssl req -x509 -newkey rsa:4096 -nodes -out cert.pem -keyout key.pem -days 365 -subj "/CN=nexum"')
        print('     2. Or set HTTPS=true to force HTTPS mode')
    
    print('')
    print('Starting Waitress WSGI server...')
    
    if use_https:
        print(f'Server will be available at https://{host}:{port}')
        print(f'           (or https://localhost:{port} for local access)')
        
        # Waitress doesn't support SSL directly, so we need to use a workaround
        # We'll use Flask's built-in server with SSL for HTTPS, or use a reverse proxy
        # For simplicity, we'll use Flask's server with SSL when HTTPS is needed
        print('')
        print('Note: Using Flask development server for HTTPS support')
        print('      (Waitress doesn\'t support SSL natively)')
        print('')
        
        # Load SSL context
        try:
            context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
            context.load_cert_chain(str(cert_file), str(key_file))
            
            # Use Flask's built-in server with SSL
            app.run(
                host=host,
                port=port,
                debug=False,
                ssl_context=context,
                threaded=True
            )
        except Exception as e:
            print(f'Error loading SSL certificate: {e}')
            print('Falling back to HTTP...')
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
    else:
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

