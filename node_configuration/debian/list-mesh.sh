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

# Calculate IP address from MAC address
# Uses last 2 bytes of MAC address for IP octets 3 and 4
# Default IP range: 169.254.0.0/16 (IPv4 link-local range)
calculate_ip_from_mac() {
    local mac=$1
    local ip_base="${IP_BASE:-169.254.0.0}"
    
    # Remove colons and convert to lowercase
    mac=$(echo "$mac" | tr -d ':' | tr '[:upper:]' '[:lower:]')
    
    if [ -z "$mac" ] || [ ${#mac} -ne 12 ]; then
        echo "unknown"
        return 1
    fi
    
    # Extract last 2 bytes (last 4 hex characters)
    local last_bytes="${mac: -4}"
    
    # Convert hex to decimal for octet 3 and 4
    local octet3=$((0x${last_bytes:0:2}))
    local octet4=$((0x${last_bytes:2:2}))
    
    # Extract base network (first two octets) from IP_BASE
    IFS='.' read -r base_octet1 base_octet2 _ _ <<< "$ip_base"
    
    echo "$base_octet1.$base_octet2.$octet3.$octet4"
}

# Extract MAC address from batctl output line
# Handles various formats: "   * aa:bb:cc:dd:ee:ff" or "aa:bb:cc:dd:ee:ff [interface]"
extract_mac_from_line() {
    local line="$1"
    # Extract MAC address (format: xx:xx:xx:xx:xx:xx)
    echo "$line" | grep -oE "([0-9a-fA-F]{2}:){5}[0-9a-fA-F]{2}" | head -n1
}

# Check if running as root (needed for some batctl commands)
NEEDS_SUDO=false
if [ "$(id -u)" -ne 0 ]; then
    NEEDS_SUDO=true
fi

# Get IP base from bat0 if available, otherwise use default
if ip addr show bat0 2>/dev/null | grep -q "inet "; then
    BAT0_IP_FULL=$(ip addr show bat0 | grep "inet " | awk '{print $2}' | head -n1)
    IP_BASE=$(echo "$BAT0_IP_FULL" | cut -d'/' -f1 | cut -d'.' -f1-2).0.0
else
    IP_BASE="169.254.0.0"
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
        NEIGH_COUNT=$(echo "$NEIGHBORS" | grep -v "^$" | grep -v "^Neighbor" | grep -E "([0-9a-fA-F]{2}:){5}[0-9a-fA-F]{2}" | wc -l)
        
        if [ "$NEIGH_COUNT" -gt 0 ]; then
            print_status "OK" "Found $NEIGH_COUNT direct neighbor(s)"
            echo ""
            # Print header
            printf "  %-20s %-18s %-15s\n" "MAC Address" "IP Address" "Interface/Info"
            echo "  $(printf '=%.0s' {1..55})"
            
            echo "$NEIGHBORS" | while IFS= read -r line; do
                MAC=$(extract_mac_from_line "$line")
                if [ -n "$MAC" ]; then
                    CALC_IP=$(calculate_ip_from_mac "$MAC")
                    # Extract interface/info (everything after MAC)
                    INFO=$(echo "$line" | sed "s/.*$MAC//" | sed 's/^[[:space:]]*//')
                    printf "  %-20s %-18s %s\n" "$MAC" "$CALC_IP" "$INFO"
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
        # Count non-empty lines with MAC addresses (excluding header)
        ORIG_COUNT=$(echo "$ORIGINATORS" | grep -E "([0-9a-fA-F]{2}:){5}[0-9a-fA-F]{2}" | wc -l)
        
        if [ "$ORIG_COUNT" -gt 0 ]; then
            print_status "OK" "Found $ORIG_COUNT originator(s) in mesh"
            echo ""
            # Print header
            printf "  %-20s %-18s %s\n" "MAC Address" "IP Address" "Info"
            echo "  $(printf '=%.0s' {1..70})"
            
            echo "$ORIGINATORS" | while IFS= read -r line; do
                MAC=$(extract_mac_from_line "$line")
                if [ -n "$MAC" ]; then
                    CALC_IP=$(calculate_ip_from_mac "$MAC")
                    # Extract info (everything after MAC, clean up)
                    INFO=$(echo "$line" | sed "s/.*$MAC//" | sed 's/^[[:space:]]*//' | sed 's/[[:space:]]\+/ /g')
                    # Skip header lines
                    if ! echo "$line" | grep -q "^\[B.A.T.M.A.N." && ! echo "$line" | grep -q "^Originator"; then
                        printf "  %-20s %-18s %s\n" "$MAC" "$CALC_IP" "$INFO"
                    fi
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

# 6. ARP Table (Discovered IP Addresses)
print_section "6. ARP Table (Discovered IP Addresses)"

if ip link show bat0 &>/dev/null; then
    ARP_ENTRIES=$(ip neigh show dev bat0 2>/dev/null || echo "")
    
    if [ -n "$ARP_ENTRIES" ]; then
        ARP_COUNT=$(echo "$ARP_ENTRIES" | grep -v "^$" | wc -l)
        
        if [ "$ARP_COUNT" -gt 0 ]; then
            print_status "OK" "Found $ARP_COUNT ARP entry/entries on bat0"
            echo ""
            printf "  %-18s %-20s %-15s\n" "IP Address" "MAC Address" "State"
            echo "  $(printf '=%.0s' {1..55})"
            
            echo "$ARP_ENTRIES" | while IFS= read -r line; do
                if [ -n "$line" ]; then
                    IP=$(echo "$line" | awk '{print $1}')
                    MAC=$(echo "$line" | grep -oE "([0-9a-fA-F]{2}:){5}[0-9a-fA-F]{2}" || echo "unknown")
                    STATE=$(echo "$line" | awk '{for(i=3;i<=NF;i++) printf "%s ", $i; print ""}' | sed 's/[[:space:]]*$//')
                    if [ -z "$STATE" ]; then
                        STATE="unknown"
                    fi
                    printf "  %-18s %-20s %s\n" "$IP" "$MAC" "$STATE"
                fi
            done
        else
            print_status "WARN" "No ARP entries found on bat0"
            echo "  ARP entries appear after communication with neighbors"
            echo "  Try: ping <neighbor_ip> to populate ARP table"
        fi
    else
        print_status "WARN" "Could not query ARP table"
    fi
else
    print_status "WARN" "bat0 interface not available"
fi

# 7. Mesh Topology (if available)
print_section "7. Mesh Topology"

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

# 8. Wireless Interface Status
print_section "8. Wireless Interface Status"

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

# 9. Systemd Service Status
print_section "9. Mesh Service Status"

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

echo "IP Address Information:"
echo "  • Calculated IPs are shown based on MAC addresses (using last 2 bytes)"
echo "  • ARP table shows discovered IP addresses after communication"
echo "  • To discover IPs, ping a neighbor: ping <calculated_ip>"
echo ""
echo "To get more detailed information, run:"
echo "  sudo batctl o    # List all originators (with MAC addresses)"
echo "  sudo batctl n    # List direct neighbors (with MAC addresses)"
echo "  sudo batctl if   # List batman-adv interfaces"
echo "  sudo batctl m    # Show mesh topology"
echo "  sudo batctl g    # Show gateways (if configured)"
echo "  ip neigh show dev bat0  # Show ARP table with discovered IPs"
echo ""
echo "For continuous monitoring:"
echo "  watch -n 2 'sudo batctl n'  # Watch neighbors every 2 seconds"
echo "  watch -n 2 'sudo batctl o'  # Watch originators every 2 seconds"
echo ""

