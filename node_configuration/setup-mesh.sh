#!/bin/bash
# Nexum Mesh Network - Mesh Setup Script
# This script configures the mesh network on a Raspberry Pi node

# Ensure this script is run with bash (not sh/dash)
# This check must come before any bash-specific features
if [ -z "$BASH_VERSION" ]; then
    exec /bin/bash "$0" "$@"
fi

set -e

echo "========================================="
echo "Nexum Mesh Network - Mesh Setup Script"
echo "========================================="
echo ""

# Check if running as root
if [ "$(id -u)" -ne 0 ]; then 
    echo "Please run as root (use sudo)"
    exit 1
fi

# Configuration directory
CONFIG_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT_DIR="$CONFIG_DIR"

# Calculate IP address from MAC address (deterministic self-assignment)
# Uses last 2 bytes of MAC address for IP octets 3 and 4
# Range: 169.254.0.0/16 (link-local)
calculate_ip_from_mac() {
    local interface=$1
    local mac_file="/sys/class/net/$interface/address"
    
    if [ ! -f "$mac_file" ]; then
        echo "Error: Cannot find MAC address for interface $interface"
        return 1
    fi
    
    # Get MAC address and remove colons
    local mac=$(cat "$mac_file" | tr -d ':')
    
    # Extract last 2 bytes (last 4 hex characters)
    # MAC format: aabbccddeeff -> extract "eeff"
    local last_bytes="${mac: -4}"
    
    # Convert hex to decimal for octet 3 and 4
    local octet3=$((0x${last_bytes:0:2}))
    local octet4=$((0x${last_bytes:2:2}))
    
    # Construct IP address: 169.254.X.Y
    echo "169.254.$octet3.$octet4"
}

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
    
    # Stop NetworkManager from managing the interface
    if systemctl is-active --quiet NetworkManager 2>/dev/null; then
        echo "Stopping NetworkManager on $WIRELESS_INTERFACE..."
        if command -v nmcli &> /dev/null; then
            nmcli device set "$WIRELESS_INTERFACE" managed no 2>/dev/null || true
        else
            echo "Warning: nmcli not found, cannot unmanage interface in NetworkManager"
            echo "You may need to manually disable NetworkManager for $WIRELESS_INTERFACE"
        fi
        # Give NetworkManager time to release the interface
        sleep 1
    fi
    
    # Kill wpa_supplicant if running on this interface
    if pgrep -f "wpa_supplicant.*$WIRELESS_INTERFACE" > /dev/null 2>&1; then
        echo "Stopping wpa_supplicant on $WIRELESS_INTERFACE..."
        pkill -f "wpa_supplicant.*$WIRELESS_INTERFACE" 2>/dev/null || true
        sleep 1
    fi
    
    # Bring down interfaces and remove from batman-adv
    ip link set bat0 down 2>/dev/null || true
    batctl if del "$WIRELESS_INTERFACE" 2>/dev/null || true
    sleep 1
    
    # Bring down AP interface
    ip link set ap0 down 2>/dev/null || true
    iw dev ap0 del 2>/dev/null || true
    sleep 1
    
    # Bring down and reset wireless interface
    ip link set "$WIRELESS_INTERFACE" down 2>/dev/null || true
    iw dev "$WIRELESS_INTERFACE" disconnect 2>/dev/null || true
    iw dev "$WIRELESS_INTERFACE" set type managed 2>/dev/null || true
    sleep 1
    
    echo "Services stopped and interfaces cleaned up"
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
    
    # Ensure interface is down before changing type
    ip link set "$WIRELESS_INTERFACE" down 2>/dev/null || true
    sleep 1
    
    # Set interface to adhoc mode
    echo "Setting interface $WIRELESS_INTERFACE to IBSS mode..."
    if ! iw dev "$WIRELESS_INTERFACE" set type ibss 2>&1; then
        echo "Error: Failed to set interface to IBSS mode"
        echo "The interface may be busy. Try:"
        echo "  1. sudo nmcli device set $WIRELESS_INTERFACE managed no"
        echo "  2. sudo pkill -f wpa_supplicant"
        echo "  3. sudo ip link set $WIRELESS_INTERFACE down"
        echo "Then run this script again."
        exit 1
    fi
    
    # Bring interface up
    ip link set "$WIRELESS_INTERFACE" up
    sleep 1
    
    # Join IBSS network
    echo "Joining IBSS network: $MESH_SSID on frequency $MESH_FREQ..."
    if ! iw dev "$WIRELESS_INTERFACE" ibss join "$MESH_SSID" "$MESH_FREQ" HT20 2>&1; then
        echo "Error: Failed to join IBSS network"
        echo "Make sure the interface is not in use by another process."
        exit 1
    fi
    
    # Wait a moment for IBSS to stabilize
    sleep 2
    
    # Add interface to batman-adv
    echo "Adding interface to batman-adv..."
    if ! batctl if add "$WIRELESS_INTERFACE" 2>&1; then
        echo "Error: Failed to add interface to batman-adv"
        echo "The interface may already be in use or there's a conflict."
        exit 1
    fi
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
    
    echo "batman-adv configured on $WIRELESS_INTERFACE"
    echo "Mesh interface bat0 will use MAC-based self-assigned IPv4 address"
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

# Configure IP addressing (MAC-based self-assigned IPv4 link-local)
configure_network() {
    echo ""
    echo "Configuring network addressing (MAC-based self-assigned IPv4)..."
    
    # Calculate IP address from MAC address (deterministic)
    # Use MAC address from the wireless interface that bat0 is based on
    if [ -f /sys/class/net/bat0/address ]; then
        # Try to get MAC from bat0 directly
        BAT0_IP=$(calculate_ip_from_mac bat0)
    else
        # Fall back to wireless interface MAC
        BAT0_IP=$(calculate_ip_from_mac "$WIRELESS_INTERFACE")
    fi
    
    if [ -z "$BAT0_IP" ]; then
        echo "Warning: Could not calculate IP from MAC address"
        echo "Using fallback IP: 169.254.1.1"
        BAT0_IP="169.254.1.1"
    fi
    
    echo "Calculated IP from MAC address: $BAT0_IP"
    
    # Remove any existing IP addresses on bat0
    ip addr flush dev bat0 2>/dev/null || true
    
    # Assign the MAC-based IP address to bat0
    if ip addr add "$BAT0_IP/16" dev bat0 2>/dev/null; then
        echo "Assigned IP address $BAT0_IP/16 to bat0 interface"
    else
        echo "Warning: Could not assign IP address to bat0 (may already be assigned)"
        # Try to show current IP
        ip addr show bat0 | grep "inet " || echo "No IP address found on bat0"
    fi
    
    # Enable IPv4 link-local address acceptance
    if [ -f /proc/sys/net/ipv4/conf/bat0/accept_link_local ]; then
        echo 1 > /proc/sys/net/ipv4/conf/bat0/accept_link_local
    fi
    
    # Configure AP interface with MAC-based IP address (if AP is enabled)
    if [ "$AP_ENABLED" = true ]; then
        sleep 2
        if ip addr show ap0 &>/dev/null; then
            # Calculate AP IP from its MAC address
            AP_IP=$(calculate_ip_from_mac ap0)
            
            if [ -z "$AP_IP" ] || [ "$AP_IP" = "$BAT0_IP" ]; then
                # Fallback: use bat0 IP + 1 to avoid conflict
                IFS='.' read -r i1 i2 i3 i4 <<< "$BAT0_IP"
                i4=$((i4 + 1))
                if [ $i4 -gt 255 ]; then
                    i4=1
                    i3=$((i3 + 1))
                fi
                AP_IP="$i1.$i2.$i3.$i4"
            fi
            
            # Remove any existing IP addresses on ap0
            ip addr flush dev ap0 2>/dev/null || true
            
            # Assign MAC-based IP address to ap0
            if ip addr add "$AP_IP/16" dev ap0 2>/dev/null; then
                echo "Assigned IP address $AP_IP/16 to ap0 interface"
            else
                echo "Warning: Could not assign IP address to ap0"
            fi
            
            # Enable IPv4 link-local address acceptance
            if [ -f /proc/sys/net/ipv4/conf/ap0/accept_link_local ]; then
                echo 1 > /proc/sys/net/ipv4/conf/ap0/accept_link_local
            fi
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
    
    echo "Network addressing configured (MAC-based self-assigned IPv4: 169.254.0.0/16)"
    echo "bat0 IP: $BAT0_IP"
    if [ "$AP_ENABLED" = true ] && [ -n "$AP_IP" ]; then
        echo "ap0 IP: $AP_IP"
    fi
    echo ""
    echo "Note: IP addresses are calculated from MAC addresses for deterministic assignment"
    echo "Each node will always get the same IP address based on its MAC address"
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
    echo "  IP addressing: MAC-based self-assigned IPv4 (169.254.0.0/16)"
    echo "  DHCP: Disabled (IPs calculated from MAC addresses)"
    echo ""
    printf "Continue with setup? (y/n): "
    read REPLY
    if [ "$REPLY" != "y" ] && [ "$REPLY" != "Y" ]; then
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
    echo "IP addressing: MAC-based self-assigned IPv4 (169.254.0.0/16)"
    echo "DHCP: Disabled (IPs calculated from MAC addresses)"
    echo ""
    echo "IP addresses are calculated from MAC addresses:"
    echo "  Algorithm: 169.254.MAC[last-2-bytes-hex-to-decimal]"
    echo "  Example: MAC aa:bb:cc:dd:ee:ff -> IP 169.254.238.255"
    echo ""
    if [ "$AP_ENABLED" = true ] && [ -n "$AP_SSID" ]; then
        echo "Access Point: $AP_SSID"
        if [ -n "$AP_IP" ]; then
            echo "AP IP: $AP_IP (calculated from MAC address)"
        else
            echo "AP IP: MAC-based self-assigned IPv4 (169.254.0.0/16)"
        fi
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

