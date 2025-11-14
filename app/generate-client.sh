#!/bin/bash
# Generate JavaScript client from OpenAPI specification
# This script downloads the OpenAPI spec and generates a JavaScript client using Docker
# No Java or Node.js required - runs entirely in Docker!

set -e

# Configuration
API_URL="${API_URL:-http://localhost:5000/apispec.json}"
OUTPUT_DIR="${OUTPUT_DIR:-assets/api-client}"
CLIENT_NAME="${CLIENT_NAME:-nexum-api-client}"
DOCKER_IMAGE="${DOCKER_IMAGE:-openapitools/openapi-generator-cli:v7.2.0}"

echo "🔧 Generating JavaScript client from OpenAPI spec using Docker..."
echo "API URL: $API_URL"
echo "Output directory: $OUTPUT_DIR"
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

# Create output directory
mkdir -p "$OUTPUT_DIR"

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
    -o "/local/$OUTPUT_DIR" \
    --additional-properties=projectName="$CLIENT_NAME",usePromises=true,useES6=true

# Copy the main API file to assets for easy import
echo "📋 Copying client files for browser use..."
if [ -f "$OUTPUT_DIR/src/index.js" ]; then
    cp "$OUTPUT_DIR/src/index.js" "$OUTPUT_DIR/api-client.js"
    echo "✅ Created api-client.js for browser import"
fi

# Clean up downloaded spec
rm -f "$OPENAPI_SPEC"

echo ""
echo "✅ JavaScript client generated successfully!"
echo "📁 Output directory: $OUTPUT_DIR"
echo ""
echo "To use the client in your HTML:"
echo "  <script src='/assets/api-client/src/index.js'></script>"
echo ""
echo "Or use ES6 modules:"
echo "  import { LocationsApi } from '/assets/api-client/src/index.js';"

