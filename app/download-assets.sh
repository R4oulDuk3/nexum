#!/bin/bash
# download-assets.sh
# Download CDN files to assets directory for offline use

ASSETS_DIR="assets"
URL="${1:-}"
OUTPUT_FILE="${2:-}"

# Create assets directory if it doesn't exist
if [ ! -d "$ASSETS_DIR" ]; then
    mkdir -p "$ASSETS_DIR"
    echo "Created directory: $ASSETS_DIR"
fi

# Function to download a file
download_file() {
    local url=$1
    local output_path=$2
    
    echo "Downloading: $url"
    echo "Saving to: $output_path"
    
    if command -v curl &> /dev/null; then
        if curl -L -f -o "$output_path" "$url" 2>/dev/null; then
            local file_size=$(du -h "$output_path" | cut -f1)
            echo "[OK] Downloaded: $output_path ($file_size)"
            return 0
        else
            echo "[ERROR] Failed to download $url"
            return 1
        fi
    elif command -v wget &> /dev/null; then
        if wget -q -O "$output_path" "$url" 2>/dev/null; then
            local file_size=$(du -h "$output_path" | cut -f1)
            echo "[OK] Downloaded: $output_path ($file_size)"
            return 0
        else
            echo "[ERROR] Failed to download $url"
            return 1
        fi
    else
        echo "[ERROR] Neither curl nor wget found. Please install one."
        return 1
    fi
}

# If URL provided, download single file
if [ -n "$URL" ]; then
    if [ -z "$OUTPUT_FILE" ]; then
        # Extract filename from URL
        OUTPUT_FILE=$(basename "$URL" | sed 's/[?#].*//')
        if [ -z "$OUTPUT_FILE" ] || [ "$OUTPUT_FILE" = "/" ]; then
            OUTPUT_FILE="downloaded-file"
        fi
    fi
    
    OUTPUT_PATH="$ASSETS_DIR/$OUTPUT_FILE"
    download_file "$URL" "$OUTPUT_PATH"
    exit $?
fi

# Default: Download files from downloads.txt
DOWNLOADS_FILE="downloads.txt"

if [ ! -f "$DOWNLOADS_FILE" ]; then
    echo "[ERROR] $DOWNLOADS_FILE not found!"
    echo "Please create $DOWNLOADS_FILE with format: URL|FILENAME"
    exit 1
fi

echo "========================================"
echo "Downloading CDN Assets"
echo "Reading from: $DOWNLOADS_FILE"
echo "========================================"
echo ""

success_count=0
fail_count=0

# Read downloads.txt line by line
while IFS= read -r line || [ -n "$line" ]; do
    # Trim whitespace
    line=$(echo "$line" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
    
    # Skip empty lines and comments
    if [ -z "$line" ] || [ "${line#\#}" != "$line" ]; then
        continue
    fi
    
    # Parse URL|FILENAME format
    if echo "$line" | grep -q '|'; then
        url=$(echo "$line" | cut -d'|' -f1 | sed 's/[[:space:]]*$//')
        filename=$(echo "$line" | cut -d'|' -f2 | sed 's/^[[:space:]]*//')
        
        if [ -n "$url" ] && [ -n "$filename" ]; then
            output_path="$ASSETS_DIR/$filename"
            
            if download_file "$url" "$output_path"; then
                ((success_count++))
            else
                ((fail_count++))
            fi
            echo ""
        else
            echo "[WARNING] Skipping invalid line: $line"
        fi
    else
        echo "[WARNING] Skipping invalid line (missing |): $line"
    fi
done < "$DOWNLOADS_FILE"

if [ $success_count -eq 0 ] && [ $fail_count -eq 0 ]; then
    echo "[ERROR] No valid downloads found in $DOWNLOADS_FILE"
    exit 1
fi

echo "========================================"
echo "Download Complete"
echo "  Success: $success_count"
echo "  Failed:  $fail_count"
echo "========================================"

