#!/bin/bash
# Nexum Mesh Network - Validation Script
# This script validates that the mesh network setup is successful

# Ensure this script is run with bash
if [ -z "$BASH_VERSION" ]; then
    exec /bin/bash "$0" "$@"
fi

echo "========================================="
echo "Nexum Mesh Network - Validation Script"
echo "========================================="
echo ""

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if running as root (needed for some commands)
if [ "$(id -u)" -ne 0 ]; then 
    echo "Note: Some commands require root. Run with sudo for full validation."
    echo ""
fi

# Counters for results
PASSED=0
FAILED=0
WARNINGS=0

# Function to print status
print_status() {
    local status=$1
    local message=$2
    if [ "$status" = "PASS" ]; then
        echo -e "${GREEN}✓${NC} $message"
        ((PASSED++))
    elif [ "$status" = "FAIL" ]; then
        echo -e "${RED}✗${NC} $message"
        ((FAILED++))
    elif [ "$status" = "WARN" ]; then
        echo -e "${YELLOW}⚠${NC} $message"
        ((WARNINGS++))
    else
        echo "  $message"
    fi
}

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

echo "Checking mesh network configuration..."
echo ""

# 1. Check if batman-adv module is loaded
echo "1. Checking batman-adv kernel module..."
if lsmod | grep -q batman_adv; then
    print_status "PASS" "batman-adv module is loaded"
else
    print_status "FAIL" "batman-adv module is NOT loaded"
fi
echo ""

# 2. Check if bat0 interface exists
echo "2. Checking bat0 mesh interface..."
if ip link show bat0 &>/dev/null; then
    print_status "PASS" "bat0 interface exists"
    
    # Check if bat0 is up
    if ip link show bat0 | grep -q "UP"; then
        print_status "PASS" "bat0 interface is UP"
    else
        print_status "FAIL" "bat0 interface is DOWN"
    fi
    
    # Check if bat0 has IP address
    if ip addr show bat0 | grep -q "inet "; then
        BAT0_IP=$(ip addr show bat0 | grep "inet " | awk '{print $2}' | cut -d'/' -f1)
        print_status "PASS" "bat0 has IP address: $BAT0_IP"
        
        # Verify IP is in link-local range
        if echo "$BAT0_IP" | grep -q "^169\.254\."; then
            print_status "PASS" "IP address is in link-local range (169.254.0.0/16)"
        else
            print_status "WARN" "IP address is not in expected link-local range"
        fi
    else
        print_status "FAIL" "bat0 has NO IP address"
    fi
else
    print_status "FAIL" "bat0 interface does NOT exist"
fi
echo ""

# 3. Check wireless interface mode
echo "3. Checking wireless interface configuration..."
WIRELESS_INTERFACE=""
if ip link show wlan0 &>/dev/null; then
    WIRELESS_INTERFACE="wlan0"
elif ip link show wlan1 &>/dev/null; then
    WIRELESS_INTERFACE="wlan1"
else
    # Try to detect any wireless interface
    WIRELESS_INTERFACE=$(iw dev | grep -E "^[[:space:]]*Interface" | awk '{print $2}' | head -n1)
fi

if [ -n "$WIRELESS_INTERFACE" ]; then
    print_status "PASS" "Wireless interface detected: $WIRELESS_INTERFACE"
    
    # Check interface type
    if iw dev "$WIRELESS_INTERFACE" info &>/dev/null; then
        INTERFACE_TYPE=$(iw dev "$WIRELESS_INTERFACE" info | grep -oP "type \K\w+")
        if [ "$INTERFACE_TYPE" = "IBSS" ]; then
            print_status "PASS" "Interface is in IBSS (mesh) mode"
        else
            print_status "FAIL" "Interface is in $INTERFACE_TYPE mode (expected IBSS)"
        fi
        
        # Check IBSS connection
        if iw dev "$WIRELESS_INTERFACE" link &>/dev/null; then
            SSID=$(iw dev "$WIRELESS_INTERFACE" link | grep -oP "SSID: \K.+" || echo "unknown")
            FREQ=$(iw dev "$WIRELESS_INTERFACE" link | grep -oP "freq: \K\w+" || echo "unknown")
            print_status "PASS" "Connected to IBSS network: SSID=$SSID, freq=$FREQ MHz"
        else
            print_status "WARN" "IBSS connection status unknown"
        fi
    else
        print_status "WARN" "Cannot query interface info"
    fi
else
    print_status "FAIL" "No wireless interface found"
fi
echo ""

# 4. Check batman-adv interface assignment
echo "4. Checking batman-adv interface assignment..."
if command_exists batctl; then
    if sudo batctl if &>/dev/null; then
        BAT_INTERFACES=$(sudo batctl if 2>/dev/null | grep -v "^Interface" || echo "")
        if [ -n "$BAT_INTERFACES" ]; then
            print_status "PASS" "Interface(s) added to batman-adv:"
            echo "$BAT_INTERFACES" | while read line; do
                echo "    $line"
            done
        else
            print_status "FAIL" "No interfaces added to batman-adv"
        fi
    else
        print_status "WARN" "Cannot query batctl if (may need sudo)"
    fi
else
    print_status "FAIL" "batctl command not found"
fi
echo ""

# 5. Check mesh originators (other nodes)
echo "5. Checking mesh originators (other nodes)..."
if command_exists batctl; then
    ORIGINATORS=$(sudo batctl o 2>/dev/null || echo "")
    ORIG_COUNT=$(echo "$ORIGINATORS" | grep -v "^$" | wc -l)
    if [ "$ORIG_COUNT" -eq 0 ]; then
        print_status "WARN" "No other mesh nodes found (normal if you're the first/only node)"
    else
        print_status "PASS" "Found $ORIG_COUNT originator(s) in mesh:"
        echo "$ORIGINATORS" | grep -v "^$" | while read line; do
            echo "    $line"
        done
    fi
else
    print_status "WARN" "Cannot check originators (batctl not found)"
fi
echo ""

# 6. Check mesh neighbors
echo "6. Checking mesh neighbors..."
if command_exists batctl; then
    NEIGHBORS=$(sudo batctl n 2>/dev/null || echo "")
    NEIGH_COUNT=$(echo "$NEIGHBORS" | grep -v "^$" | wc -l)
    if [ "$NEIGH_COUNT" -eq 0 ]; then
        print_status "WARN" "No direct neighbors found (normal if you're alone)"
    else
        print_status "PASS" "Found $NEIGH_COUNT neighbor(s):"
        echo "$NEIGHBORS" | grep -v "^$" | while read line; do
            echo "    $line"
        done
    fi
else
    print_status "WARN" "Cannot check neighbors (batctl not found)"
fi
echo ""

# 7. Check systemd service status
echo "7. Checking systemd service..."
if systemctl list-unit-files | grep -q batman-mesh.service; then
    if systemctl is-active --quiet batman-mesh 2>/dev/null; then
        print_status "PASS" "batman-mesh service is active"
    else
        print_status "FAIL" "batman-mesh service is NOT active"
        echo "    Status: $(systemctl is-active batman-mesh 2>/dev/null || echo 'inactive')"
    fi
    
    if systemctl is-enabled --quiet batman-mesh 2>/dev/null; then
        print_status "PASS" "batman-mesh service is enabled (will start on boot)"
    else
        print_status "WARN" "batman-mesh service is NOT enabled"
    fi
else
    print_status "FAIL" "batman-mesh service not found"
fi
echo ""

# 8. Check IP forwarding
echo "8. Checking IP forwarding..."
IP_FORWARD=$(cat /proc/sys/net/ipv4/ip_forward 2>/dev/null || echo "0")
if [ "$IP_FORWARD" = "1" ]; then
    print_status "PASS" "IP forwarding is enabled"
else
    print_status "FAIL" "IP forwarding is disabled (should be 1)"
fi
echo ""

# 9. Check iptables forwarding rules
echo "9. Checking iptables forwarding rules..."
if command_exists iptables; then
    if sudo iptables -L FORWARD -n 2>/dev/null | grep -q "bat0"; then
        print_status "PASS" "iptables forwarding rules exist for bat0"
    else
        print_status "WARN" "No iptables forwarding rules found for bat0"
    fi
else
    print_status "WARN" "iptables command not found"
fi
echo ""

# 10. Check AP interface (if configured)
echo "10. Checking Access Point interface (if configured)..."
if ip link show ap0 &>/dev/null; then
    print_status "PASS" "ap0 interface exists"
    
    if ip link show ap0 | grep -q "state UP"; then
        print_status "PASS" "ap0 interface is UP"
    else
        print_status "WARN" "ap0 interface is DOWN"
    fi
    
    if systemctl is-active --quiet hostapd 2>/dev/null; then
        print_status "PASS" "hostapd service is active"
    else
        print_status "WARN" "hostapd service is NOT active"
    fi
else
    print_status "WARN" "ap0 interface not found (AP may not be configured)"
fi
echo ""

# 11. Check MAC-based IP calculation
echo "11. Verifying MAC-based IP assignment..."
if [ -n "$WIRELESS_INTERFACE" ] && [ -n "$BAT0_IP" ]; then
    if [ -f /sys/class/net/$WIRELESS_INTERFACE/address ]; then
        MAC=$(cat /sys/class/net/$WIRELESS_INTERFACE/address | tr -d ':')
        LAST_BYTES=${MAC: -4}
        OCTET3=$((0x${LAST_BYTES:0:2}))
        OCTET4=$((0x${LAST_BYTES:2:2}))
        EXPECTED_IP="169.254.$OCTET3.$OCTET4"
        
        if [ "$BAT0_IP" = "$EXPECTED_IP" ]; then
            print_status "PASS" "IP address matches MAC-based calculation ($EXPECTED_IP)"
        else
            print_status "WARN" "IP address ($BAT0_IP) doesn't match expected ($EXPECTED_IP)"
            echo "    MAC: $(cat /sys/class/net/$WIRELESS_INTERFACE/address)"
        fi
    fi
fi
echo ""

# Summary
echo "========================================="
echo "Validation Summary"
echo "========================================="
echo -e "${GREEN}Passed:${NC} $PASSED"
echo -e "${RED}Failed:${NC} $FAILED"
echo -e "${YELLOW}Warnings:${NC} $WARNINGS"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}✓ Mesh network setup appears to be successful!${NC}"
    echo ""
    if [ $WARNINGS -gt 0 ]; then
        echo "Note: Some warnings were found but are normal in certain configurations."
    fi
    exit 0
else
    echo -e "${RED}✗ Mesh network setup has issues that need attention.${NC}"
    echo ""
    echo "Troubleshooting steps:"
    echo "1. Check the failed items above"
    echo "2. Review logs: sudo journalctl -u batman-mesh -n 50"
    echo "3. Verify configuration: sudo iw dev $WIRELESS_INTERFACE info"
    echo "4. Check interface status: ip addr show bat0"
    exit 1
fi

