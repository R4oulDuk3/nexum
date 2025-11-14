# Setup script for Nexum Mesh Messaging (PowerShell)
# Run with: .\setup.ps1

$ErrorActionPreference = "Stop"

Write-Host "Setting up Nexum Mesh Messaging..." -ForegroundColor Cyan

# Check if Python is installed
try {
    $pythonVersion = python --version 2>&1
    Write-Host "Found Python: $pythonVersion" -ForegroundColor Green
} catch {
    Write-Host "Error: Python is not installed or not in PATH" -ForegroundColor Red
    Write-Host "Please install Python 3 from https://www.python.org/downloads/" -ForegroundColor Yellow
    exit 1
}

# Check Python version (should be 3.x)
$version = python --version 2>&1
if ($version -notmatch "Python 3\.") {
    Write-Host "Warning: Python 3.x is recommended" -ForegroundColor Yellow
}

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

# Create data directory
if (-not (Test-Path "data")) {
    Write-Host "Creating data directory..." -ForegroundColor Cyan
    New-Item -ItemType Directory -Path "data" | Out-Null
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

