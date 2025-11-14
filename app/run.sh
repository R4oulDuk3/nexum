#!/bin/bash
# Run script for Nexum Mesh Messaging

# Activate virtual environment if it exists
if [ -d "venv" ]; then
    source venv/bin/activate
fi

# Run the Flask app
python3 app.py

