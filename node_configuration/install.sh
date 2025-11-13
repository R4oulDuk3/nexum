#!/bin/bash
# Nexum Mesh Network - Installation Script
# This script installs all required dependencies for the mesh network

set -e

echo "========================================="
echo "Nexum Mesh Network - Installation Script"
echo "========================================="
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
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

# Load batman-adv module
echo "Loading batman-adv kernel module..."
modprobe batman-adv

# Enable batman-adv to load on boot
if ! grep -q "batman-adv" /etc/modules; then
    echo "batman-adv" >> /etc/modules
fi

# Disable conflicting services
echo "Stopping and disabling conflicting network services..."
systemctl stop hostapd 2>/dev/null || true
systemctl stop dnsmasq 2>/dev/null || true
systemctl disable hostapd 2>/dev/null || true
systemctl disable dnsmasq 2>/dev/null || true

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

