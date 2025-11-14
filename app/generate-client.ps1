# Generate JavaScript client from OpenAPI specification
# Generate JavaScript and Python clients from OpenAPI specification
# PowerShell script for Windows
# This script downloads the OpenAPI spec and generates clients using Docker
# No Java or Node.js required - runs entirely in Docker!

$API_URL = if ($env:API_URL) { $env:API_URL } else { "http://localhost:5000/apispec.json" }
$JS_OUTPUT_DIR = if ($env:JS_OUTPUT_DIR) { $env:JS_OUTPUT_DIR } else { "assets\api-client" }
$PYTHON_OUTPUT_DIR = if ($env:PYTHON_OUTPUT_DIR) { $env:PYTHON_OUTPUT_DIR } else { "server-api" }
$CLIENT_NAME = if ($env:CLIENT_NAME) { $env:CLIENT_NAME } else { "nexum-api-client" }
$DOCKER_IMAGE = if ($env:DOCKER_IMAGE) { $env:DOCKER_IMAGE } else { "openapitools/openapi-generator-cli:v7.2.0" }

Write-Host "🔧 Generating JavaScript and Python clients from OpenAPI spec using Docker..." -ForegroundColor Cyan
Write-Host "API URL: $API_URL"
Write-Host "JavaScript output directory: $JS_OUTPUT_DIR"
Write-Host "Python output directory: $PYTHON_OUTPUT_DIR"
Write-Host "Docker image: $DOCKER_IMAGE"

# Check if Docker is available
try {
    docker --version | Out-Null
} catch {
    Write-Host "❌ Error: Docker is not installed or not in PATH" -ForegroundColor Red
    Write-Host "   Please install Docker: https://docs.docker.com/get-docker/" -ForegroundColor Yellow
    exit 1
}

# Check if Docker daemon is running
try {
    docker info 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "Docker daemon not running"
    }
} catch {
    Write-Host "❌ Error: Docker daemon is not running" -ForegroundColor Red
    Write-Host "   Please start Docker and try again" -ForegroundColor Yellow
    exit 1
}

# Create output directories
if (!(Test-Path $JS_OUTPUT_DIR)) {
    New-Item -ItemType Directory -Path $JS_OUTPUT_DIR -Force | Out-Null
}
if (!(Test-Path $PYTHON_OUTPUT_DIR)) {
    New-Item -ItemType Directory -Path $PYTHON_OUTPUT_DIR -Force | Out-Null
}

# Download OpenAPI spec
Write-Host "📥 Downloading OpenAPI specification..." -ForegroundColor Cyan
$OPENAPI_SPEC = "openapi.json"

Write-Host "Downloading OpenAPI spec from $API_URL..."

try {
    Invoke-WebRequest -Uri $API_URL -OutFile $OPENAPI_SPEC -ErrorAction Stop
} catch {
    Write-Host "Error: Could not download OpenAPI spec"
    exit 1
}

Write-Host "Generating JavaScript client..."

if (!(Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Host "Error: Docker not found"
    exit 1
}

New-Item -ItemType Directory -Path $OUTPUT_DIR -Force | Out-Null

try {
    $currentDir = (Get-Location).Path
    docker run --rm `
        -v "${currentDir}:/local" `
        -w /local `
        $DOCKER_IMAGE generate `
        -i "/local/$OPENAPI_SPEC" `
        -g javascript `
        -o "/local/$JS_OUTPUT_DIR" `
        --additional-properties="projectName=$CLIENT_NAME,usePromises=true,useES6=true"
    
    if ($LASTEXITCODE -ne 0) {
        throw "Docker command failed with exit code $LASTEXITCODE"
    }
    
    # Copy the main API file to assets for easy import
    Write-Host "📋 Copying JavaScript client files for browser use..." -ForegroundColor Cyan
    $indexFile = Join-Path $JS_OUTPUT_DIR "src\index.js"
    if (Test-Path $indexFile) {
        $clientFile = Join-Path $JS_OUTPUT_DIR "api-client.js"
        Copy-Item $indexFile $clientFile -Force
        Write-Host "✅ Created api-client.js for browser import" -ForegroundColor Green
    }
    
    Write-Host "✅ JavaScript client generated successfully!" -ForegroundColor Green
} catch {
    Write-Host "❌ Error generating JavaScript client: $_" -ForegroundColor Red
    exit 1
}

# Generate Python client using Docker
Write-Host ""
Write-Host "⚙️  Generating Python client with Docker..." -ForegroundColor Cyan

try {
    $currentDir = (Get-Location).Path
    docker run --rm `
        -v "${currentDir}:/local" `
        -w /local `
        $DOCKER_IMAGE generate `
        -i "/local/$OPENAPI_SPEC" `
        -g python `
        -o "/local/$PYTHON_OUTPUT_DIR" `
        --additional-properties="packageName=$CLIENT_NAME,packageVersion=1.0.0"
    
    if ($LASTEXITCODE -ne 0) {
        throw "Docker command failed with exit code $LASTEXITCODE"
    }
    
    Write-Host "✅ Python client generated successfully!" -ForegroundColor Green
} catch {
    Write-Host "❌ Error generating Python client: $_" -ForegroundColor Red
    exit 1
}

# Clean up downloaded spec
if (Test-Path $OPENAPI_SPEC) {
    Remove-Item $OPENAPI_SPEC -Force
}

Write-Host ""
Write-Host "✅ All clients generated successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "📁 JavaScript client: $JS_OUTPUT_DIR" -ForegroundColor Cyan
Write-Host "To use in your HTML:" -ForegroundColor Yellow
Write-Host "  <script src='/assets/api-client/src/index.js'></script>"
Write-Host ""
Write-Host "Or use ES6 modules:" -ForegroundColor Yellow
Write-Host "  import { LocationsApi } from '/assets/api-client/src/index.js';"
Write-Host ""
Write-Host "📁 Python client: $PYTHON_OUTPUT_DIR" -ForegroundColor Cyan
Write-Host "To use in Python:" -ForegroundColor Yellow
Write-Host "  from $CLIENT_NAME import ApiClient, LocationsApi"

Remove-Item $OPENAPI_SPEC -Force
Write-Host "Client generated in $OUTPUT_DIR"
