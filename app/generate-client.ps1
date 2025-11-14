# Generate JavaScript client from OpenAPI specification
# PowerShell script for Windows

$API_URL = if ($env:API_URL) { $env:API_URL } else { "http://localhost:5000/apispec.json" }
$OUTPUT_DIR = if ($env:OUTPUT_DIR) { $env:OUTPUT_DIR } else { "assets\api-client" }
$CLIENT_NAME = if ($env:CLIENT_NAME) { $env:CLIENT_NAME } else { "nexum-api-client" }

Write-Host "🔧 Generating JavaScript client from OpenAPI spec..." -ForegroundColor Cyan
Write-Host "API URL: $API_URL"
Write-Host "Output directory: $OUTPUT_DIR"

# Create output directory
if (!(Test-Path $OUTPUT_DIR)) {
    New-Item -ItemType Directory -Path $OUTPUT_DIR -Force | Out-Null
}

# Download OpenAPI spec
Write-Host "📥 Downloading OpenAPI specification..." -ForegroundColor Cyan
$OPENAPI_SPEC = "openapi.json"

try {
    Invoke-WebRequest -Uri $API_URL -OutFile $OPENAPI_SPEC -ErrorAction Stop
    Write-Host "✅ OpenAPI spec downloaded" -ForegroundColor Green
} catch {
    Write-Host "❌ Error: Could not download OpenAPI spec from $API_URL" -ForegroundColor Red
    Write-Host "   Make sure your Flask server is running!" -ForegroundColor Yellow
    exit 1
}

# Generate JavaScript client
Write-Host "⚙️  Generating JavaScript client..." -ForegroundColor Cyan

try {
    npx --yes @openapitools/openapi-generator-cli generate `
        -i $OPENAPI_SPEC `
        -g javascript `
        -o $OUTPUT_DIR `
        --additional-properties="projectName=$CLIENT_NAME,usePromises=true,useES6=true"
    
    # Copy the main API file to assets for easy import
    Write-Host "📋 Copying client files for browser use..." -ForegroundColor Cyan
    $indexFile = Join-Path $OUTPUT_DIR "src\index.js"
    if (Test-Path $indexFile) {
        $clientFile = Join-Path $OUTPUT_DIR "api-client.js"
        Copy-Item $indexFile $clientFile -Force
        Write-Host "✅ Created api-client.js for browser import" -ForegroundColor Green
    }
    
    # Clean up downloaded spec
    if (Test-Path $OPENAPI_SPEC) {
        Remove-Item $OPENAPI_SPEC -Force
    }
    
    Write-Host ""
    Write-Host "✅ JavaScript client generated successfully!" -ForegroundColor Green
    Write-Host "📁 Output directory: $OUTPUT_DIR" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "To use the client in your HTML:" -ForegroundColor Yellow
    Write-Host "  <script src='/assets/api-client/src/index.js'></script>"
    Write-Host ""
    Write-Host "Or use ES6 modules:" -ForegroundColor Yellow
    Write-Host "  import { LocationsApi } from '/assets/api-client/src/index.js';"
} catch {
    Write-Host "❌ Error generating client: $_" -ForegroundColor Red
    exit 1
}

