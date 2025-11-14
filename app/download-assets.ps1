# download-assets.ps1
# Download CDN files to assets directory for offline use

param(
    [string]$Url = "",
    [string]$OutputFile = "",
    [string]$AssetsDir = "assets"
)

# Create assets directory if it doesn't exist
if (-not (Test-Path $AssetsDir)) {
    New-Item -ItemType Directory -Path $AssetsDir | Out-Null
    Write-Host "Created directory: $AssetsDir" -ForegroundColor Green
}

# Function to download a file
function Download-File {
    param(
        [string]$Url,
        [string]$OutputPath
    )
    
    try {
        Write-Host "Downloading: $Url" -ForegroundColor Cyan
        Write-Host "Saving to: $OutputPath" -ForegroundColor Gray
        
        $ProgressPreference = 'SilentlyContinue'
        Invoke-WebRequest -Uri $Url -OutFile $OutputPath -ErrorAction Stop
        
        $fileSize = (Get-Item $OutputPath).Length / 1KB
        Write-Host "[OK] Downloaded: $OutputPath ($([math]::Round($fileSize, 2)) KB)" -ForegroundColor Green
        return $true
    }
    catch {
        Write-Host "[ERROR] Failed to download $Url" -ForegroundColor Red
        Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
        return $false
    }
}

# If URL provided, download single file
if ($Url -ne "") {
    if ($OutputFile -eq "") {
        # Extract filename from URL
        $OutputFile = Split-Path -Leaf ([System.Uri]$Url).AbsolutePath
        if ($OutputFile -eq "" -or $OutputFile -eq "/") {
            $OutputFile = "downloaded-file"
        }
    }
    
    $OutputPath = Join-Path $AssetsDir $OutputFile
    Download-File -Url $Url -OutputPath $OutputPath
    exit
}

# Default: Download files from downloads.txt
$DownloadsFile = "downloads.txt"

if (-not (Test-Path $DownloadsFile)) {
    Write-Host "[ERROR] $DownloadsFile not found!" -ForegroundColor Red
    Write-Host "Please create $DownloadsFile with format: URL|FILENAME" -ForegroundColor Yellow
    exit 1
}

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Downloading CDN Assets" -ForegroundColor Cyan
Write-Host "Reading from: $DownloadsFile" -ForegroundColor Gray
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$downloads = @()
$lines = Get-Content $DownloadsFile

foreach ($line in $lines) {
    # Skip empty lines and comments
    $trimmed = $line.Trim()
    if ($trimmed -eq "" -or $trimmed.StartsWith("#")) {
        continue
    }
    
    # Parse URL|FILENAME format
    if ($trimmed -match "^(.+?)\|(.+)$") {
        $downloads += @{
            Url = $matches[1].Trim()
            File = $matches[2].Trim()
        }
    } else {
        Write-Host "[WARNING] Skipping invalid line: $line" -ForegroundColor Yellow
    }
}

if ($downloads.Count -eq 0) {
    Write-Host "[ERROR] No valid downloads found in $DownloadsFile" -ForegroundColor Red
    exit 1
}

$successCount = 0
$failCount = 0

foreach ($download in $downloads) {
    $OutputPath = Join-Path $AssetsDir $download.File
    if (Download-File -Url $download.Url -OutputPath $OutputPath) {
        $successCount++
    } else {
        $failCount++
    }
    Write-Host ""
}

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Download Complete" -ForegroundColor Cyan
Write-Host "  Success: $successCount" -ForegroundColor Green
Write-Host "  Failed:  $failCount" -ForegroundColor $(if ($failCount -eq 0) { "Green" } else { "Red" })
Write-Host "========================================" -ForegroundColor Cyan

