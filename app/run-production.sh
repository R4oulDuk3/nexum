#!/bin/bash
# Production run script for Nexum Mesh Messaging
#
# Environment variables:
#   HOST - Host to bind to (default: 0.0.0.0)
#   PORT - Port to bind to (default: 5000)
#   WORKERS - Number of worker threads (default: 4)
#   HTTPS - HTTPS control (default: auto-detect)
#     - HTTPS=true  - Force HTTPS (requires cert.pem and key.pem)
#     - HTTPS=false - Force HTTP (ignore certificates)
#     - HTTPS=""    - Auto-detect (use HTTPS if certificates exist)
#   SYNC_ENABLED - Enable sync scheduler (default: true)
#   SYNC_INTERVAL_SECONDS - Sync interval in seconds (default: 10)
#   FLASK_ENV - Flask environment (default: production)

# Set production environment
export FLASK_ENV="${FLASK_ENV:-production}"

# Get configuration from environment or use defaults
HOST="${HOST:-0.0.0.0}"
PORT="${PORT:-5000}"
WORKERS="${WORKERS:-4}"

# HTTPS control:
#   HTTPS=true  - Force HTTPS (requires cert.pem and key.pem)
#   HTTPS=false - Force HTTP (ignore certificates)
#   HTTPS=""    - Auto-detect (use HTTPS if certificates exist)
# Examples:
#   HTTPS=true  ./run-production.sh
#   HTTPS=false ./run-production.sh
#   ./run-production.sh  # Auto-detect
export HTTPS="${HTTPS:-}"

echo "========================================"
echo "Nexum Mesh Messaging - Production Mode"
echo "========================================"
echo "Host: $HOST"
echo "Port: $PORT"
echo "Workers: $WORKERS"
echo "Environment: $FLASK_ENV"
echo ""

# Activate virtual environment if it exists
if [ -d "venv" ]; then
    echo "Activating virtual environment..."
    source venv/bin/activate
fi

# Check if waitress is installed
echo "Checking for Waitress..."
if ! python3 -c "import waitress" 2>/dev/null; then
    echo "Waitress not found. Installing..."
    pip3 install waitress>=2.1.2
fi

echo ""
echo "Starting production server with Waitress..."
echo ""

# Run the production Python script
python3 run_production.py

