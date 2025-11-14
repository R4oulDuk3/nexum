#!/bin/sh
# Nexum Mesh Network - OpenWrt Installation Script
# This script installs all required dependencies for the mesh network on OpenWrt

set -e

echo "========================================="
echo "Nexum Mesh Network - OpenWrt Installation"
echo "========================================="
echo ""

# Check if running on OpenWrt
if [ ! -f /etc/openwrt_release ]; then
    echo "Warning: This doesn't appear to be an OpenWrt system"
    echo "This script is designed for OpenWrt devices"
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

# Update package list
echo "Updating package list..."
opkg update

# Install required packages
echo "Installing required packages..."
opkg install \
    batctl \
    kmod-batman-adv \
    kmod-iwlwifi \
    wpad-openssl \
    hostapd-utils \
    iptables \
    ip-full \
    iw

# Check if batman-adv module is available
echo ""
echo "Checking batman-adv kernel module..."
if ls /lib/modules/*/batman-adv.ko* 2>/dev/null | head -1 | grep -q .; then
    echo "batman-adv kernel module found"
else
    echo "Warning: batman-adv kernel module not found in standard locations"
    echo "You may need to compile it or use a different OpenWrt build"
fi

# Load batman-adv module
echo ""
echo "Loading batman-adv kernel module..."
insmod batman-adv 2>/dev/null || modprobe batman-adv 2>/dev/null || true

echo ""
echo "========================================="
echo "Installation completed!"
echo "========================================="
echo ""
echo "Next steps:"
echo "1. Run: ./setup-mesh.sh"
echo "2. Follow the setup guide for configuration"
echo ""

