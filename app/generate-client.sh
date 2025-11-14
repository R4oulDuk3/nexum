#!/bin/bash
# Generate JavaScript client from OpenAPI specification
# This script downloads the OpenAPI spec and generates a JavaScript client

set -e

# Configuration
API_URL="${API_URL:-http://localhost:5000/apispec.json}"
OUTPUT_DIR="${OUTPUT_DIR:-assets/api-client}"
CLIENT_NAME="${CLIENT_NAME:-nexum-api-client}"

echo "🔧 Generating JavaScript client from OpenAPI spec..."
echo "API URL: $API_URL"
echo "Output directory: $OUTPUT_DIR"

# Create output directory
mkdir -p "$OUTPUT_DIR"

# Check if openapi-generator-cli is available
if ! command -v openapi-generator-cli &> /dev/null && ! npx --yes @openapitools/openapi-generator-cli version &> /dev/null; then
    echo "📦 Installing openapi-generator-cli..."
    npx --yes @openapitools/openapi-generator-cli version
fi

# Download OpenAPI spec
echo "📥 Downloading OpenAPI specification..."
OPENAPI_SPEC="openapi.json"
curl -s "$API_URL" -o "$OPENAPI_SPEC" || {
    echo "❌ Error: Could not download OpenAPI spec from $API_URL"
    echo "   Make sure your Flask server is running!"
    exit 1
}

echo "✅ OpenAPI spec downloaded"

# Generate JavaScript client
echo "⚙️  Generating JavaScript client..."
if command -v openapi-generator-cli &> /dev/null; then
    openapi-generator-cli generate \
        -i "$OPENAPI_SPEC" \
        -g javascript \
        -o "$OUTPUT_DIR" \
        --additional-properties=projectName="$CLIENT_NAME",usePromises=true,useES6=true
else
    npx --yes @openapitools/openapi-generator-cli generate \
        -i "$OPENAPI_SPEC" \
        -g javascript \
        -o "$OUTPUT_DIR" \
        --additional-properties=projectName="$CLIENT_NAME",usePromises=true,useES6=true
fi

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

