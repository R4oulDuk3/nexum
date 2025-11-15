# Setup script for Nexum Mesh Messaging (PowerShell)
# Run with: .\setup.ps1

$ErrorActionPreference = "Stop"

Write-Host "Setting up Nexum Mesh Messaging..." -ForegroundColor Cyan

# Create virtual environment (optional but recommended)
if (-not (Test-Path "venv")) {
    Write-Host "Creating virtual environment..." -ForegroundColor Cyan
    python -m venv venv
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Error: Failed to create virtual environment" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "Virtual environment already exists" -ForegroundColor Green
}

# Activate virtual environment
Write-Host "Activating virtual environment..." -ForegroundColor Cyan
& ".\venv\Scripts\Activate.ps1"

if ($LASTEXITCODE -ne 0) {
    Write-Host "Warning: Could not activate virtual environment. Continuing anyway..." -ForegroundColor Yellow
}

# Upgrade pip
Write-Host "Upgrading pip..." -ForegroundColor Cyan
python -m pip install --upgrade pip

# Install dependencies
Write-Host "Installing dependencies..." -ForegroundColor Cyan
pip install -r requirements.txt

if ($LASTEXITCODE -ne 0) {
    Write-Host "Error: Failed to install dependencies" -ForegroundColor Red
    exit 1
}

# Ensure requests is installed (required for sync service)
Write-Host "Ensuring requests library is installed..." -ForegroundColor Cyan
pip install "requests>=2.31.0"

if ($LASTEXITCODE -ne 0) {
    Write-Host "Warning: Failed to install requests library" -ForegroundColor Yellow
}

# Ensure flask-marshmallow and marshmallow are installed (required for API schemas)
Write-Host "Ensuring flask-marshmallow and marshmallow libraries are installed..." -ForegroundColor Cyan
pip install "flask-marshmallow>=0.15.0" "marshmallow>=3.20.1"

if ($LASTEXITCODE -ne 0) {
    Write-Host "Warning: Failed to install flask-marshmallow or marshmallow libraries" -ForegroundColor Yellow
}

# Create data directory
if (-not (Test-Path "data")) {
    Write-Host "Creating data directory..." -ForegroundColor Cyan
    New-Item -ItemType Directory -Path "data" | Out-Null
}

# Build API client if needed
if (-not (Test-Path "assets\api-client\dist")) {
    Write-Host "Building API client..." -ForegroundColor Cyan
    
    # Check if Node.js is available
    $nodeAvailable = $false
    try {
        $null = Get-Command node -ErrorAction Stop
        $nodeAvailable = $true
    } catch {
        Write-Host "Warning: Node.js not found. Skipping API client build." -ForegroundColor Yellow
        Write-Host "  Install Node.js from https://nodejs.org/ to build the API client." -ForegroundColor Yellow
    }
    
    if ($nodeAvailable) {
        Push-Location "assets\api-client"
        npm install
        if ($LASTEXITCODE -ne 0) {
            Write-Host "Warning: Failed to install npm dependencies" -ForegroundColor Yellow
        } else {
            npm run build
            if ($LASTEXITCODE -ne 0) {
                Write-Host "Warning: Failed to build API client" -ForegroundColor Yellow
            }
        }
        Pop-Location
    }
}

Write-Host ""
Write-Host "Setup complete!" -ForegroundColor Green
Write-Host ""
Write-Host "To run the application:" -ForegroundColor Cyan
Write-Host "  .\run.ps1" -ForegroundColor Yellow
Write-Host ""
Write-Host "Or directly:" -ForegroundColor Cyan
Write-Host "  python app.py" -ForegroundColor Yellow
Write-Host ""
Write-Host "Note: If you encounter execution policy errors, run:" -ForegroundColor Yellow
Write-Host "  Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser" -ForegroundColor Yellow
Write-Host ""

