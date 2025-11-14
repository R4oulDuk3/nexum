# Generate JavaScript and Python clients from OpenAPI specification
$API_URL = if ($env:API_URL) { $env:API_URL } else { "http://localhost:5000/apispec.json" }
$JS_OUTPUT_DIR = if ($env:JS_OUTPUT_DIR) { $env:JS_OUTPUT_DIR } else { "assets\api-client" }
$PYTHON_OUTPUT_DIR = if ($env:PYTHON_OUTPUT_DIR) { $env:PYTHON_OUTPUT_DIR } else { "server-api" }
$CLIENT_NAME = if ($env:CLIENT_NAME) { $env:CLIENT_NAME } else { "nexum-api-client" }
$DOCKER_IMAGE = if ($env:DOCKER_IMAGE) { $env:DOCKER_IMAGE } else { "openapitools/openapi-generator-cli:v7.2.0" }
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

New-Item -ItemType Directory -Path $JS_OUTPUT_DIR -Force | Out-Null
New-Item -ItemType Directory -Path $PYTHON_OUTPUT_DIR -Force | Out-Null

$currentDir = (Get-Location).Path
$jsOutputDirUnix = $JS_OUTPUT_DIR -replace '\\', '/'
$pythonOutputDirUnix = $PYTHON_OUTPUT_DIR -replace '\\', '/'

docker run --rm `
    -v "${currentDir}:/local" `
    -w /local `
    $DOCKER_IMAGE generate `
    -i "/local/$OPENAPI_SPEC" `
    -g python `
    -o "/local/$pythonOutputDirUnix" `
    --additional-properties="packageName=$CLIENT_NAME,packageVersion=1.0.0" `
    --skip-validate-spec

if ($LASTEXITCODE -ne 0) {
    Write-Host "Error: Python client generation failed"
    exit 1
}

Remove-Item $OPENAPI_SPEC -Force
Write-Host "JavaScript client generated in $JS_OUTPUT_DIR"
Write-Host "Python client generated in $PYTHON_OUTPUT_DIR"
