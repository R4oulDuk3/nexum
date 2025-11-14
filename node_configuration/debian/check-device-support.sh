#!/bin/bash
# Nexum Mesh Network - Device Support Checker
# This script checks if your wireless device supports 802.11s mesh point mode
# and other mesh networking capabilities

# Ensure this script is run with bash (not sh/dash)
if [ -z "$BASH_VERSION" ]; then
    exec /bin/bash "$0" "$@"
fi

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo "========================================="
echo "Nexum Mesh Network - Device Support Check"
echo "========================================="
echo ""

# Check if running as root (needed for some checks)
NEEDS_ROOT=false
if [ "$(id -u)" -ne 0 ]; then
    echo -e "${YELLOW}Note: Some checks require root privileges${NC}"
    echo "Running without root (some features may not be testable)"
    echo ""
fi

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check required tools
echo "Checking required tools..."
MISSING_TOOLS=()

if ! command_exists iw; then
    MISSING_TOOLS+=("iw")
fi

if ! command_exists lsmod; then
    MISSING_TOOLS+=("lsmod")
fi

if [ ${#MISSING_TOOLS[@]} -gt 0 ]; then
    echo -e "${RED}✗ Missing required tools: ${MISSING_TOOLS[*]}${NC}"
    echo "Please install: sudo apt-get install iw"
    exit 1
fi

echo -e "${GREEN}✓ Required tools available${NC}"
echo ""

# Find wireless interfaces
echo "Detecting wireless interfaces..."
INTERFACES=$(iw dev 2>/dev/null | grep -E "^[[:space:]]*Interface" | awk '{print $2}' || echo "")

if [ -z "$INTERFACES" ]; then
    echo -e "${RED}✗ No wireless interfaces found!${NC}"
    echo "Make sure your WiFi adapter is connected and drivers are loaded."
    exit 1
fi

echo -e "${GREEN}Found wireless interfaces:${NC}"
for IFACE in $INTERFACES; do
    echo "  - $IFACE"
done
echo ""

# Check each interface
for IFACE in $INTERFACES; do
    echo "========================================="
    echo "Checking interface: $IFACE"
    echo "========================================="
    echo ""
    
    # Get PHY name
    PHY_NAME=$(cat /sys/class/net/$IFACE/phy80211/name 2>/dev/null || echo "")
    
    if [ -z "$PHY_NAME" ]; then
        echo -e "${RED}✗ Could not determine PHY device for $IFACE${NC}"
        echo ""
        continue
    fi
    
    echo "PHY device: $PHY_NAME"
    echo ""
    
    # Get driver information
    echo "Driver information:"
    DRIVER=$(basename $(readlink /sys/class/net/$IFACE/device/driver 2>/dev/null) 2>/dev/null || echo "unknown")
    echo "  Driver: $DRIVER"
    
    # Check if driver is loaded
    if lsmod | grep -q "^${DRIVER}"; then
        echo -e "  ${GREEN}✓ Driver is loaded${NC}"
    else
        echo -e "  ${YELLOW}⚠ Driver module not found in lsmod${NC}"
    fi
    echo ""
    
    # Check supported interface modes
    echo "Supported interface modes:"
    MODES=$(iw phy $PHY_NAME info 2>/dev/null | grep -A 15 "Supported interface modes" || echo "")
    
    if [ -z "$MODES" ]; then
        echo -e "  ${RED}✗ Could not retrieve interface modes${NC}"
        echo ""
        continue
    fi
    
    # Extract and display modes
    MESH_SUPPORTED=false
    IBSS_SUPPORTED=false
    AP_SUPPORTED=false
    
    echo "$MODES" | grep -E "^\s+\*" | while read -r line; do
        MODE=$(echo "$line" | sed 's/^\s\+\*\s\+//')
        echo "    * $MODE"
        
        if echo "$MODE" | grep -qi "mesh point\|mesh"; then
            MESH_SUPPORTED=true
        fi
        if echo "$MODE" | grep -qi "ibss\|ad-hoc"; then
            IBSS_SUPPORTED=true
        fi
        if echo "$MODE" | grep -qi "^AP"; then
            AP_SUPPORTED=true
        fi
    done
    
    echo ""
    
    # Check 802.11s mesh point support
    echo "802.11s Mesh Point Support:"
    if echo "$MODES" | grep -qi "mesh point\|mesh"; then
        echo -e "  ${GREEN}✓ 802.11s mesh point mode is SUPPORTED${NC}"
        echo ""
        echo -e "  ${GREEN}This device can run both mesh and AP on the same radio!${NC}"
        MESH_SUPPORTED=true
    else
        echo -e "  ${RED}✗ 802.11s mesh point mode is NOT supported${NC}"
        echo ""
        MESH_SUPPORTED=false
    fi
    
    # Check IBSS support
    echo "IBSS (Ad-hoc) Support:"
    if echo "$MODES" | grep -qi "ibss\|ad-hoc"; then
        echo -e "  ${GREEN}✓ IBSS (ad-hoc) mode is supported${NC}"
        IBSS_SUPPORTED=true
    else
        echo -e "  ${RED}✗ IBSS (ad-hoc) mode is NOT supported${NC}"
        IBSS_SUPPORTED=false
    fi
    
    # Check AP support
    echo ""
    echo "Access Point Support:"
    if echo "$MODES" | grep -qi "^AP"; then
        echo -e "  ${GREEN}✓ AP mode is supported${NC}"
        AP_SUPPORTED=true
    else
        echo -e "  ${RED}✗ AP mode is NOT supported${NC}"
        AP_SUPPORTED=false
    fi
    
    echo ""
    
    # Summary and recommendations
    echo "Summary for $IFACE:"
    echo "-------------------"
    
    if [ "$MESH_SUPPORTED" = true ]; then
        echo -e "${GREEN}✓ Recommended: Use 802.11s mesh mode${NC}"
        echo "  - Can run mesh + AP on same radio"
        echo "  - Better performance than IBSS"
        echo "  - Standardized protocol"
    elif [ "$IBSS_SUPPORTED" = true ]; then
        echo -e "${YELLOW}⚠ Fallback: Use IBSS (ad-hoc) mode${NC}"
        echo "  - Can run mesh network"
        echo "  - Cannot run AP + mesh on same radio"
        echo "  - Requires second radio for AP functionality"
    else
        echo -e "${RED}✗ This device does not support mesh networking${NC}"
        echo "  - Consider using a different WiFi adapter"
    fi
    
    echo ""
    
    # Try to set mesh mode (if root)
    if [ "$(id -u)" -eq 0 ] && [ "$MESH_SUPPORTED" = true ]; then
        echo "Testing mesh mode (requires root)..."
        CURRENT_STATE=$(ip link show $IFACE 2>/dev/null | grep -o "state [A-Z]*" | awk '{print $2}' || echo "UNKNOWN")
        
        if [ "$CURRENT_STATE" != "DOWN" ]; then
            echo "  Bringing interface down for test..."
            ip link set $IFACE down 2>/dev/null || true
        fi
        
        if iw dev $IFACE set type mp 2>/dev/null; then
            echo -e "  ${GREEN}✓ Successfully set interface to mesh point mode${NC}"
            # Reset back
            iw dev $IFACE set type managed 2>/dev/null || true
            if [ "$CURRENT_STATE" != "DOWN" ]; then
                ip link set $IFACE up 2>/dev/null || true
            fi
        else
            echo -e "  ${YELLOW}⚠ Could not set mesh point mode (may need driver reload)${NC}"
        fi
        echo ""
    fi
    
    # Check kernel mesh support
    echo "Kernel mesh support:"
    if [ -f /boot/config-$(uname -r) ]; then
        if grep -qi "CONFIG_MAC80211_MESH=y" /boot/config-$(uname -r) 2>/dev/null; then
            echo -e "  ${GREEN}✓ Kernel has mesh support compiled in${NC}"
        else
            echo -e "  ${YELLOW}⚠ Kernel mesh support not found in config${NC}"
        fi
    elif [ -f /proc/config.gz ]; then
        if zcat /proc/config.gz 2>/dev/null | grep -qi "CONFIG_MAC80211_MESH=y"; then
            echo -e "  ${GREEN}✓ Kernel has mesh support compiled in${NC}"
        else
            echo -e "  ${YELLOW}⚠ Kernel mesh support not found${NC}"
        fi
    else
        echo -e "  ${YELLOW}⚠ Could not check kernel config${NC}"
    fi
    
    echo ""
    echo ""
done

# Overall recommendation
echo "========================================="
echo "Overall Recommendation"
echo "========================================="
echo ""

ANY_MESH=false
ANY_IBSS=false

for IFACE in $INTERFACES; do
    PHY_NAME=$(cat /sys/class/net/$IFACE/phy80211/name 2>/dev/null || echo "")
    if [ -n "$PHY_NAME" ]; then
        MODES=$(iw phy $PHY_NAME info 2>/dev/null | grep -A 15 "Supported interface modes" || echo "")
        if echo "$MODES" | grep -qi "mesh point\|mesh"; then
            ANY_MESH=true
        fi
        if echo "$MODES" | grep -qi "ibss\|ad-hoc"; then
            ANY_IBSS=true
        fi
    fi
done

if [ "$ANY_MESH" = true ]; then
    echo -e "${GREEN}✓ Your device supports 802.11s mesh mode${NC}"
    echo ""
    echo "Recommended setup:"
    echo "  1. Use 802.11s mesh mode (instead of IBSS)"
    echo "  2. Can run both mesh and AP on the same radio"
    echo "  3. Better performance and stability"
    echo ""
    echo "Next steps:"
    echo "  - Modify setup-mesh.sh to use 'iw dev <interface> set type mp'"
    echo "  - Use 'iw dev <interface> mesh join <essid>' instead of ibss join"
elif [ "$ANY_IBSS" = true ]; then
    echo -e "${YELLOW}⚠ Your device supports IBSS (ad-hoc) mode only${NC}"
    echo ""
    echo "Current setup:"
    echo "  - Using IBSS mode (current implementation)"
    echo "  - Cannot run AP + mesh on same radio"
    echo "  - Requires second radio for AP functionality"
    echo ""
    echo "Options:"
    echo "  1. Continue with IBSS + second radio for AP"
    echo "  2. Consider upgrading to a WiFi adapter with 802.11s support"
else
    echo -e "${RED}✗ Your device does not support mesh networking${NC}"
    echo ""
    echo "Recommendations:"
    echo "  1. Use a different WiFi adapter"
    echo "  2. Check if drivers need to be updated"
    echo "  3. Consider USB WiFi adapters with known mesh support:"
    echo "     - TP-Link Archer T2U Plus (ath9k driver)"
    echo "     - Alfa AWUS036ACS (ath10k driver)"
fi

echo ""
echo "For more information, see:"
echo "  - https://wireless.wiki.kernel.org/en/users/documentation/iw"
echo "  - https://openwrt.org/docs/guide-user/network/wifi/mesh/802-11s"
echo ""

