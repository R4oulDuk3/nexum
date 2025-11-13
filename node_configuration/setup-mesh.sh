#!/bin/bash
# Nexum Mesh Network - Mesh Setup Script
# This script configures the mesh network on a Raspberry Pi node

set -e

echo "========================================="
echo "Nexum Mesh Network - Mesh Setup Script"
echo "========================================="
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    echo "Please run as root (use sudo)"
    exit 1
fi

# Configuration directory
CONFIG_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT_DIR="$CONFIG_DIR"

# Detect wireless interface
detect_wireless_interface() {
    local interfaces=$(iw dev | grep -E "^[[:space:]]*Interface" | awk '{print $2}')
    local count=$(echo "$interfaces" | wc -l)
    
    if [ -z "$interfaces" ]; then
        echo "Error: No wireless interfaces found!"
        exit 1
    fi
    
    if [ "$count" -eq 1 ]; then
        WIRELESS_INTERFACE=$(echo "$interfaces" | head -n1)
        echo "Detected wireless interface: $WIRELESS_INTERFACE"
    else
        echo "Multiple wireless interfaces found:"
        echo "$interfaces" | nl
        echo ""
        read -p "Enter the interface name to use for mesh: " WIRELESS_INTERFACE
    fi
}

# Get mesh network configuration
get_mesh_config() {
    echo ""
    echo "Mesh Network Configuration:"
    echo "---------------------------"
    
    read -p "Enter mesh SSID (default: nexum-mesh): " MESH_SSID
    MESH_SSID=${MESH_SSID:-nexum-mesh}
    
    read -p "Enter mesh channel (1-11, default: 6): " MESH_CHANNEL
    MESH_CHANNEL=${MESH_CHANNEL:-6}
    
    read -p "Enter mesh frequency (default: 2437): " MESH_FREQ
    MESH_FREQ=${MESH_FREQ:-2437}
    
    echo ""
    echo "Access Point Configuration:"
    echo "---------------------------"
    
    read -p "Enter AP SSID (default: Nexum-Relief): " AP_SSID
    AP_SSID=${AP_SSID:-Nexum-Relief}
    
    read -p "Enter AP password (min 8 chars, default: ReliefNet123): " AP_PASSWORD
    AP_PASSWORD=${AP_PASSWORD:-ReliefNet123}
    
    read -p "Enter AP IP address (default: 10.0.0.1): " AP_IP
    AP_IP=${AP_IP:-10.0.0.1}
    
    read -p "Enter DHCP range start (default: 10.0.0.10): " DHCP_START
    DHCP_START=${DHCP_START:-10.0.0.10}
    
    read -p "Enter DHCP range end (default: 10.0.0.250): " DHCP_END
    DHCP_END=${DHCP_END:-10.0.0.250}
}

# Stop existing services
stop_services() {
    echo ""
    echo "Stopping existing services..."
    systemctl stop batman-mesh 2>/dev/null || true
    systemctl stop hostapd 2>/dev/null || true
    systemctl stop dnsmasq 2>/dev/null || true
    
    # Bring down interfaces
    ip link set bat0 down 2>/dev/null || true
    ip link set ap0 down 2>/dev/null || true
    iw dev ap0 del 2>/dev/null || true
    batctl if del "$WIRELESS_INTERFACE" 2>/dev/null || true
    iw dev "$WIRELESS_INTERFACE" set type managed 2>/dev/null || true
}

# Configure batman-adv
configure_batman() {
    echo ""
    echo "Configuring batman-adv..."
    
    # Set batman-adv routing algorithm (BATMAN_V for better reliability)
    echo "0" > /sys/module/batman_adv/parameters/routing_algo 2>/dev/null || true
    
    # Set interface to adhoc mode
    iw dev "$WIRELESS_INTERFACE" set type ibss
    ip link set "$WIRELESS_INTERFACE" up
    
    # Join IBSS network
    iw dev "$WIRELESS_INTERFACE" ibss join "$MESH_SSID" "$MESH_FREQ" HT20
    
    # Add interface to batman-adv
    batctl if add "$WIRELESS_INTERFACE"
    ip link set up dev bat0
    
    # Configure batman-adv settings for reliability
    echo 10000 > /sys/class/net/bat0/mesh/orig_interval
    echo 5000 > /sys/class/net/bat0/mesh/bridge_loop_avoidance
    
    # Wait for interface to be ready
    sleep 2
    
    echo "batman-adv configured on $WIRELESS_INTERFACE"
}

# Configure hostapd for access point
configure_hostapd() {
    echo ""
    echo "Configuring WiFi Access Point..."
    
    # Get the phy device from the wireless interface
    # Try to get phy name from sysfs first (most reliable)
    PHY_NAME=$(basename $(readlink /sys/class/net/"$WIRELESS_INTERFACE"/phy80211 2>/dev/null) 2>/dev/null || echo "")
    
    if [ -z "$PHY_NAME" ]; then
        # Fallback: try to get from iw command
        PHY_NAME=$(iw dev "$WIRELESS_INTERFACE" info 2>/dev/null | grep -oP 'wiphy \K[0-9]+' | sed 's/^/phy/' || echo "phy0")
    fi
    
    if [ -z "$PHY_NAME" ]; then
        PHY_NAME="phy0"
    fi
    
    echo "Using PHY device: $PHY_NAME"
    
    # Remove existing ap0 interface if it exists
    ip link set ap0 down 2>/dev/null || true
    iw dev ap0 del 2>/dev/null || true
    sleep 1
    
    # Create virtual interface for AP on the same phy device
    # NOTE: Single radio limitation - IBSS and AP modes may conflict
    # Both will attempt to use the same channel, which may cause issues
    echo "Creating virtual AP interface on $PHY_NAME..."
    AP_ENABLED=true
    if ! iw phy "$PHY_NAME" interface add ap0 type __ap 2>&1; then
        echo "ERROR: Could not create virtual AP interface on $PHY_NAME"
        echo "This is likely due to single radio limitation (IBSS and AP mode conflict)"
        echo ""
        echo "Solutions:"
        echo "1. Use a USB WiFi adapter for the AP (recommended)"
        echo "2. Have clients connect directly to the mesh network via IBSS mode"
        echo "3. Use a different mesh protocol that supports AP mode"
        echo ""
        echo "Continuing with mesh-only setup (no AP)..."
        AP_ENABLED=false
        return 0
    fi
    
    echo "Virtual AP interface created successfully"
    
    # Configure the AP interface
    ip link set ap0 up
    
    # Generate hostapd config
    sed -e "s|@AP_SSID@|$AP_SSID|g" \
        -e "s|@AP_PASSWORD@|$AP_PASSWORD|g" \
        -e "s|@MESH_CHANNEL@|$MESH_CHANNEL|g" \
        -e "s|@WIRELESS_INTERFACE@|ap0|g" \
        "$SCRIPT_DIR/hostapd.conf" > /etc/hostapd/hostapd.conf
    
    # Configure hostapd to use the same channel as mesh
    echo "channel=$MESH_CHANNEL" >> /etc/hostapd/hostapd.conf
    
    # Enable hostapd
    systemctl enable hostapd
    if systemctl start hostapd; then
        # Wait for AP to start
        sleep 3
        echo "Access Point configured: $AP_SSID"
    else
        echo "Warning: Failed to start hostapd. Check logs: sudo journalctl -u hostapd -n 50"
        AP_ENABLED=false
    fi
}

# Configure dnsmasq for DHCP
configure_dnsmasq() {
    echo ""
    echo "Configuring DHCP server..."
    
    if [ "$AP_ENABLED" != true ]; then
        echo "Skipping DHCP configuration (AP not enabled)"
        return 0
    fi
    
    # Generate dnsmasq config
    sed -e "s|@AP_INTERFACE@|ap0|g" \
        -e "s|@AP_IP@|$AP_IP|g" \
        -e "s|@DHCP_START@|$DHCP_START|g" \
        -e "s|@DHCP_END@|$DHCP_END|g" \
        "$SCRIPT_DIR/dnsmasq.conf" > /etc/dnsmasq.conf
    
    # Enable dnsmasq
    systemctl enable dnsmasq
    if systemctl start dnsmasq; then
        echo "DHCP server configured: $AP_IP ($DHCP_START-$DHCP_END)"
    else
        echo "Warning: Failed to start dnsmasq. Check logs: sudo journalctl -u dnsmasq -n 50"
    fi
}

# Configure IP addressing
configure_network() {
    echo ""
    echo "Configuring network addressing..."
    
    # Configure bat0 interface with IPv4 address from mesh subnet
    # Use link-local addressing that will be managed by batman-adv
    ip addr add 169.254.0.1/16 dev bat0 2>/dev/null || true
    
    # Configure AP interface (wait for it to be ready)
    if [ "$AP_ENABLED" = true ]; then
        sleep 1
        if ! ip addr show ap0 &>/dev/null; then
            echo "Warning: ap0 interface not found. AP may not be enabled."
        else
            ip addr add "$AP_IP/24" dev ap0 2>/dev/null || {
                echo "Warning: Could not assign IP to ap0. Interface may not be ready yet."
                # Try again after a delay
                sleep 2
                ip addr add "$AP_IP/24" dev ap0 2>/dev/null || true
            }
        fi
    fi
    
    # Enable IP forwarding
    echo 1 > /proc/sys/net/ipv4/ip_forward
    
    # Make IP forwarding persistent
    if ! grep -q "net.ipv4.ip_forward=1" /etc/sysctl.conf; then
        echo "net.ipv4.ip_forward=1" >> /etc/sysctl.conf
    fi
    
    # Configure iptables for NAT and forwarding
    iptables -t nat -F
    iptables -F
    
    # NAT from AP to mesh (if AP is enabled)
    if [ "$AP_ENABLED" = true ]; then
        iptables -t nat -A POSTROUTING -o bat0 -j MASQUERADE
        iptables -A FORWARD -i ap0 -o bat0 -j ACCEPT
        iptables -A FORWARD -i bat0 -o ap0 -m state --state RELATED,ESTABLISHED -j ACCEPT
    fi
    
    # Save iptables rules
    mkdir -p /etc/iptables
    iptables-save > /etc/iptables/rules.v4
    
    # Install iptables-persistent if available
    if command -v netfilter-persistent &> /dev/null; then
        netfilter-persistent save 2>/dev/null || true
    fi
    
    echo "Network addressing configured"
}

# Create systemd service
create_service() {
    echo ""
    echo "Creating systemd service..."
    
    # Generate service file
    sed -e "s|@WIRELESS_INTERFACE@|$WIRELESS_INTERFACE|g" \
        -e "s|@MESH_SSID@|$MESH_SSID|g" \
        -e "s|@MESH_FREQ@|$MESH_FREQ|g" \
        -e "s|@SCRIPT_DIR@|$SCRIPT_DIR|g" \
        "$SCRIPT_DIR/batman-mesh.service" > /etc/systemd/system/batman-mesh.service
    
    systemctl daemon-reload
    systemctl enable batman-mesh
    
    echo "Systemd service created and enabled"
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
    echo "  AP SSID: $AP_SSID"
    echo "  AP IP: $AP_IP"
    echo ""
    read -p "Continue with setup? (y/n): " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Setup cancelled."
        exit 0
    fi
    
    # Initialize AP_ENABLED variable
    AP_ENABLED=true
    
    stop_services
    configure_batman
    configure_hostapd
    configure_dnsmasq
    configure_network
    create_service
    
    echo ""
    echo "========================================="
    echo "Mesh network setup completed!"
    echo "========================================="
    echo ""
    echo "Mesh interface: bat0"
    if [ "$AP_ENABLED" = true ]; then
        echo "Access Point: $AP_SSID"
        echo "AP IP: $AP_IP"
    else
        echo "Access Point: NOT ENABLED (single radio limitation)"
        echo "Clients can connect directly to mesh network via IBSS mode"
    fi
    echo ""
    echo "To check mesh status:"
    echo "  sudo batctl o"
    echo "  sudo batctl n"
    echo ""
    echo "To restart the mesh:"
    echo "  sudo systemctl restart batman-mesh"
}

# Run main function
main

