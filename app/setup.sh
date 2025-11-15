#!/bin/bash
# Setup script for Nexum Mesh Messaging

set -e

echo "Setting up Nexum Mesh Messaging..."


# --- 1. Check/Install System Dependencies ---
# This section now attempts to install missing packages.
echo "Checking and installing system dependencies (python3, pip, venv, nodejs, npm)..."
apt update
apt install -y python3 python3-pip python3-venv nodejs npm

echo "All system dependencies are installed."

# --- 2. Create Virtual Environment ---
# We create the venv as root, which is fine since the service will run as root
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
fi

# Activate virtual environment
source venv/bin/activate

# Install dependencies
echo "Installing dependencies..."
pip install --upgrade pip
pip install -r requirements.txt

# Ensure requests is installed (required for sync service)
echo "Ensuring requests library is installed..."
pip install "requests>=2.31.0"

# Create data directory
mkdir -p data

# Build API client if needed
if [ ! -d "assets/api-client/dist" ]; then
    echo "Building API client..."
    cd assets/api-client
    npm install
    npm run build
    cd ../..
fi

# Make run script executable
chmod +x run.sh

echo ""
echo "Setup complete!"
echo ""
echo "To run the application:"
echo "  ./run.sh"
echo ""
echo "Or directly:"
echo "  python3 app.py"
echo ""

