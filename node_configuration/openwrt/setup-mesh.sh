#!/bin/sh
# Nexum Mesh Network - OpenWrt Mesh Setup Script
# This script configures the mesh network on an OpenWrt device

set -e

echo "========================================="
echo "Nexum Mesh Network - OpenWrt Mesh Setup"
echo "========================================="
echo ""

# Check if running on OpenWrt
if [ ! -f /etc/openwrt_release ]; then
    echo "Warning: This doesn't appear to be an OpenWrt system"
    read -p "Continue anyway? (y/n): " REPLY
    if [ "$REPLY" != "y" ] && [ "$REPLY" != "Y" ]; then
        exit 1
    fi
fi

# Check if running as root
if [ "$(id -u)" -ne 0 ]; then 
    echo "Please run as root"
    exit 1
fi

# Configuration directory
CONFIG_DIR="$(cd "$(dirname "$0")" && pwd)"
SCRIPT_DIR="$CONFIG_DIR"

# Calculate IP address from MAC address (deterministic self-assignment)
calculate_ip_from_mac() {
    local interface=$1
    local mac_file="/sys/class/net/$interface/address"
    
    if [ ! -f "$mac_file" ]; then
        echo "Error: Cannot find MAC address for interface $interface"
        return 1
    fi
    
    # Get MAC address and remove colons
    mac=$(cat "$mac_file" | tr -d ':')
    
    # Extract last 2 bytes (last 4 hex characters)
    last_bytes=$(echo "$mac" | tail -c 5)
    
    # Convert hex to decimal for octet 3 and 4
    octet3=$(printf "%d" 0x$(echo "$last_bytes" | cut -c1-2))
    octet4=$(printf "%d" 0x$(echo "$last_bytes" | cut -c3-4))
    
    # Construct IP address: 169.254.X.Y
    echo "169.254.$octet3.$octet4"
}

# Detect wireless interface
detect_wireless_interface() {
    # OpenWrt typically uses radio0, radio1, etc.
    local radios=$(ls /sys/class/ieee80211/ 2>/dev/null | grep -E "^phy[0-9]+$" | wc -l)
    
    if [ "$radios" -eq 0 ]; then
        echo "Error: No wireless radios found!"
        exit 1
    fi
    
    # Check for configured radios
    if uci show wireless | grep -q "radio0"; then
        WIRELESS_INTERFACE="radio0"
        echo "Detected wireless interface: radio0"
    elif uci show wireless | grep -q "radio1"; then
        WIRELESS_INTERFACE="radio1"
        echo "Detected wireless interface: radio1"
    else
        echo "Available wireless interfaces:"
        uci show wireless | grep "=wifi-device" | cut -d'=' -f1 | cut -d'.' -f2
        echo ""
        read -p "Enter the radio interface to use (e.g., radio0): " WIRELESS_INTERFACE
    fi
}

# Get mesh network configuration
get_mesh_config() {
    echo ""
    echo "Mesh Network Configuration:"
    echo "---------------------------"
    
    printf "Enter mesh SSID (default: nexum-mesh): "
    read MESH_SSID
    MESH_SSID=${MESH_SSID:-nexum-mesh}
    
    printf "Enter mesh channel (1-11, default: 6): "
    read MESH_CHANNEL
    MESH_CHANNEL=${MESH_CHANNEL:-6}
    
    printf "Enter mesh frequency (default: 2437): "
    read MESH_FREQ
    MESH_FREQ=${MESH_FREQ:-2437}
    
    echo ""
    echo "Access Point Configuration (optional):"
    echo "--------------------------------------"
    echo "Note: Single radio limitation - AP and mesh may conflict"
    echo ""
    
    printf "Enter AP SSID (default: Nexum-Relief, or press Enter to skip AP): "
    read AP_SSID
    if [ -z "$AP_SSID" ]; then
        AP_SSID=""
        AP_ENABLED=false
    else
        AP_SSID=${AP_SSID:-Nexum-Relief}
        printf "Enter AP password (min 8 chars, default: ReliefNet123): "
        read AP_PASSWORD
        AP_PASSWORD=${AP_PASSWORD:-ReliefNet123}
        AP_ENABLED=true
    fi
}

# Configure batman-adv using UCI
configure_batman_uci() {
    echo ""
    echo "Configuring batman-adv mesh network..."
    
    # Load batman-adv module if not loaded
    if ! lsmod | grep -q batman_adv; then
        echo "Loading batman-adv kernel module..."
        insmod batman-adv 2>/dev/null || modprobe batman-adv 2>/dev/null || true
    fi
    
    # Configure wireless interface for IBSS (ad-hoc)
    echo "Configuring wireless interface for IBSS mode..."
    
    # Remove existing wireless configuration for this radio if exists
    uci delete wireless.@wifi-iface[0] 2>/dev/null || true
    
    # Create new wireless interface configuration for mesh
    uci set wireless.${WIRELESS_INTERFACE}_mesh=wifi-iface
    uci set wireless.${WIRELESS_INTERFACE}_mesh.device=$WIRELESS_INTERFACE
    uci set wireless.${WIRELESS_INTERFACE}_mesh.mode=adhoc
    uci set wireless.${WIRELESS_INTERFACE}_mesh.ssid="$MESH_SSID"
    uci set wireless.${WIRELESS_INTERFACE}_mesh.network=mesh
    uci set wireless.${WIRELESS_INTERFACE}_mesh.bssid='02:CA:FF:EE:BA:BE'
    uci set wireless.${WIRELESS_INTERFACE}_mesh.encryption=none
    
    # Configure radio settings
    uci set wireless.$WIRELESS_INTERFACE.channel="$MESH_CHANNEL"
    uci set wireless.$WIRELESS_INTERFACE.hwmode='11g'
    uci set wireless.$WIRELESS_INTERFACE.htmode='HT20'
    
    # Commit wireless configuration
    uci commit wireless
    
    # Configure network interface
    echo "Configuring network interface..."
    
    # Remove existing mesh network if exists
    uci delete network.mesh 2>/dev/null || true
    
    # Create mesh network
    uci set network.mesh=interface
    uci set network.mesh.proto='none'
    uci set network.mesh.ifname='bat0'
    
    # Commit network configuration
    uci commit network
    
    echo "batman-adv mesh network configured"
}

# Configure batman-adv interface
configure_batman_interface() {
    echo ""
    echo "Configuring batman-adv interface..."
    
    # Wait for wireless interface to be created
    sleep 2
    
    # Find the wireless interface created by netifd
    WLAN_IF=$(uci show wireless | grep "device='$WIRELESS_INTERFACE'" | grep "mode='adhoc'" | head -1 | cut -d'.' -f2)
    
    if [ -z "$WLAN_IF" ]; then
        # Try to find any wireless interface
        WLAN_IF=$(ip link show | grep -oE "wlan[0-9]+" | head -1)
    fi
    
    if [ -z "$WLAN_IF" ]; then
        echo "Warning: Could not detect wireless interface name"
        echo "Please manually configure batman-adv interface:"
        echo "  batctl if add <wireless_interface>"
        return 1
    fi
    
    echo "Detected wireless interface: $WLAN_IF"
    
    # Bring interface up
    ip link set "$WLAN_IF" up 2>/dev/null || true
    
    # Add interface to batman-adv
    batctl if add "$WLAN_IF" 2>/dev/null || true
    
    # Bring bat0 up
    ip link set bat0 up 2>/dev/null || true
    
    # Configure batman-adv settings
    if [ -f /sys/class/net/bat0/mesh/orig_interval ]; then
        echo 10000 > /sys/class/net/bat0/mesh/orig_interval
    fi
    if [ -f /sys/class/net/bat0/mesh/bridge_loop_avoidance ]; then
        echo 5000 > /sys/class/net/bat0/mesh/bridge_loop_avoidance
    fi
    
    echo "batman-adv interface configured"
}

# Configure IP addressing
configure_network() {
    echo ""
    echo "Configuring network addressing (MAC-based self-assigned IPv4)..."
    
    # Calculate IP from MAC address
    if [ -f /sys/class/net/bat0/address ]; then
        BAT0_IP=$(calculate_ip_from_mac bat0)
    else
        # Fall back to first wireless interface
        WLAN_IF=$(ip link show | grep -oE "wlan[0-9]+" | head -1)
        if [ -n "$WLAN_IF" ] && [ -f /sys/class/net/$WLAN_IF/address ]; then
            BAT0_IP=$(calculate_ip_from_mac $WLAN_IF)
        else
            BAT0_IP="169.254.1.1"
        fi
    fi
    
    if [ -z "$BAT0_IP" ]; then
        echo "Warning: Could not calculate IP from MAC address"
        BAT0_IP="169.254.1.1"
    fi
    
    echo "Calculated IP from MAC address: $BAT0_IP"
    
    # Configure IP address on bat0
    ip addr flush dev bat0 2>/dev/null || true
    ip addr add "$BAT0_IP/16" dev bat0 2>/dev/null || true
    
    # Enable IP forwarding
    echo 1 > /proc/sys/net/ipv4/ip_forward
    
    # Configure iptables
    iptables -t nat -F 2>/dev/null || true
    iptables -F 2>/dev/null || true
    iptables -A FORWARD -i bat0 -o bat0 -j ACCEPT 2>/dev/null || true
    
    echo "Network addressing configured: $BAT0_IP"
}

# Configure Access Point (if enabled)
configure_ap() {
    if [ "$AP_ENABLED" != "true" ] || [ -z "$AP_SSID" ]; then
        return 0
    fi
    
    echo ""
    echo "Configuring Access Point (experimental on single radio)..."
    echo "Note: AP and mesh on single radio may conflict"
    
    # Create AP interface on a different radio if available
    # For single radio, this will likely fail
    if uci show wireless | grep -q "radio1"; then
        AP_RADIO="radio1"
    else
        AP_RADIO="$WIRELESS_INTERFACE"
    fi
    
    uci set wireless.${AP_RADIO}_ap=wifi-iface
    uci set wireless.${AP_RADIO}_ap.device=$AP_RADIO
    uci set wireless.${AP_RADIO}_ap.mode=ap
    uci set wireless.${AP_RADIO}_ap.ssid="$AP_SSID"
    uci set wireless.${AP_RADIO}_ap.encryption=psk2
    uci set wireless.${AP_RADIO}_ap.key="$AP_PASSWORD"
    uci set wireless.${AP_RADIO}_ap.network=lan
    
    uci commit wireless
    
    echo "Access Point configured (may conflict with mesh on same radio)"
}

# Restart services
restart_services() {
    echo ""
    echo "Restarting network services..."
    
    # Restart wireless
    wifi reload || /etc/init.d/network reload || true
    
    sleep 3
    
    # Restart network
    /etc/init.d/network restart || true
    
    echo "Services restarted"
}

# Main execution
main() {
    detect_wireless_interface
    get_mesh_config
    
    echo ""
    echo "Configuration summary:"
    echo "  Wireless interface: $WIRELESS_INTERFACE"
    echo "  Mesh SSID: $MESH_SSID"
    echo "  Mesh channel: $MESH_CHANNEL"
    if [ "$AP_ENABLED" = "true" ] && [ -n "$AP_SSID" ]; then
        echo "  AP SSID: $AP_SSID"
    else
        echo "  AP: Disabled"
    fi
    echo ""
    printf "Continue with setup? (y/n): "
    read REPLY
    if [ "$REPLY" != "y" ] && [ "$REPLY" != "Y" ]; then
        echo "Setup cancelled."
        exit 0
    fi
    
    configure_batman_uci
    configure_ap
    restart_services
    sleep 2
    configure_batman_interface
    configure_network
    
    echo ""
    echo "========================================="
    echo "Mesh network setup completed!"
    echo "========================================="
    echo ""
    echo "Mesh interface: bat0"
    echo "IP addressing: MAC-based self-assigned IPv4 (169.254.0.0/16)"
    echo ""
    echo "To check mesh status:"
    echo "  batctl o"
    echo "  batctl n"
    echo ""
    echo "To restart:"
    echo "  /etc/init.d/network restart"
    echo ""
}

main

