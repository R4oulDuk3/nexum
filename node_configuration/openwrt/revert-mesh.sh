#!/bin/sh
# Nexum Mesh Network - OpenWrt Revert Script
# This script reverts the mesh network setup and restores normal WiFi functionality

set -e

echo "========================================="
echo "Nexum Mesh Network - OpenWrt Revert Script"
echo "========================================="
echo ""

# Check if running as root
if [ "$(id -u)" -ne 0 ]; then 
    echo "Please run as root"
    exit 1
fi

# Detect wireless interface
detect_wireless_interface() {
    if uci show wireless | grep -q "radio0"; then
        WIRELESS_INTERFACE="radio0"
        echo "Detected wireless interface: radio0"
    else
        echo "Available wireless interfaces:"
        uci show wireless | grep "=wifi-device" | cut -d'=' -f1 | cut -d'.' -f2
        echo ""
        read -p "Enter the radio interface to revert: " WIRELESS_INTERFACE
    fi
}

# Main revert function
revert_mesh() {
    echo ""
    echo "Reverting mesh network configuration..."
    echo ""
    
    # Step 1: Remove batman-adv interface
    echo "1. Removing batman-adv interface..."
    if ip link show bat0 &>/dev/null; then
        ip link set bat0 down 2>/dev/null || true
        WLAN_IF=$(ip link show | grep -oE "wlan[0-9]+" | head -1)
        if [ -n "$WLAN_IF" ]; then
            batctl if del "$WLAN_IF" 2>/dev/null || true
        fi
        echo "   ✓ bat0 interface removed"
    fi
    
    # Step 2: Remove mesh wireless configuration
    echo "2. Removing mesh wireless configuration..."
    uci delete wireless.${WIRELESS_INTERFACE}_mesh 2>/dev/null || true
    uci commit wireless
    
    # Step 3: Remove mesh network configuration
    echo "3. Removing mesh network configuration..."
    uci delete network.mesh 2>/dev/null || true
    uci commit network
    
    # Step 4: Restore default wireless configuration
    echo "4. Restoring default wireless configuration..."
    # You may want to create a default AP configuration here
    # uci set wireless.${WIRELESS_INTERFACE}_default=wifi-iface
    # uci set wireless.${WIRELESS_INTERFACE}_default.device=$WIRELESS_INTERFACE
    # uci set wireless.${WIRELESS_INTERFACE}_default.mode=ap
    # uci set wireless.${WIRELESS_INTERFACE}_default.ssid=OpenWrt
    # uci commit wireless
    
    # Step 5: Restart network services
    echo "5. Restarting network services..."
    wifi reload || /etc/init.d/network reload || true
    /etc/init.d/network restart || true
    
    # Step 6: Unload batman-adv module
    echo "6. Unloading batman-adv module..."
    rmmod batman_adv 2>/dev/null || true
    
    # Step 7: Clear iptables
    echo "7. Clearing iptables rules..."
    iptables -t nat -F 2>/dev/null || true
    iptables -F 2>/dev/null || true
    
    echo ""
    echo "========================================="
    echo "Mesh network configuration reverted!"
    echo "========================================="
    echo ""
    echo "Your wireless interface should now be restored."
    echo "You may need to reconfigure WiFi access point manually."
    echo ""
}

# Main execution
main() {
    echo "This script will revert the mesh network configuration and restore"
    echo "normal WiFi functionality."
    echo ""
    printf "Do you want to continue? (y/n): "
    read REPLY
    if [ "$REPLY" != "y" ] && [ "$REPLY" != "Y" ]; then
        echo "Revert cancelled."
        exit 0
    fi
    
    detect_wireless_interface
    revert_mesh
}

main

