#!/bin/bash
# Setup script for Nexum Mesh Messaging

set -e

echo "Setting up Nexum Mesh Messaging..."


# --- 1. Check/Install System Dependencies ---
# This section now attempts to install missing packages.
echo "Checking and installing system dependencies (python3, pip, venv)..."
apt update
apt install -y python3 python3-pip python3-venv

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

# Create data directory
mkdir -p data

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

