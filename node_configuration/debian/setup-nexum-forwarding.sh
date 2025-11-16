#!/bin/bash
# Nexum Mesh Network - DNS and Port Forwarding Setup
# This script sets up:
#   1. DNS resolution for "nexum" hostname to resolve to the access point IP
#   2. Port forwarding from port 80 to 5000 (for the Flask app)
#
# Prerequisites: setup-ap.sh must be run first

# Ensure this script is run with bash (not sh/dash)
if [ -z "$BASH_VERSION" ]; then
    exec /bin/bash "$0" "$@"
fi

set -e

# ==============================================================================
# CONFIGURABLE VARIABLES
# ==============================================================================

# Bridge interface name (must match setup-ap.sh)
BRIDGE_INTERFACE="${BRIDGE_INTERFACE:-br-ap}"

# Mesh interface name (used to calculate IP)
MESH_INTERFACE="${MESH_INTERFACE:-wlan0}"

# IP address range (must match setup-ap.sh)
IP_RANGE="${IP_RANGE:-169.254.0.0/16}"

# Extract base network and subnet from IP_RANGE
IFS='/' read -r IP_BASE IP_CIDR <<< "$IP_RANGE"

# ==============================================================================
# FUNCTIONS
# ==============================================================================

# Calculate IP address from MAC address (same as setup-ap.sh)
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
echo "Nexum DNS and Port Forwarding Setup"
echo "========================================="
echo ""

# Check if running as root
if [ "$(id -u)" -ne 0 ]; then 
    echo "Error: This script must be run as root (use sudo)"
    exit 1
fi

# Verify bridge interface exists
if ! ip link show "$BRIDGE_INTERFACE" &>/dev/null; then
    echo "Error: Bridge interface $BRIDGE_INTERFACE not found!"
    echo "Please run setup-ap.sh first to create the access point."
    exit 1
fi

# Get bridge IP address
BRIDGE_IP=$(ip addr show "$BRIDGE_INTERFACE" | grep "inet " | awk '{print $2}' | cut -d'/' -f1)

if [ -z "$BRIDGE_IP" ]; then
    echo "Error: Could not determine IP address of $BRIDGE_INTERFACE"
    echo "Please ensure setup-ap.sh has been run successfully."
    exit 1
fi

echo "Configuration:"
echo "  Bridge interface: $BRIDGE_INTERFACE"
echo "  Bridge IP: $BRIDGE_IP"
echo "  Hostname: nexum"
echo "  Port forwarding: 80 → 5000"
echo ""

# ==============================================================================
# DNS Configuration (dnsmasq)
# ==============================================================================

echo "Configuring DNS resolution for 'nexum'..."

# Check if dnsmasq is installed
if ! command -v dnsmasq &> /dev/null; then
    echo "Error: dnsmasq is not installed"
    echo "Please install it: sudo apt-get install dnsmasq"
    exit 1
fi

# Backup existing dnsmasq.conf if it exists and hasn't been backed up
if [ -f /etc/dnsmasq.conf ] && [ ! -f /etc/dnsmasq.conf.nexum-backup ]; then
    echo "  Backing up existing /etc/dnsmasq.conf..."
    cp /etc/dnsmasq.conf /etc/dnsmasq.conf.nexum-backup
fi

# Read existing dnsmasq.conf and add/update address entry for nexum
if [ -f /etc/dnsmasq.conf ]; then
    # Remove any existing nexum address entry
    sed -i '/^address=\/nexum\//d' /etc/dnsmasq.conf
    
    # Add nexum address entry
    echo "" >> /etc/dnsmasq.conf
    echo "# Nexum hostname resolution" >> /etc/dnsmasq.conf
    echo "address=/nexum/$BRIDGE_IP" >> /etc/dnsmasq.conf
else
    # Create basic dnsmasq.conf if it doesn't exist
    cat > /etc/dnsmasq.conf <<EOF
# Nexum DNS Configuration
bind-interfaces
interface=$BRIDGE_INTERFACE
address=/nexum/$BRIDGE_IP
EOF
fi

echo "  ✓ DNS configured: nexum → $BRIDGE_IP"

# ==============================================================================
# Port Forwarding Configuration (iptables)
# ==============================================================================

echo ""
echo "Configuring port forwarding (80 → 5000)..."

# Check if iptables is available
if ! command -v iptables &> /dev/null; then
    echo "Error: iptables is not installed"
    echo "Please install it: sudo apt-get install iptables"
    exit 1
fi

# Enable IP forwarding
echo "  Enabling IP forwarding..."
echo 1 > /proc/sys/net/ipv4/ip_forward

# Make IP forwarding persistent
if ! grep -q "net.ipv4.ip_forward=1" /etc/sysctl.conf; then
    echo "" >> /etc/sysctl.conf
    echo "# Enable IP forwarding for Nexum port forwarding" >> /etc/sysctl.conf
    echo "net.ipv4.ip_forward=1" >> /etc/sysctl.conf
fi

# Remove existing port forwarding rules if they exist
echo "  Removing existing port forwarding rules..."
iptables -t nat -D PREROUTING -p tcp --dport 80 -j REDIRECT --to-port 5000 2>/dev/null || true
iptables -t nat -D OUTPUT -p tcp -d 127.0.0.1 --dport 80 -j REDIRECT --to-port 5000 2>/dev/null || true
iptables -t nat -D OUTPUT -p tcp -d "$BRIDGE_IP" --dport 80 -j REDIRECT --to-port 5000 2>/dev/null || true

# Add port forwarding rules
echo "  Adding port forwarding rules..."

# Forward external connections on port 80 to port 5000
iptables -t nat -A PREROUTING -p tcp --dport 80 -j REDIRECT --to-port 5000

# Forward localhost connections (for testing)
iptables -t nat -A OUTPUT -p tcp -d 127.0.0.1 --dport 80 -j REDIRECT --to-port 5000

# Forward connections to bridge IP
iptables -t nat -A OUTPUT -p tcp -d "$BRIDGE_IP" --dport 80 -j REDIRECT --to-port 5000

echo "  ✓ Port forwarding configured: 80 → 5000"

# ==============================================================================
# Save iptables rules (make persistent)
# ==============================================================================

echo ""
echo "Making iptables rules persistent..."

# Check if iptables-persistent is installed
if command -v netfilter-persistent &> /dev/null; then
    netfilter-persistent save
    echo "  ✓ Rules saved using netfilter-persistent"
elif command -v iptables-save &> /dev/null; then
    # Try to save rules manually
    if [ -d /etc/iptables ]; then
        iptables-save > /etc/iptables/rules.v4
        echo "  ✓ Rules saved to /etc/iptables/rules.v4"
    else
        echo "  Warning: Could not save iptables rules automatically"
        echo "  Install iptables-persistent to make rules persistent:"
        echo "    sudo apt-get install iptables-persistent"
        echo "    sudo netfilter-persistent save"
    fi
else
    echo "  Warning: Could not save iptables rules"
    echo "  Rules will be lost on reboot. Install iptables-persistent:"
    echo "    sudo apt-get install iptables-persistent"
fi

# ==============================================================================
# Restart dnsmasq
# ==============================================================================

echo ""
echo "Restarting dnsmasq..."
if systemctl restart dnsmasq; then
    echo "  ✓ dnsmasq restarted successfully"
else
    echo "  Warning: Failed to restart dnsmasq"
    echo "  Check logs: sudo journalctl -u dnsmasq -n 50"
fi

# ==============================================================================
# Summary
# ==============================================================================

echo ""
echo "========================================="
echo "Setup completed successfully!"
echo "========================================="
echo ""
echo "Configuration:"
echo "  DNS: nexum → $BRIDGE_IP"
echo "  Port forwarding: 80 → 5000"
echo ""
echo "Testing:"
echo "  From a device connected to the AP, try:"
echo "    http://nexum/"
echo "    http://nexum:80/"
echo "  Both should forward to http://$BRIDGE_IP:5000"
echo ""
echo "Note:"
echo "  - DNS changes take effect immediately for new connections"
echo "  - Existing connections may need to be refreshed"
echo "  - Port forwarding works for all connections to port 80"
echo ""

