#!/bin/bash
# Generate JavaScript and Python clients from OpenAPI specification
# This script downloads the OpenAPI spec and generates clients using Docker
# No Java or Node.js required - runs entirely in Docker!

set -e

# Configuration
API_URL="${API_URL:-http://localhost:5000/apispec.json}"
JS_OUTPUT_DIR="${JS_OUTPUT_DIR:-assets/api-client}"
PYTHON_OUTPUT_DIR="${PYTHON_OUTPUT_DIR:-server-api}"
CLIENT_NAME="${CLIENT_NAME:-nexum-api-client}"
DOCKER_IMAGE="${DOCKER_IMAGE:-openapitools/openapi-generator-cli:v7.2.0}"

echo "🔧 Generating JavaScript and Python clients from OpenAPI spec using Docker..."
echo "API URL: $API_URL"
echo "JavaScript output directory: $JS_OUTPUT_DIR"
echo "Python output directory: $PYTHON_OUTPUT_DIR"
echo "Docker image: $DOCKER_IMAGE"

# Check if Docker is available
if ! command -v docker &> /dev/null; then
    echo "❌ Error: Docker is not installed or not in PATH"
    echo "   Please install Docker: https://docs.docker.com/get-docker/"
    exit 1
fi

# Check if Docker daemon is running
if ! docker info &> /dev/null; then
    echo "❌ Error: Docker daemon is not running"
    echo "   Please start Docker and try again"
    exit 1
fi

# Create output directories
mkdir -p "$JS_OUTPUT_DIR"
mkdir -p "$PYTHON_OUTPUT_DIR"

# Download OpenAPI spec
echo "📥 Downloading OpenAPI specification..."
OPENAPI_SPEC="openapi.json"
curl -s "$API_URL" -o "$OPENAPI_SPEC" || {
    echo "❌ Error: Could not download OpenAPI spec from $API_URL"
    echo "   Make sure your Flask server is running!"
    exit 1
}

echo "✅ OpenAPI spec downloaded"

# Generate JavaScript client using Docker
echo "⚙️  Generating JavaScript client with Docker..."
docker run --rm \
    -v "$(pwd):/local" \
    -w /local \
    "$DOCKER_IMAGE" generate \
    -i "/local/$OPENAPI_SPEC" \
    -g javascript \
    -o "/local/$JS_OUTPUT_DIR" \
    --additional-properties=projectName="$CLIENT_NAME",usePromises=true,useES6=true

# Copy the main API file to assets for easy import
echo "📋 Copying JavaScript client files for browser use..."
if [ -f "$JS_OUTPUT_DIR/src/index.js" ]; then
    cp "$JS_OUTPUT_DIR/src/index.js" "$JS_OUTPUT_DIR/api-client.js"
    echo "✅ Created api-client.js for browser import"
fi

echo "✅ JavaScript client generated successfully!"

# Generate Python client using Docker
echo ""
echo "⚙️  Generating Python client with Docker..."
docker run --rm \
    -v "$(pwd):/local" \
    -w /local \
    "$DOCKER_IMAGE" generate \
    -i "/local/$OPENAPI_SPEC" \
    -g python \
    -o "/local/$PYTHON_OUTPUT_DIR" \
    --additional-properties=packageName="$CLIENT_NAME",packageVersion=1.0.0

echo "✅ Python client generated successfully!"

# Clean up downloaded spec
rm -f "$OPENAPI_SPEC"

echo ""
echo "✅ All clients generated successfully!"
echo ""
echo "📁 JavaScript client: $JS_OUTPUT_DIR"
echo "To use in your HTML:"
echo "  <script src='/assets/api-client/src/index.js'></script>"
echo ""
echo "Or use ES6 modules:"
echo "  import { LocationsApi } from '/assets/api-client/src/index.js';"
echo ""
echo "📁 Python client: $PYTHON_OUTPUT_DIR"
echo "To use in Python:"
echo "  from $CLIENT_NAME import ApiClient, LocationsApi"

