#!/bin/bash
# Nexum Mesh Network - Access Point Setup Script
# This script sets up a Wi-Fi Access Point bridged with the mesh network
# Following: https://meshunderground.com/posts/raspberry-pi-mesh-network-guide-build-a-resilient-wireless-network/

# Ensure this script is run with bash (not sh/dash)
if [ -z "$BASH_VERSION" ]; then
    exec /bin/bash "$0" "$@"
fi

set -e

# ==============================================================================
# CONFIGURABLE VARIABLES
# ==============================================================================

# Wireless interface name (usually wlan0) - same as used for mesh
WIRELESS_INTERFACE="${WIRELESS_INTERFACE:-wlan0}"

# Mesh channel (must match the mesh network channel)
MESH_CHANNEL="${MESH_CHANNEL:-6}"

# AP Configuration
AP_SSID="${AP_SSID:-Nexum-Relief}"
AP_PASSWORD="${AP_PASSWORD:-ReliefNet123}"
AP_INTERFACE="ap0"  # Virtual AP interface on same phy
BRIDGE_INTERFACE="br-ap"  # Bridge for AP and mesh

# IP address range (must match mesh network)
IP_RANGE="${IP_RANGE:-169.254.0.0/16}"

# Extract base network and subnet from IP_RANGE
IFS='/' read -r IP_BASE IP_CIDR <<< "$IP_RANGE"

# ==============================================================================
# FUNCTIONS
# ==============================================================================

# Calculate IP address from MAC address
# Uses last 2 bytes of MAC address for IP octets 3 and 4
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
    local last_bytes="${mac: -4}"
    
    # Convert hex to decimal for octet 3 and 4
    local octet3=$((0x${last_bytes:0:2}))
    local octet4=$((0x${last_bytes:2:2}))
    
    # Extract base network (first two octets) from IP_BASE
    IFS='.' read -r base_octet1 base_octet2 _ _ <<< "$IP_BASE"
    
    echo "$base_octet1.$base_octet2.$octet3.$octet4"
}

# ==============================================================================
# MAIN SCRIPT
# ==============================================================================

echo "========================================="
echo "Nexum Mesh Network - Access Point Setup"
echo "========================================="
echo ""

# Check if running as root
if [ "$(id -u)" -ne 0 ]; then 
    echo "Error: This script must be run as root (use sudo)"
    exit 1
fi

# Verify wireless interface exists
if [ ! -d "/sys/class/net/$WIRELESS_INTERFACE" ]; then
    echo "Error: Wireless interface $WIRELESS_INTERFACE not found"
    echo "Available interfaces:"
    ls /sys/class/net/ | grep -v lo
    exit 1
fi

# Verify bat0 exists (mesh must be set up first)
if ! ip link show bat0 &>/dev/null; then
    echo "Error: bat0 interface not found!"
    echo "Please run setup-mesh.sh first to set up the mesh network."
    exit 1
fi

echo "Configuration:"
echo "  Wireless interface: $WIRELESS_INTERFACE"
echo "  Mesh channel: $MESH_CHANNEL"
echo "  AP SSID: $AP_SSID"
echo "  AP interface: $AP_INTERFACE"
echo "  Bridge interface: $BRIDGE_INTERFACE"
echo "  IP range: $IP_RANGE"
echo ""

# Prompt for AP configuration if not set via env vars
if [ -z "$AP_SSID" ] || [ "$AP_SSID" = "Nexum-Relief" ]; then
    echo "Enter AP SSID (default: $AP_SSID): "
    read -t 10 AP_SSID_INPUT || AP_SSID_INPUT=""
    AP_SSID=${AP_SSID_INPUT:-$AP_SSID}
fi

if [ -z "$AP_PASSWORD" ] || [ "$AP_PASSWORD" = "ReliefNet123" ]; then
    echo "Enter AP password (default: $AP_PASSWORD): "
    read -t 10 AP_PASSWORD_INPUT || AP_PASSWORD_INPUT=""
    AP_PASSWORD=${AP_PASSWORD_INPUT:-$AP_PASSWORD}
fi

echo ""
echo "Note: Using same WiFi interface for both mesh and AP"
echo "This creates a virtual AP interface on the same radio"
echo ""

# Stop services before setup
echo "Stopping services..."
systemctl stop hostapd 2>/dev/null || true
systemctl stop dnsmasq 2>/dev/null || true

# Get the phy device from the wireless interface
PHY_NAME=$(basename $(readlink /sys/class/net/"$WIRELESS_INTERFACE"/phy80211 2>/dev/null) 2>/dev/null || echo "")
if [ -z "$PHY_NAME" ]; then
    PHY_NAME=$(iw dev "$WIRELESS_INTERFACE" info 2>/dev/null | grep -oP 'wiphy \K[0-9]+' | sed 's/^/phy/' || echo "phy0")
fi

echo "Using PHY device: $PHY_NAME"

# Remove existing AP interface if it exists
echo "Removing existing AP interface if present..."
ip link set "$AP_INTERFACE" down 2>/dev/null || true
iw dev "$AP_INTERFACE" del 2>/dev/null || true
sleep 1

# Create virtual AP interface on the same phy device
echo "Creating virtual AP interface $AP_INTERFACE on $PHY_NAME..."
if ! iw phy "$PHY_NAME" interface add "$AP_INTERFACE" type __ap 2>&1; then
    echo "ERROR: Could not create virtual AP interface"
    echo "Single radio limitation: IBSS and AP modes may conflict"
    echo "This may happen if the interface doesn't support virtual interfaces"
    exit 1
fi

# Remove existing bridge if it exists
echo "Removing existing bridge if present..."
ip link set "$BRIDGE_INTERFACE" down 2>/dev/null || true
brctl delbr "$BRIDGE_INTERFACE" 2>/dev/null || true
sleep 1

# Create bridge br-ap
echo "Creating bridge $BRIDGE_INTERFACE..."
brctl addbr "$BRIDGE_INTERFACE"

# Add bat0 and AP interface to bridge
echo "Adding bat0 to bridge..."
brctl addif "$BRIDGE_INTERFACE" bat0

echo "Adding $AP_INTERFACE to bridge..."
brctl addif "$BRIDGE_INTERFACE" "$AP_INTERFACE"

# Remove IPs from bat0 and AP interface (IP goes on bridge)
echo "Removing IPs from bat0 and $AP_INTERFACE (IP will be on bridge)..."
ip addr flush dev bat0 2>/dev/null || true
ip addr flush dev "$AP_INTERFACE" 2>/dev/null || true

# Calculate IP for bridge (use MAC from bat0 or wireless interface)
if [ -f /sys/class/net/bat0/address ]; then
    BRIDGE_IP=$(calculate_ip_from_mac bat0)
else
    BRIDGE_IP=$(calculate_ip_from_mac "$WIRELESS_INTERFACE")
fi

# Set IP on bridge (this is the AP node's address on the mesh)
echo "Setting IP address $BRIDGE_IP/$IP_CIDR on bridge..."
ip addr add "$BRIDGE_IP/$IP_CIDR" dev "$BRIDGE_INTERFACE"

# Bring up interfaces
ip link set "$AP_INTERFACE" up
ip link set "$BRIDGE_INTERFACE" up

# Configure hostapd using template file
echo "Configuring hostapd..."
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOSTAPD_CONF_TEMPLATE="$SCRIPT_DIR/hostapd.conf"

if [ ! -f "$HOSTAPD_CONF_TEMPLATE" ]; then
    echo "Error: hostapd.conf template not found at $HOSTAPD_CONF_TEMPLATE"
    echo "Please ensure hostapd.conf exists in the same directory as setup-ap.sh"
    exit 1
fi

# Replace template variables with actual values
sed -e "s|@AP_SSID@|$AP_SSID|g" \
    -e "s|@AP_PASSWORD@|$AP_PASSWORD|g" \
    -e "s|@MESH_CHANNEL@|$MESH_CHANNEL|g" \
    -e "s|@WIRELESS_INTERFACE@|$AP_INTERFACE|g" \
    "$HOSTAPD_CONF_TEMPLATE" > /etc/hostapd/hostapd.conf

# Configure dnsmasq for AP clients
echo "Configuring dnsmasq..."
# Extract network base for DHCP range
IFS='.' read -r b1 b2 b3 b4 <<< "$BRIDGE_IP"
DHCP_START="$b1.$b2.$b3.100"
DHCP_END="$b1.$b2.$b3.200"

cat > /etc/dnsmasq.conf <<EOF
# Nexum Mesh AP DHCP Configuration
interface=$BRIDGE_INTERFACE
dhcp-range=$DHCP_START,$DHCP_END,255.255.255.0,12h
dhcp-option=3,$BRIDGE_IP
dhcp-option=6,$BRIDGE_IP
server=8.8.8.8
server=8.8.4.4
EOF

# Enable and start services
echo "Enabling and starting services..."
systemctl enable hostapd
systemctl enable dnsmasq

if systemctl start hostapd && systemctl start dnsmasq; then
    sleep 2
    echo ""
    echo "========================================="
    echo "Access Point configured successfully!"
    echo "========================================="
    echo ""
    echo "AP Configuration:"
    echo "  AP SSID: $AP_SSID"
    echo "  Bridge IP: $BRIDGE_IP/$IP_CIDR"
    echo "  DHCP range: $DHCP_START - $DHCP_END"
    echo ""
    echo "Clients connecting to '$AP_SSID' will:"
    echo "  - Get IP addresses from DHCP ($DHCP_START - $DHCP_END)"
    echo "  - Have access to the mesh network via bridge"
    echo "  - Be able to reach other mesh nodes"
    echo ""
else
    echo "Error: Failed to start hostapd or dnsmasq"
    echo "Check logs: sudo journalctl -u hostapd -u dnsmasq -n 50"
    exit 1
fi

