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

# Mesh interface name (usually wlan0) - used for mesh network
MESH_INTERFACE="${MESH_INTERFACE:-wlan0}"

# AP interface name (usually wlan1) - separate physical WiFi adapter for AP
AP_INTERFACE="${AP_INTERFACE:-wlan1}"

# Mesh channel (must match the mesh network channel)
MESH_CHANNEL="${MESH_CHANNEL:-6}"

# AP Configuration
AP_SSID="${AP_SSID:-Nexum-Relief}"
AP_PASSWORD="${AP_PASSWORD:-ReliefNet123}"
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

# Verify mesh interface exists
if [ ! -d "/sys/class/net/$MESH_INTERFACE" ]; then
    echo "Error: Mesh interface $MESH_INTERFACE not found"
    echo "Available interfaces:"
    ls /sys/class/net/ | grep -v lo
    exit 1
fi

# Verify AP interface exists (must be a separate physical interface)
if [ ! -d "/sys/class/net/$AP_INTERFACE" ]; then
    echo "Error: AP interface $AP_INTERFACE not found!"
    echo ""
    echo "This script requires a separate WiFi adapter for the Access Point."
    echo "The mesh network uses $MESH_INTERFACE, and AP needs a different interface."
    echo ""
    echo "Available interfaces:"
    ls /sys/class/net/ | grep -v lo
    echo ""
    echo "Please connect a USB WiFi adapter or specify a different interface:"
    echo "  sudo AP_INTERFACE=wlan2 ./setup-ap.sh"
    exit 1
fi

# Verify AP interface is different from mesh interface
if [ "$AP_INTERFACE" = "$MESH_INTERFACE" ]; then
    echo "Error: AP interface ($AP_INTERFACE) cannot be the same as mesh interface ($MESH_INTERFACE)"
    echo "You need a separate WiFi adapter for the Access Point."
    exit 1
fi

# Verify bat0 exists (mesh must be set up first)
if ! ip link show bat0 &>/dev/null; then
    echo "Error: bat0 interface not found!"
    echo "Please run setup-mesh.sh first to set up the mesh network."
    exit 1
fi

echo "Configuration:"
echo "  Mesh interface: $MESH_INTERFACE (used for bat0 mesh network)"
echo "  AP interface: $AP_INTERFACE (dedicated WiFi adapter for Access Point)"
echo "  Mesh channel: $MESH_CHANNEL"
echo "  AP SSID: $AP_SSID"
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

echo "Architecture:"
echo "  - $MESH_INTERFACE → bat0 (mesh network, IBSS mode)"
echo "  - $AP_INTERFACE → AP mode (separate radio, no conflicts)"
echo "  - br-ap → Bridge connecting AP clients to mesh network"
echo ""

# Stop services before setup
echo "Stopping services..."
systemctl stop hostapd 2>/dev/null || true
systemctl stop dnsmasq 2>/dev/null || true

# Configure AP interface (wlan1) for AP mode
echo "Configuring $AP_INTERFACE for Access Point mode..."

# Stop NetworkManager from managing the AP interface
if systemctl is-active --quiet NetworkManager 2>/dev/null; then
    echo "  Stopping NetworkManager on $AP_INTERFACE..."
    if command -v nmcli &> /dev/null; then
        nmcli device set "$AP_INTERFACE" managed no 2>/dev/null || true
    fi
    sleep 1
fi

# Kill wpa_supplicant if running on this interface
if pgrep -f "wpa_supplicant.*$AP_INTERFACE" > /dev/null 2>&1; then
    echo "  Stopping wpa_supplicant on $AP_INTERFACE..."
    pkill -f "wpa_supplicant.*$AP_INTERFACE" 2>/dev/null || true
    sleep 1
fi

# Disconnect any existing connections
iw dev "$AP_INTERFACE" disconnect 2>/dev/null || true

# Bring down the interface
echo "  Bringing down $AP_INTERFACE..."
ip link set "$AP_INTERFACE" down 2>/dev/null || true
sleep 1

# Set interface to AP mode
echo "  Setting $AP_INTERFACE to AP mode..."
if ! iw dev "$AP_INTERFACE" set type __ap 2>&1; then
    echo "ERROR: Could not set $AP_INTERFACE to AP mode"
    echo "Make sure the interface supports AP mode:"
    echo "  iw phy $(cat /sys/class/net/$AP_INTERFACE/phy80211/name) info | grep -A 10 'Supported interface modes'"
    exit 1
fi

# Bring interface up
ip link set "$AP_INTERFACE" up 2>/dev/null || true
sleep 1
echo "  ✓ $AP_INTERFACE configured for AP mode"

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

# Calculate IP for bridge (use MAC from mesh interface to maintain mesh identity)
BRIDGE_IP=$(calculate_ip_from_mac "$MESH_INTERFACE")

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
bind-interfaces
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
    echo "  Mesh interface: $MESH_INTERFACE (bat0 - mesh network)"
    echo "  AP interface: $AP_INTERFACE (Access Point - separate radio)"
    echo "  AP SSID: $AP_SSID"
    echo "  Bridge IP: $BRIDGE_IP/$IP_CIDR"
    echo "  DHCP range: $DHCP_START - $DHCP_END"
    echo ""
    echo "Architecture:"
    echo "  [Clients] ←WiFi AP→ [$AP_INTERFACE] ←Bridge→ [bat0] ←Mesh→ [$MESH_INTERFACE] ←Mesh→ [Other Nodes]"
    echo ""
    echo "Clients connecting to '$AP_SSID' will:"
    echo "  - Get IP addresses from DHCP ($DHCP_START - $DHCP_END)"
    echo "  - Have access to the mesh network via bridge"
    echo "  - Be able to reach other mesh nodes"
    echo ""
    echo "✓ Using separate radios - no conflicts between mesh and AP!"
    echo ""
else
    echo "Error: Failed to start hostapd or dnsmasq"
    echo "Check logs: sudo journalctl -u hostapd -u dnsmasq -n 50"
    exit 1
fi

