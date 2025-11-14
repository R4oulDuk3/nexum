#!/bin/bash
# Nexum Mesh Network - Basic Node Setup
# This script configures the essential mesh networking on a Raspberry Pi node
# Following: https://meshunderground.com/posts/raspberry-pi-mesh-network-guide-build-a-resilient-wireless-network/

# Ensure this script is run with bash (not sh/dash)
if [ -z "$BASH_VERSION" ]; then
    exec /bin/bash "$0" "$@"
fi

set -e

# ==============================================================================
# CONFIGURABLE VARIABLES
# ==============================================================================

# Wireless interface name (usually wlan0)
WIRELESS_INTERFACE="${WIRELESS_INTERFACE:-wlan0}"

# Mesh network name (ESSID) - all nodes must use the same
MESH_ESSID="${MESH_ESSID:-nexum-mesh}"

# Mesh channel (1-11) - all nodes must use the same
MESH_CHANNEL="${MESH_CHANNEL:-6}"

# AP MAC address (BSSID) - all nodes must use the same
# Default: 02:CA:FF:EE:BA:BE (from guide)
MESH_BSSID="${MESH_BSSID:-02:CA:FF:EE:BA:BE}"

# MTU for wireless interface (B.A.T.M.A.N.-adv needs larger MTU)
WIRELESS_MTU="${WIRELESS_MTU:-1532}"

# IP address range for bat0 (format: base_network/subnet_bits)
# Default: 169.254.0.0/16 (IPv4 link-local range)
IP_RANGE="${IP_RANGE:-169.254.0.0/16}"

# Extract base network and subnet from IP_RANGE
IFS='/' read -r IP_BASE IP_CIDR <<< "$IP_RANGE"

# ==============================================================================
# FUNCTIONS
# ==============================================================================

# Calculate IP address from MAC address
# Uses last 4 hex digits of MAC to generate last 2 octets of IP for deterministic assignment
# For /16 subnet: base.x.y where x.y is derived from MAC address
calculate_ip_from_mac() {
    local interface=$1
    local mac_file="/sys/class/net/$interface/address"
    
    if [ ! -f "$mac_file" ]; then
        echo "Error: Cannot find MAC address file for interface $interface" >&2
        return 1
    fi
    
    local mac=$(cat "$mac_file" | tr -d ':' | tr '[:upper:]' '[:lower:]')
    
    if [ -z "$mac" ] || [ ${#mac} -ne 12 ]; then
        echo "Error: Invalid MAC address for interface $interface" >&2
        return 1
    fi
    
    # Extract last 4 hex digits from MAC (last 2 bytes)
    # Split into two 2-digit hex values for the last two octets
    local last_4_hex="${mac: -4}"
    local octet3_hex="${last_4_hex:0:2}"
    local octet4_hex="${last_4_hex:2:2}"
    
    # Use hash of full MAC for better distribution (reduces collision probability)
    local mac_hash=$(echo -n "$mac" | md5sum | cut -d' ' -f1)
    local hash_octet3_hex="${mac_hash:0:2}"
    
    # Combine: use hash for octet3 (better distribution), MAC bytes for octet4 (deterministic)
    # This provides good distribution while maintaining MAC-based determinism
    local octet3=$((0x$hash_octet3_hex))
    local octet4=$((0x$octet4_hex))
    
    # Avoid .0.0 (network) and .255.255 (broadcast) for /16
    if [ $octet3 -eq 0 ] && [ $octet4 -eq 0 ]; then
        octet4=1
    fi
    if [ $octet3 -eq 255 ] && [ $octet4 -eq 255 ]; then
        octet3=254
        octet4=254
    fi
    
    # Extract base network (first two octets) from IP_BASE
    IFS='.' read -r base_octet1 base_octet2 _ _ <<< "$IP_BASE"
    
    echo "$base_octet1.$base_octet2.$octet3.$octet4"
}

# Check if wireless-tools (iwconfig) is available
check_iwconfig() {
    if ! command -v iwconfig &> /dev/null; then
        echo "Error: iwconfig not found. Installing wireless-tools..."
        apt-get update
        apt-get install -y wireless-tools
    fi
}

# Check if batman-adv module is loaded
check_batman_adv() {
    if ! lsmod | grep -q "^batman_adv"; then
        echo "Loading batman-adv kernel module..."
        modprobe batman-adv
    fi
}

# ==============================================================================
# MAIN SCRIPT
# ==============================================================================

echo "========================================="
echo "Nexum Mesh Network - Basic Node Setup"
echo "========================================="
echo ""

# Check if running as root
if [ "$(id -u)" -ne 0 ]; then 
    echo "Error: This script must be run as root (use sudo)"
    exit 1
fi

# Check for iwconfig
check_iwconfig

# Check for batman-adv module
check_batman_adv

# Verify wireless interface exists
if [ ! -d "/sys/class/net/$WIRELESS_INTERFACE" ]; then
    echo "Error: Wireless interface $WIRELESS_INTERFACE not found"
    echo "Available interfaces:"
    ls /sys/class/net/ | grep -v lo
    exit 1
fi

echo "Configuration:"
echo "  Wireless interface: $WIRELESS_INTERFACE"
echo "  Mesh ESSID: $MESH_ESSID"
echo "  Mesh channel: $MESH_CHANNEL"
echo "  Mesh BSSID (AP MAC): $MESH_BSSID"
echo "  MTU: $WIRELESS_MTU"
echo "  IP range: $IP_RANGE"
echo ""

# Step 1: Turn off the Wi-Fi to change settings
echo "Step 1: Bringing down wireless interface..."
ip link set dev "$WIRELESS_INTERFACE" down || true
sleep 1

# Step 2: Set wlan0 to ad-hoc mode
echo "Step 2: Configuring interface to ad-hoc mode..."
echo "  Setting mode to ad-hoc..."
iwconfig "$WIRELESS_INTERFACE" mode ad-hoc

echo "  Setting channel to $MESH_CHANNEL..."
iwconfig "$WIRELESS_INTERFACE" channel "$MESH_CHANNEL"

echo "  Setting ESSID to '$MESH_ESSID'..."
iwconfig "$WIRELESS_INTERFACE" essid "$MESH_ESSID"

echo "  Setting AP MAC (BSSID) to $MESH_BSSID..."
iwconfig "$WIRELESS_INTERFACE" ap "$MESH_BSSID"

# Step 3: Set the MTU
echo "Step 3: Setting MTU to $WIRELESS_MTU..."
ip link set mtu "$WIRELESS_MTU" dev "$WIRELESS_INTERFACE"

# Step 4: Turn the Wi-Fi back on
echo "Step 4: Bringing up wireless interface..."
ip link set dev "$WIRELESS_INTERFACE" up

echo "Waiting for interface to stabilize..."
sleep 1

# Step 5: Create the bat0 virtual connection
echo "Step 5: Creating bat0 virtual interface..."
if ip link show bat0 &>/dev/null; then
    echo "  bat0 already exists, removing it..."
    ip link set bat0 down 2>/dev/null || true
    batctl if del "$WIRELESS_INTERFACE" 2>/dev/null || true
    ip link del bat0 2>/dev/null || true
    sleep 1
fi

ip link add name bat0 type batadv

# Step 6: Add Wi-Fi to B.A.T.M.A.N.-adv
echo "Step 6: Adding $WIRELESS_INTERFACE to B.A.T.M.A.N.-adv..."
batctl if add "$WIRELESS_INTERFACE"

# Step 7: Turn on the bat0 connection
echo "Step 7: Bringing up bat0 interface..."
ip link set up dev bat0

echo "Waiting for bat0 to stabilize..."
sleep 1

# Step 8: Assign IP address to bat0
echo "Step 8: Assigning IP address to bat0..."
NODE_IP=$(calculate_ip_from_mac "$WIRELESS_INTERFACE")
echo "  Calculated IP from MAC: $NODE_IP/$IP_CIDR"

# Remove any existing IP addresses from bat0
ip addr flush dev bat0 2>/dev/null || true

# Assign new IP address
ip addr add "$NODE_IP/$IP_CIDR" dev bat0

echo ""
echo "========================================="
echo "Basic Node Setup Complete!"
echo "========================================="
echo ""
echo "Node configuration:"
echo "  Interface: $WIRELESS_INTERFACE"
echo "  Mesh ESSID: $MESH_ESSID"
echo "  Channel: $MESH_CHANNEL"
echo "  BSSID: $MESH_BSSID"
echo "  bat0 IP: $NODE_IP/$IP_CIDR"
echo ""
echo "Next steps:"
echo "1. Verify mesh connectivity: batctl o"
echo "2. Check neighbors: batctl n"
echo "3. Test connectivity: ping <other_node_bat0_ip>"
echo ""

