#!/bin/bash
# Setup script for Nexum Mesh Messaging

set -e

echo "Setting up Nexum Mesh Messaging..."

# Check if Python 3 is installed
if ! command -v python3 &> /dev/null; then
    echo "Error: Python 3 is not installed"
    exit 1
fi

# Create virtual environment (optional but recommended)
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

