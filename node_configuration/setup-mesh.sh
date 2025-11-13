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
    echo "Access Point Configuration (optional):"
    echo "--------------------------------------"
    echo "Note: Single radio limitation - AP and mesh may conflict"
    echo ""
    
    read -p "Enter AP SSID (default: Nexum-Relief, or press Enter to skip AP): " AP_SSID
    if [ -z "$AP_SSID" ]; then
        AP_SSID=""
        AP_ENABLED=false
    else
        AP_SSID=${AP_SSID:-Nexum-Relief}
        read -p "Enter AP password (min 8 chars, default: ReliefNet123): " AP_PASSWORD
        AP_PASSWORD=${AP_PASSWORD:-ReliefNet123}
        AP_ENABLED=true
    fi
}

# Stop existing services
stop_services() {
    echo ""
    echo "Stopping existing services..."
    systemctl stop batman-mesh 2>/dev/null || true
    systemctl stop hostapd 2>/dev/null || true
    
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
    echo "Configuring batman-adv mesh network..."
    
    # Check if batman-adv module is loaded
    if ! lsmod | grep -q batman_adv; then
        echo "Loading batman-adv kernel module..."
        modprobe batman-adv
    fi
    
    # Set batman-adv routing algorithm (BATMAN_V for better reliability)
    if [ -f /sys/module/batman_adv/parameters/routing_algo ]; then
        echo "0" > /sys/module/batman_adv/parameters/routing_algo 2>/dev/null || true
    fi
    
    # Set interface to adhoc mode
    iw dev "$WIRELESS_INTERFACE" set type ibss
    ip link set "$WIRELESS_INTERFACE" up
    
    # Join IBSS network
    iw dev "$WIRELESS_INTERFACE" ibss join "$MESH_SSID" "$MESH_FREQ" HT20
    
    # Wait a moment for IBSS to stabilize
    sleep 2
    
    # Add interface to batman-adv
    batctl if add "$WIRELESS_INTERFACE"
    ip link set up dev bat0
    
    # Configure batman-adv settings for reliability
    if [ -f /sys/class/net/bat0/mesh/orig_interval ]; then
        echo 10000 > /sys/class/net/bat0/mesh/orig_interval
    fi
    if [ -f /sys/class/net/bat0/mesh/bridge_loop_avoidance ]; then
        echo 5000 > /sys/class/net/bat0/mesh/bridge_loop_avoidance
    fi
    
    # Wait for interface to be ready
    sleep 2
    
    # batman-adv will automatically assign IPv4 link-local addresses (169.254.0.0/16)
    # No manual IP assignment needed - addresses are self-assigned
    echo "batman-adv configured on $WIRELESS_INTERFACE"
    echo "Mesh interface bat0 will use self-assigned IPv4 link-local addresses (169.254.0.0/16)"
}

# Configure hostapd for access point
configure_hostapd() {
    if [ "$AP_ENABLED" != true ] || [ -z "$AP_SSID" ]; then
        echo ""
        echo "Skipping AP configuration (AP disabled or not configured)"
        AP_ENABLED=false
        return 0
    fi
    
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
        echo "Note: AP uses self-assigned IPv4 link-local addresses (169.254.0.0/16)"
        echo "Clients must manually configure IP addresses in the 169.254.0.0/16 range"
    else
        echo "Warning: Failed to start hostapd. Check logs: sudo journalctl -u hostapd -n 50"
        AP_ENABLED=false
    fi
}

# DHCP configuration removed - using self-assigned IPv4 link-local addresses
# No DHCP server needed as all IPs are self-assigned

# Configure IP addressing (self-assigned IPv4 link-local)
configure_network() {
    echo ""
    echo "Configuring network addressing (self-assigned IPv4)..."
    
    # batman-adv automatically assigns IPv4 link-local addresses (169.254.0.0/16)
    # No manual IP assignment needed - addresses are self-assigned by the kernel
    # The bat0 interface will automatically get a link-local address
    
    # Enable IPv4 link-local address assignment if not already enabled
    if [ -f /proc/sys/net/ipv4/conf/bat0/accept_link_local ]; then
        echo 1 > /proc/sys/net/ipv4/conf/bat0/accept_link_local
    fi
    
    # Configure AP interface with link-local address (if AP is enabled)
    if [ "$AP_ENABLED" = true ]; then
        sleep 2
        if ip addr show ap0 &>/dev/null; then
            # Enable IPv4 link-local address assignment on AP interface
            if [ -f /proc/sys/net/ipv4/conf/ap0/accept_link_local ]; then
                echo 1 > /proc/sys/net/ipv4/conf/ap0/accept_link_local
            fi
            # The kernel will automatically assign a link-local address
            echo "AP interface ap0 will use self-assigned IPv4 link-local address"
        else
            echo "Warning: ap0 interface not found. AP may not be enabled."
        fi
    fi
    
    # Enable IP forwarding for mesh routing
    echo 1 > /proc/sys/net/ipv4/ip_forward
    
    # Make IP forwarding persistent
    if ! grep -q "net.ipv4.ip_forward=1" /etc/sysctl.conf; then
        echo "net.ipv4.ip_forward=1" >> /etc/sysctl.conf
    fi
    
    # Enable link-local address assignment globally
    for iface in /proc/sys/net/ipv4/conf/*/accept_link_local; do
        if [ -f "$iface" ]; then
            echo 1 > "$iface" 2>/dev/null || true
        fi
    done
    
    # Configure iptables for forwarding between interfaces
    iptables -t nat -F
    iptables -F
    
    # Allow forwarding between bat0 and other interfaces
    iptables -A FORWARD -i bat0 -o bat0 -j ACCEPT
    
    # If AP is enabled, allow forwarding between AP and mesh
    if [ "$AP_ENABLED" = true ]; then
        iptables -A FORWARD -i ap0 -o bat0 -j ACCEPT
        iptables -A FORWARD -i bat0 -o ap0 -j ACCEPT
    fi
    
    # Save iptables rules
    mkdir -p /etc/iptables
    iptables-save > /etc/iptables/rules.v4
    
    # Install iptables-persistent if available
    if command -v netfilter-persistent &> /dev/null; then
        netfilter-persistent save 2>/dev/null || true
    fi
    
    echo "Network addressing configured (self-assigned IPv4 link-local: 169.254.0.0/16)"
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
    if [ "$AP_ENABLED" = true ] && [ -n "$AP_SSID" ]; then
        echo "  AP SSID: $AP_SSID"
    else
        echo "  AP: Disabled"
    fi
    echo "  IP addressing: Self-assigned IPv4 link-local (169.254.0.0/16)"
    echo "  DHCP: Disabled (no DHCP server)"
    echo ""
    read -p "Continue with setup? (y/n): " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Setup cancelled."
        exit 0
    fi
    
    stop_services
    configure_batman
    configure_hostapd
    configure_network
    create_service
    
    echo ""
    echo "========================================="
    echo "Mesh network setup completed!"
    echo "========================================="
    echo ""
    echo "Mesh interface: bat0"
    echo "IP addressing: Self-assigned IPv4 link-local (169.254.0.0/16)"
    echo "DHCP: Disabled (all IPs are self-assigned)"
    echo ""
    if [ "$AP_ENABLED" = true ] && [ -n "$AP_SSID" ]; then
        echo "Access Point: $AP_SSID"
        echo "AP IP: Self-assigned IPv4 link-local (169.254.0.0/16)"
        echo "Note: Clients must manually configure IP addresses in 169.254.0.0/16 range"
    else
        echo "Access Point: NOT ENABLED"
        echo "Clients can connect directly to mesh network via IBSS mode"
    fi
    echo ""
    echo "To check mesh status:"
    echo "  sudo batctl o          # Show originators (other mesh nodes)"
    echo "  sudo batctl n          # Show neighbors"
    echo "  sudo batctl m          # Show mesh topology"
    echo "  ip addr show bat0      # Show self-assigned IP address"
    echo ""
    echo "To check IP addresses:"
    echo "  ip addr show bat0      # Mesh interface IP"
    if [ "$AP_ENABLED" = true ]; then
        echo "  ip addr show ap0       # AP interface IP"
    fi
    echo ""
    echo "To restart the mesh:"
    echo "  sudo systemctl restart batman-mesh"
}

# Run main function
main

