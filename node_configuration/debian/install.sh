#!/bin/bash
# Nexum Mesh Network - Installation Script
# This script installs all required dependencies for the mesh network

# Ensure this script is run with bash (not sh/dash)
if [ -z "$BASH_VERSION" ]; then
    exec /bin/bash "$0" "$@"
fi

set -e

echo "========================================="
echo "Nexum Mesh Network - Installation Script"
echo "========================================="
echo ""

# Check if running as root
if [ "$(id -u)" -ne 0 ]; then 
    echo "Please run as root (use sudo)"
    exit 1
fi

# Update package list
echo "Updating package list..."
apt-get update

# Install required packages
echo "Installing required packages..."
apt-get install -y \
    batctl \
    hostapd \
    dnsmasq \
    iptables \
    bridge-utils \
    iw \
    python3 \
    python3-pip \
    net-tools \
    iputils-ping

# Check if batman-adv module is available
echo "Checking batman-adv kernel module..."
if modinfo batman-adv &>/dev/null; then
    echo "batman-adv module found, loading..."
    modprobe batman-adv
    
    # Enable batman-adv to load on boot
    if ! grep -q "batman-adv" /etc/modules; then
        echo "batman-adv" >> /etc/modules
        echo "batman-adv added to /etc/modules (will load on boot)"
    fi
else
    echo "Warning: batman-adv kernel module not found!"
    echo "This may require a kernel update or building the module."
    echo "On Raspberry Pi OS, batman-adv should be available by default."
fi

# Disable conflicting services
echo "Stopping and disabling conflicting network services..."
systemctl stop hostapd 2>/dev/null || true
systemctl disable hostapd 2>/dev/null || true

# Disable NetworkManager on the wireless interface (if present)
if systemctl is-active --quiet NetworkManager; then
    echo "NetworkManager is active. Consider disabling it for the mesh interface."
fi

echo ""
echo "========================================="
echo "Installation completed successfully!"
echo "========================================="
echo ""
echo "Next steps:"
echo "1. Run: sudo ./setup-mesh.sh"
echo "2. Follow the setup guide for configuration"

