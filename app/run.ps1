# Run script for Nexum Mesh Messaging (PowerShell)
# Run with: .\run.ps1

# Activate virtual environment if it exists
if (Test-Path "venv\Scripts\Activate.ps1") {
    Write-Host "Activating virtual environment..." -ForegroundColor Cyan
    & ".\venv\Scripts\Activate.ps1"
} else {
    Write-Host "No virtual environment found. Using system Python." -ForegroundColor Yellow
}

# Run the Flask app
Write-Host "Starting Nexum Mesh Messaging..." -ForegroundColor Cyan
Write-Host ""
python app.py

