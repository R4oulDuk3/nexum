# Production run script for Nexum Mesh Messaging (PowerShell)
# Run with: .\run-production.ps1
#
# Environment variables:
#   HOST - Host to bind to (default: 0.0.0.0)
#   PORT - Port to bind to (default: 5000)
#   WORKERS - Number of worker threads (default: 4)
#   SYNC_ENABLED - Enable sync scheduler (default: true)
#   SYNC_INTERVAL_SECONDS - Sync interval in seconds (default: 10)
#   FLASK_ENV - Flask environment (default: production)

# Set production environment (if not already set)
if (-not $env:FLASK_ENV) {
    $env:FLASK_ENV = "production"
}

# Set defaults if not provided
if (-not $env:HOST) { $env:HOST = "0.0.0.0" }
if (-not $env:PORT) { $env:PORT = "5000" }
if (-not $env:WORKERS) { $env:WORKERS = "4" }

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Nexum Mesh Messaging - Production Mode" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Host: $env:HOST" -ForegroundColor Yellow
Write-Host "Port: $env:PORT" -ForegroundColor Yellow
Write-Host "Workers: $env:WORKERS" -ForegroundColor Yellow
Write-Host "Environment: $env:FLASK_ENV" -ForegroundColor Yellow
Write-Host ""

# Activate virtual environment if it exists
if (Test-Path "venv\Scripts\Activate.ps1") {
    Write-Host "Activating virtual environment..." -ForegroundColor Cyan
    & ".\venv\Scripts\Activate.ps1"
} else {
    Write-Host "No virtual environment found. Using system Python." -ForegroundColor Yellow
}

# Check if waitress is installed
Write-Host "Checking for Waitress..." -ForegroundColor Cyan
try {
    python -c "import waitress" 2>$null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Waitress not found. Installing..." -ForegroundColor Yellow
        pip install waitress>=2.1.2
    }
} catch {
    Write-Host "Installing Waitress..." -ForegroundColor Yellow
    pip install waitress>=2.1.2
}

Write-Host ""
Write-Host "Starting production server with Waitress..." -ForegroundColor Green
Write-Host ""

# Run the production Python script
python run_production.py

