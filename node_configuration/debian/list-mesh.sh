#!/bin/bash
# Nexum Mesh Network - Mesh State and Neighbors Listing Script
# This script displays the current mesh network state and neighbor information

# Ensure this script is run with bash (not sh/dash)
if [ -z "$BASH_VERSION" ]; then
    exec /bin/bash "$0" "$@"
fi

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Function to print section headers
print_section() {
    echo ""
    echo -e "${CYAN}========================================${NC}"
    echo -e "${CYAN}$1${NC}"
    echo -e "${CYAN}========================================${NC}"
    echo ""
}

# Function to print status indicators
print_status() {
    local status=$1
    local message=$2
    if [ "$status" = "OK" ]; then
        echo -e "${GREEN}✓${NC} $message"
    elif [ "$status" = "ERROR" ]; then
        echo -e "${RED}✗${NC} $message"
    elif [ "$status" = "WARN" ]; then
        echo -e "${YELLOW}⚠${NC} $message"
    else
        echo "  $message"
    fi
}

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check if running as root (needed for some batctl commands)
NEEDS_SUDO=false
if [ "$(id -u)" -ne 0 ]; then
    NEEDS_SUDO=true
fi

echo "========================================="
echo "Nexum Mesh Network - State & Neighbors"
echo "========================================="
echo ""

# 1. Check batman-adv module
print_section "1. BATMAN-adv Module Status"

if lsmod | grep -q "^batman_adv"; then
    print_status "OK" "batman-adv module is loaded"
    MODULE_INFO=$(lsmod | grep "^batman_adv")
    echo "  $MODULE_INFO"
else
    print_status "ERROR" "batman-adv module is NOT loaded"
    echo "  Run: sudo modprobe batman-adv"
fi

# 2. Check bat0 interface status
print_section "2. Mesh Interface (bat0) Status"

if ip link show bat0 &>/dev/null; then
    print_status "OK" "bat0 interface exists"
    
    # Interface state
    if ip link show bat0 | grep -q "state UP"; then
        print_status "OK" "bat0 interface is UP"
    else
        print_status "ERROR" "bat0 interface is DOWN"
    fi
    
    # MAC address
    if [ -f /sys/class/net/bat0/address ]; then
        MAC=$(cat /sys/class/net/bat0/address)
        echo "  MAC Address: $MAC"
    fi
    
    # IP address
    if ip addr show bat0 | grep -q "inet "; then
        BAT0_IP=$(ip addr show bat0 | grep "inet " | awk '{print $2}' | head -n1)
        print_status "OK" "bat0 IP address: $BAT0_IP"
    else
        print_status "WARN" "bat0 has NO IP address"
    fi
    
    # MTU
    MTU=$(ip link show bat0 | grep -oP "mtu \K[0-9]+" || echo "unknown")
    echo "  MTU: $MTU"
    
else
    print_status "ERROR" "bat0 interface does NOT exist"
    echo "  Mesh network may not be set up. Run: sudo ./setup-mesh.sh"
fi

# 3. BATMAN-adv interfaces
print_section "3. BATMAN-adv Interfaces"

if command_exists batctl; then
    if [ "$NEEDS_SUDO" = true ]; then
        BAT_INTERFACES=$(sudo batctl if 2>/dev/null || echo "")
    else
        BAT_INTERFACES=$(batctl if 2>/dev/null || echo "")
    fi
    
    if [ -n "$BAT_INTERFACES" ]; then
        echo "$BAT_INTERFACES" | while IFS= read -r line; do
            if [ -n "$line" ]; then
                echo "  $line"
            fi
        done
    else
        print_status "WARN" "No interfaces added to batman-adv"
    fi
else
    print_status "ERROR" "batctl command not found"
    echo "  Install with: sudo apt-get install batctl"
fi

# 4. Direct Neighbors
print_section "4. Direct Neighbors"

if command_exists batctl; then
    if [ "$NEEDS_SUDO" = true ]; then
        NEIGHBORS=$(sudo batctl n 2>/dev/null || echo "")
    else
        NEIGHBORS=$(batctl n 2>/dev/null || echo "")
    fi
    
    if [ -n "$NEIGHBORS" ]; then
        # Count non-empty lines (excluding header)
        NEIGH_COUNT=$(echo "$NEIGHBORS" | grep -v "^$" | grep -v "^Neighbor" | wc -l)
        
        if [ "$NEIGH_COUNT" -gt 0 ]; then
            print_status "OK" "Found $NEIGH_COUNT direct neighbor(s)"
            echo ""
            echo "$NEIGHBORS" | while IFS= read -r line; do
                if [ -n "$line" ]; then
                    echo "  $line"
                fi
            done
        else
            print_status "WARN" "No direct neighbors found"
            echo "  This is normal if you're the only node or not in range of other nodes"
        fi
    else
        print_status "WARN" "Could not query neighbors (may need sudo)"
    fi
else
    print_status "ERROR" "batctl command not found"
fi

# 5. Mesh Originators (All Nodes)
print_section "5. Mesh Originators (All Nodes)"

if command_exists batctl; then
    if [ "$NEEDS_SUDO" = true ]; then
        ORIGINATORS=$(sudo batctl o 2>/dev/null || echo "")
    else
        ORIGINATORS=$(batctl o 2>/dev/null || echo "")
    fi
    
    if [ -n "$ORIGINATORS" ]; then
        # Count non-empty lines (excluding header)
        ORIG_COUNT=$(echo "$ORIGINATORS" | grep -v "^$" | grep -v "^\[B.A.T.M.A.N. adv" | grep -v "^Originator" | wc -l)
        
        if [ "$ORIG_COUNT" -gt 0 ]; then
            print_status "OK" "Found $ORIG_COUNT originator(s) in mesh"
            echo ""
            echo "$ORIGINATORS" | while IFS= read -r line; do
                if [ -n "$line" ] && ! echo "$line" | grep -q "^\[B.A.T.M.A.N." && ! echo "$line" | grep -q "^Originator"; then
                    echo "  $line"
                fi
            done
        else
            print_status "WARN" "No other mesh nodes found"
            echo "  This is normal if you're the first/only node in the mesh"
        fi
    else
        print_status "WARN" "Could not query originators (may need sudo)"
    fi
else
    print_status "ERROR" "batctl command not found"
fi

# 6. Mesh Topology (if available)
print_section "6. Mesh Topology"

if command_exists batctl; then
    if [ "$NEEDS_SUDO" = true ]; then
        TOPOLOGY=$(sudo batctl m 2>/dev/null || echo "")
    else
        TOPOLOGY=$(batctl m 2>/dev/null || echo "")
    fi
    
    if [ -n "$TOPOLOGY" ]; then
        echo "$TOPOLOGY" | while IFS= read -r line; do
            if [ -n "$line" ]; then
                echo "  $line"
            fi
        done
    else
        print_status "WARN" "Could not retrieve topology (may need sudo or feature not available)"
    fi
else
    print_status "ERROR" "batctl command not found"
fi

# 7. Wireless Interface Status
print_section "7. Wireless Interface Status"

# Detect wireless interface
WIRELESS_INTERFACE=""
if ip link show wlan0 &>/dev/null; then
    WIRELESS_INTERFACE="wlan0"
elif ip link show wlan1 &>/dev/null; then
    WIRELESS_INTERFACE="wlan1"
else
    WIRELESS_INTERFACE=$(iw dev 2>/dev/null | grep -E "^[[:space:]]*Interface" | awk '{print $2}' | head -n1)
fi

if [ -n "$WIRELESS_INTERFACE" ]; then
    print_status "OK" "Wireless interface: $WIRELESS_INTERFACE"
    
    # Interface state
    if ip link show "$WIRELESS_INTERFACE" | grep -q "state UP"; then
        print_status "OK" "Interface is UP"
    else
        print_status "WARN" "Interface is DOWN"
    fi
    
    # Interface type and connection info
    if command_exists iw; then
        if iw dev "$WIRELESS_INTERFACE" info &>/dev/null; then
            INTERFACE_TYPE=$(iw dev "$WIRELESS_INTERFACE" info 2>/dev/null | grep -oP "type \K\w+" || echo "unknown")
            echo "  Type: $INTERFACE_TYPE"
            
            if [ "$INTERFACE_TYPE" = "IBSS" ]; then
                print_status "OK" "Interface is in IBSS (mesh) mode"
                
                # Get IBSS connection info
                if iw dev "$WIRELESS_INTERFACE" link &>/dev/null; then
                    SSID=$(iw dev "$WIRELESS_INTERFACE" link 2>/dev/null | grep -oP "SSID: \K.+" || echo "unknown")
                    FREQ=$(iw dev "$WIRELESS_INTERFACE" link 2>/dev/null | grep -oP "freq: \K\w+" || echo "unknown")
                    echo "  SSID: $SSID"
                    echo "  Frequency: $FREQ MHz"
                fi
            else
                print_status "WARN" "Interface is in $INTERFACE_TYPE mode (expected IBSS for mesh)"
            fi
        fi
    fi
    
    # MAC address
    if [ -f /sys/class/net/"$WIRELESS_INTERFACE"/address ]; then
        MAC=$(cat /sys/class/net/"$WIRELESS_INTERFACE"/address)
        echo "  MAC Address: $MAC"
    fi
else
    print_status "WARN" "No wireless interface detected"
fi

# 8. Systemd Service Status
print_section "8. Mesh Service Status"

if systemctl list-unit-files 2>/dev/null | grep -q batman-mesh.service; then
    SERVICE_STATUS=$(systemctl is-active batman-mesh 2>/dev/null || echo "inactive")
    SERVICE_ENABLED=$(systemctl is-enabled batman-mesh 2>/dev/null || echo "disabled")
    
    if [ "$SERVICE_STATUS" = "active" ]; then
        print_status "OK" "batman-mesh service is active"
    else
        print_status "WARN" "batman-mesh service is $SERVICE_STATUS"
    fi
    
    if [ "$SERVICE_ENABLED" = "enabled" ]; then
        print_status "OK" "batman-mesh service is enabled (will start on boot)"
    else
        print_status "WARN" "batman-mesh service is $SERVICE_ENABLED"
    fi
else
    print_status "WARN" "batman-mesh service not found"
fi

# Summary
print_section "Summary"

echo "To get more detailed information, run:"
echo "  sudo batctl o    # List all originators"
echo "  sudo batctl n    # List direct neighbors"
echo "  sudo batctl if   # List batman-adv interfaces"
echo "  sudo batctl m    # Show mesh topology"
echo "  sudo batctl g    # Show gateways (if configured)"
echo ""
echo "For continuous monitoring:"
echo "  watch -n 2 'sudo batctl n'  # Watch neighbors every 2 seconds"
echo "  watch -n 2 'sudo batctl o'  # Watch originators every 2 seconds"
echo ""

