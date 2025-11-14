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

# Install setup script and systemd service (place script into /usr/local/bin)
BASE_DIR="$(cd "$(dirname "$0")" && pwd)"
SCRIPT_INSTALL_DIR="/usr/local/bin"
echo "Installing setup scripts to $SCRIPT_INSTALL_DIR..."
mkdir -p "$SCRIPT_INSTALL_DIR"
if [ -f "$BASE_DIR/setup-mesh.sh" ]; then
    cp -a "$BASE_DIR/setup-mesh.sh" "$SCRIPT_INSTALL_DIR/"
    chmod +x "$SCRIPT_INSTALL_DIR/setup-mesh.sh"
    echo "  Installed setup-mesh.sh -> $SCRIPT_INSTALL_DIR/setup-mesh.sh"
else
    echo "ERROR: setup-mesh.sh not found in $BASE_DIR; installer cannot proceed." >&2
    exit 1
fi

# Install systemd service with @SCRIPT_DIR@ placeholder replaced
SERVICE_INSTALLED=false
if [ -f "$BASE_DIR/batman-mesh.service" ]; then
    echo "Installing systemd unit batman-mesh.service to /etc/systemd/system/..."
    sed "s|@SCRIPT_DIR@|$SCRIPT_INSTALL_DIR|g" "$BASE_DIR/batman-mesh.service" > /etc/systemd/system/batman-mesh.service
    chmod 644 /etc/systemd/system/batman-mesh.service
    # Reload systemd units so the new service is visible
    systemctl daemon-reload
    SERVICE_INSTALLED=true
    echo "  Installed and reloaded systemd units. To enable the service at boot run:"
    echo "    sudo systemctl enable --now batman-mesh.service"
else
    echo "  Warning: batman-mesh.service not found in $BASE_DIR; skipping service install"
fi

echo ""
echo "========================================="
echo "Installation completed successfully!"
echo "========================================="
echo ""
echo "Installed artifacts:"
echo "  • setup script: $SCRIPT_INSTALL_DIR/setup-mesh.sh"
if [ "$SERVICE_INSTALLED" = true ]; then
    echo "  • systemd unit: /etc/systemd/system/batman-mesh.service"
    echo "    (enable/start with: sudo systemctl enable --now batman-mesh.service)"
else
    echo "  • systemd unit: not installed"
    echo "    If you want to install the unit, copy node_configuration/debian/batman-mesh.service to /etc/systemd/system/ and replace @SCRIPT_DIR@ with $SCRIPT_INSTALL_DIR, then run:"
    echo "      sudo systemctl daemon-reload && sudo systemctl enable --now batman-mesh.service"
fi
echo ""
echo "Next steps:"
echo "1. (Optional) Run the setup interactively: sudo $SCRIPT_INSTALL_DIR/setup-mesh.sh"
echo "2. Or let systemd start it at boot by enabling the service (see above)."

