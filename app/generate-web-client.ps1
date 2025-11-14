# Generate JavaScript client from OpenAPI specification using openapi-typescript-codegen
# This generates a browser-compatible client with fetch API (zero dependencies)
# PowerShell script

$API_URL = if ($env:API_URL) { $env:API_URL } else { "http://localhost:5000/apispec.json" }
$JS_OUTPUT_DIR = if ($env:JS_OUTPUT_DIR) { $env:JS_OUTPUT_DIR } else { "assets\api-client" }
$CLIENT_NAME = if ($env:CLIENT_NAME) { $env:CLIENT_NAME } else { "nexum-api-client" }
$OPENAPI_SPEC = "openapi.json"

Write-Host "Generating web client with fetch API..." -ForegroundColor Cyan

# Download OpenAPI spec
try {
    Invoke-WebRequest -Uri $API_URL -OutFile $OPENAPI_SPEC -ErrorAction Stop
} catch {
    Write-Host "Error: Could not download OpenAPI spec from $API_URL" -ForegroundColor Red
    Write-Host "Make sure your Flask server is running!" -ForegroundColor Yellow
    exit 1
}

# Check prerequisites
if (!(Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "Error: Node.js is not installed" -ForegroundColor Red
    exit 1
}

if (!(Get-Command npx -ErrorAction SilentlyContinue)) {
    Write-Host "Error: npx is not available" -ForegroundColor Red
    exit 1
}

New-Item -ItemType Directory -Path $JS_OUTPUT_DIR -Force | Out-Null

# Generate client using openapi-typescript-codegen
Write-Host "Generating client..." -ForegroundColor Yellow

try {
    npx --yes openapi-typescript-codegen@latest `
        --input $OPENAPI_SPEC `
        --output $JS_OUTPUT_DIR `
        --client fetch 2>&1 | Out-Null

    if ($LASTEXITCODE -ne 0) {
        throw "Generation failed"
    }
} catch {
    Write-Host "Error: Failed to generate client" -ForegroundColor Red
    exit 1
}

# Compile TypeScript to JavaScript if tsc is available
if (Get-Command tsc -ErrorAction SilentlyContinue) {
    Write-Host "Compiling TypeScript to JavaScript..." -ForegroundColor Yellow
    Push-Location $JS_OUTPUT_DIR
    
    # Clean up old compiled files (dist, src folders might contain CommonJS)
    if (Test-Path "dist") { Remove-Item "dist" -Recurse -Force -ErrorAction SilentlyContinue }
    if (Test-Path "src") { Remove-Item "src" -Recurse -Force -ErrorAction SilentlyContinue }
    
    # Create tsconfig.json for ES module compilation
    $tsconfig = @'
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ES2020",
    "lib": ["ES2020", "DOM"],
    "moduleResolution": "node",
    "outDir": "./dist",
    "rootDir": ".",
    "declaration": false,
    "strict": false,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true
  },
  "include": ["**/*.ts"],
  "exclude": ["**/*.d.ts", "node_modules", "dist", "src", "test"]
}
'@
    $tsconfig | Out-File -FilePath "tsconfig.json" -Encoding utf8 -Force
    
    # Compile TypeScript to ES modules
    tsc 2>&1 | Out-Null
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Warning: TypeScript compilation had errors" -ForegroundColor Yellow
    }
    
    # Clean up tsconfig
    Remove-Item "tsconfig.json" -Force -ErrorAction SilentlyContinue
    
    # Move compiled .js files from dist to replace .ts files
    if (Test-Path "dist") {
        Get-ChildItem -Path "dist" -Recurse -File -Filter "*.js" | ForEach-Object {
            $fullPath = $_.FullName
            $distPath = (Resolve-Path "dist").Path
            $relativePath = $fullPath.Substring($distPath.Length + 1)
            $targetPath = Join-Path "." $relativePath
            $targetDir = Split-Path $targetPath -Parent
            
            if ($targetDir -and $targetDir -ne ".") {
                New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
            }
            
            # Replace .ts file with compiled .js file
            $tsPath = $targetPath -replace '\.js$', '.ts'
            if (Test-Path $tsPath) {
                Remove-Item $tsPath -Force
            }
            Move-Item $fullPath $targetPath -Force
        }
        
        # Remove empty dist directory
        Remove-Item "dist" -Recurse -Force -ErrorAction SilentlyContinue
    }
    
    # Add .js extensions to all relative imports/exports
    Write-Host "Adding .js extensions to imports..." -ForegroundColor Yellow
    Get-ChildItem -Path "." -Recurse -File -Filter "*.js" | Where-Object { 
        $_.DirectoryName -notlike "*node_modules*" -and 
        $_.DirectoryName -notlike "*test*" 
    } | ForEach-Object {
        $content = Get-Content $_.FullName -Raw -Encoding UTF8
        $originalContent = $content
        
        # Fix import statements: from './file' -> from './file.js'
        # Match: from './path' or from "../path" but not already .js
        $content = [regex]::Replace($content, "(from\s+['`"])(\.\.?/[^'`"]+)(['`"])", {
            param($match)
            $prefix = $match.Groups[1].Value
            $path = $match.Groups[2].Value
            $suffix = $match.Groups[3].Value
            
            # Skip if already has .js extension
            if ($path -match '\.js$') { return $match.Value }
            
            # Skip index imports (they need /index.js)
            if ($path -match '/index$' -or $path -eq './index' -or $path -eq '../index') {
                return "$prefix$path.js$suffix"
            }
            
            return "$prefix$path.js$suffix"
        })
        
        # Fix export statements: export ... from './file' -> from './file.js'
        $content = [regex]::Replace($content, "(export\s+.*\s+from\s+['`"])(\.\.?/[^'`"]+)(['`"])", {
            param($match)
            $prefix = $match.Groups[1].Value
            $path = $match.Groups[2].Value
            $suffix = $match.Groups[3].Value
            
            # Skip if already has .js extension
            if ($path -match '\.js$') { return $match.Value }
            
            return "$prefix$path.js$suffix"
        })
        
        # Only write if content changed
        if ($content -ne $originalContent) {
            Set-Content -Path $_.FullName -Value $content -Encoding UTF8 -NoNewline
        }
    }
    
    Pop-Location
} else {
    Write-Host "Warning: TypeScript compiler not found. Install with: npm install -g typescript" -ForegroundColor Yellow
    Write-Host "Generated TypeScript files remain in $JS_OUTPUT_DIR" -ForegroundColor Yellow
}

Remove-Item $OPENAPI_SPEC -Force -ErrorAction SilentlyContinue
Write-Host "Done! Client generated in $JS_OUTPUT_DIR" -ForegroundColor Green

