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

# MTU for wireless interface (using standard 1500, B.A.T.M.A.N.-adv works fine with this)
WIRELESS_MTU="${WIRELESS_MTU:-1500}"

# IP address range for bat0 (format: base_network/subnet_bits)
# Default: 169.254.0.0/16 (IPv4 link-local range)
IP_RANGE="${IP_RANGE:-169.254.0.0/16}"

# Extract base network and subnet from IP_RANGE
IFS='/' read -r IP_BASE IP_CIDR <<< "$IP_RANGE"

# ==============================================================================
# FUNCTIONS
# ==============================================================================

# Calculate IP address from MAC address
# Uses last 2 bytes of MAC address for IP octets 3 and 4
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
    
    # Extract last 2 bytes (last 4 hex characters)
    # MAC format: aabbccddeeff -> extract "eeff"
    local last_bytes="${mac: -4}"
    
    # Convert hex to decimal for octet 3 and 4
    local octet3=$((0x${last_bytes:0:2}))
    local octet4=$((0x${last_bytes:2:2}))
    
    # Extract base network (first two octets) from IP_BASE
    IFS='.' read -r base_octet1 base_octet2 _ _ <<< "$IP_BASE"
    
    echo "$base_octet1.$base_octet2.$octet3.$octet4"
}

# Calculate frequency from channel
channel_to_frequency() {
    local channel=$1
    case "$channel" in
        1) echo "2412" ;;
        2) echo "2417" ;;
        3) echo "2422" ;;
        4) echo "2427" ;;
        5) echo "2432" ;;
        6) echo "2437" ;;
        7) echo "2442" ;;
        8) echo "2447" ;;
        9) echo "2452" ;;
        10) echo "2457" ;;
        11) echo "2462" ;;
        *)
            echo "2437"  # Default to channel 6
            ;;
    esac
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

# Check if batman-adv module is loaded
if ! lsmod | grep -q "^batman_adv"; then
    echo "Loading batman-adv kernel module..."
    modprobe batman-adv
fi

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

# Step 1: Find your Wi-Fi connection name, usually wlan0
echo "Step 1: Using wireless interface: $WIRELESS_INTERFACE"

# Step 2: Stop services that might be using the interface
echo "Step 2: Stopping services that might be using the interface..."

# Stop NetworkManager from managing the interface
if systemctl is-active --quiet NetworkManager 2>/dev/null; then
    echo "  Stopping NetworkManager on $WIRELESS_INTERFACE..."
    if command -v nmcli &> /dev/null; then
        nmcli device set "$WIRELESS_INTERFACE" managed no 2>/dev/null || true
    fi
    # Give NetworkManager time to release the interface
    sleep 1
fi

# Kill wpa_supplicant if running on this interface
if pgrep -f "wpa_supplicant.*$WIRELESS_INTERFACE" > /dev/null 2>&1; then
    echo "  Stopping wpa_supplicant on $WIRELESS_INTERFACE..."
    pkill -f "wpa_supplicant.*$WIRELESS_INTERFACE" 2>/dev/null || true
    sleep 1
fi

# Disconnect any existing connections
iw dev "$WIRELESS_INTERFACE" disconnect 2>/dev/null || true

# Step 3: Turn off the Wi-Fi to change settings
echo "Step 3: Turning off Wi-Fi to change settings..."
ip link set dev "$WIRELESS_INTERFACE" down
sleep 1

# Step 4: Set wlan0 to ad-hoc mode
# All nodes must use the same channel and ESSID (mesh name)
# The ap address (BSSID) should also be the same
echo "Step 4: Setting $WIRELESS_INTERFACE to ad-hoc (IBSS) mode..."

# Set interface type to IBSS (ad-hoc mode)
if ! iw dev "$WIRELESS_INTERFACE" set type ibss 2>&1; then
    echo "Error: Failed to set interface to IBSS mode (device or resource busy)"
    echo ""
    echo "The interface may still be in use. Try manually:"
    echo "  1. sudo nmcli device set $WIRELESS_INTERFACE managed no"
    echo "  2. sudo pkill -f wpa_supplicant"
    echo "  3. sudo ip link set $WIRELESS_INTERFACE down"
    echo "  4. sudo iw dev $WIRELESS_INTERFACE set type ibss"
    echo ""
    echo "Then run this script again."
    exit 1
fi

# Set country code (required for some drivers to enable channels)
iw reg set US 2>/dev/null || iw reg set 00 2>/dev/null || true

# Calculate frequency from channel
MESH_FREQ=$(channel_to_frequency "$MESH_CHANNEL")
echo "  Channel $MESH_CHANNEL = frequency $MESH_FREQ MHz"

# Set the MTU (Maximum Transmission Unit) for wlan0
# Using standard MTU 1500 (B.A.T.M.A.N.-adv works fine with this)
echo "Step 5: Setting MTU to $WIRELESS_MTU..."
ip link set mtu "$WIRELESS_MTU" dev "$WIRELESS_INTERFACE" 2>/dev/null || {
    echo "  Warning: Failed to set MTU, using device default"
}

# Turn the Wi-Fi back on
echo "Step 6: Turning the Wi-Fi back on..."
ip link set dev "$WIRELESS_INTERFACE" up

# Wait a second for it to start
echo "Waiting a second for interface to start..."
sleep 1

# Join IBSS network with ESSID, frequency, and BSSID
# Using modern iw command instead of iwconfig
echo "Step 7: Joining IBSS network..."
echo "  ESSID: $MESH_ESSID"
echo "  Channel: $MESH_CHANNEL (frequency: $MESH_FREQ MHz)"
echo "  BSSID: $MESH_BSSID"

# Try to join IBSS network with BSSID
# Note: iw doesn't directly support setting BSSID in ibss join, so we'll join first
# and then the BSSID will be set by the mesh protocol
if ! iw dev "$WIRELESS_INTERFACE" ibss join "$MESH_ESSID" "$MESH_FREQ" 2>&1; then
    echo "Error: Failed to join IBSS network"
    echo "Troubleshooting:"
    echo "1. Check if interface supports IBSS mode:"
    echo "   iw phy $(cat /sys/class/net/$WIRELESS_INTERFACE/phy80211/name) info | grep -A 10 'Supported interface modes'"
    echo "2. Try a different channel (1, 6, or 11 are most compatible)"
    exit 1
fi

# Wait a moment for IBSS to stabilize
sleep 1

# Step 8: Create the bat0 virtual connection
# Your system will use this to talk over the mesh
echo "Step 8: Creating bat0 virtual interface..."
if ip link show bat0 &>/dev/null; then
    echo "  bat0 already exists, removing it..."
    ip link set bat0 down 2>/dev/null || true
    batctl if del "$WIRELESS_INTERFACE" 2>/dev/null || true
    ip link del bat0 2>/dev/null || true
    sleep 1
fi
ip link add name bat0 type batadv

# Step 9: Add your Wi-Fi (wlan0) to B.A.T.M.A.N.-adv, linking it to bat0
echo "Step 9: Adding $WIRELESS_INTERFACE to B.A.T.M.A.N.-adv..."
if ! batctl if add "$WIRELESS_INTERFACE" 2>&1; then
    echo "Error: Failed to add interface to batman-adv"
    echo "Check that:"
    echo "  1. batman-adv module is loaded: lsmod | grep batman_adv"
    echo "  2. $WIRELESS_INTERFACE is in IBSS mode: iw dev $WIRELESS_INTERFACE info"
    echo "  3. bat0 was created: ip link show bat0"
    exit 1
fi

# Step 10: Turn on the bat0 connection
echo "Step 10: Turning on bat0 connection..."
ip link set up dev bat0

# Waiting a second can help
echo "Waiting a second for bat0 to stabilize..."
sleep 1

# Step 11: Give a unique IP address to bat0 on each node
# These IPs will be in the same group (subnet)
echo "Step 11: Assigning unique IP address to bat0..."
NODE_IP=$(calculate_ip_from_mac "$WIRELESS_INTERFACE")
echo "  Calculated IP from MAC: $NODE_IP/$IP_CIDR"

# Remove any existing IP addresses from bat0
ip addr flush dev bat0 2>/dev/null || true

# Assign the MAC-based IP address to bat0
if ip addr add "$NODE_IP/$IP_CIDR" dev bat0 2>/dev/null; then
    echo "  Assigned IP address $NODE_IP/$IP_CIDR to bat0"
else
    echo "Warning: Could not assign IP address to bat0 (may already be assigned)"
    # Show current IP if any
    ip addr show bat0 | grep "inet " || echo "  No IP address found on bat0"
fi

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
echo "If you see 'Error - Interface bat0 is not present...', check that:"
echo "  - batman-adv module is loaded: lsmod | grep batman_adv"
echo "  - $WIRELESS_INTERFACE is in ad-hoc mode: iw dev $WIRELESS_INTERFACE info"
echo "  - bat0 was created: ip link show bat0"
echo "  - $WIRELESS_INTERFACE was added to B.A.T.M.A.N.-adv: batctl if"
echo "  - bat0 is up: ip link show bat0"
echo ""

