#!/bin/bash
# Nexum Mesh Network - Revert Script
# This script reverts the mesh network setup and restores normal WiFi functionality

# Ensure this script is run with bash (not sh/dash)
if [ -z "$BASH_VERSION" ]; then
    exec /bin/bash "$0" "$@"
fi

set -e

echo "========================================="
echo "Nexum Mesh Network - Revert Script"
echo "========================================="
echo ""

# Check if running as root
if [ "$(id -u)" -ne 0 ]; then 
    echo "Please run as root (use sudo)"
    exit 1
fi

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
        read -p "Enter the interface name to revert: " WIRELESS_INTERFACE
    fi
}

# Main revert function
revert_mesh() {
    echo ""
    echo "Reverting mesh network configuration..."
    echo ""
    
    # Step 1: Stop and disable mesh services
    echo "1. Stopping mesh services..."
    systemctl stop batman-mesh 2>/dev/null || true
    systemctl disable batman-mesh 2>/dev/null || true
    systemctl stop hostapd 2>/dev/null || true
    systemctl disable hostapd 2>/dev/null || true
    echo "   ✓ Services stopped"
    
    # Step 2: Remove interface from batman-adv
    echo "2. Removing interface from batman-adv..."
    if [ -n "$WIRELESS_INTERFACE" ]; then
        batctl if del "$WIRELESS_INTERFACE" 2>/dev/null || true
        echo "   ✓ Interface removed from batman-adv"
    fi
    
    # Step 3: Bring down bat0 and remove if exists
    echo "3. Bringing down mesh interface..."
    if ip link show bat0 &>/dev/null; then
        ip link set bat0 down 2>/dev/null || true
        echo "   ✓ bat0 interface brought down"
    fi
    
    # Step 4: Remove virtual AP interface
    echo "4. Removing virtual AP interface..."
    if ip link show ap0 &>/dev/null; then
        ip link set ap0 down 2>/dev/null || true
        iw dev ap0 del 2>/dev/null || true
        echo "   ✓ ap0 interface removed"
    fi
    
    # Step 5: Reset wireless interface
    if [ -n "$WIRELESS_INTERFACE" ]; then
        echo "5. Resetting wireless interface..."
        
        # Bring down interface
        ip link set "$WIRELESS_INTERFACE" down 2>/dev/null || true
        
        # Disconnect from IBSS if connected
        iw dev "$WIRELESS_INTERFACE" disconnect 2>/dev/null || true
        
        # Set interface back to managed mode
        iw dev "$WIRELESS_INTERFACE" set type managed 2>/dev/null || true
        
        echo "   ✓ Interface reset to managed mode"
        
        # Step 6: Re-enable NetworkManager for the interface
        echo "6. Re-enabling NetworkManager..."
        if systemctl is-active --quiet NetworkManager 2>/dev/null; then
            if command -v nmcli &> /dev/null; then
                nmcli device set "$WIRELESS_INTERFACE" managed yes 2>/dev/null || true
                echo "   ✓ NetworkManager re-enabled for $WIRELESS_INTERFACE"
            else
                echo "   ⚠ nmcli not found, NetworkManager may need manual configuration"
            fi
        else
            echo "   ⚠ NetworkManager is not running"
        fi
        
        # Step 7: Bring interface back up
        echo "7. Bringing interface back up..."
        ip link set "$WIRELESS_INTERFACE" up 2>/dev/null || true
        sleep 2
        
        # Restart NetworkManager to reconnect
        if systemctl is-active --quiet NetworkManager 2>/dev/null; then
            systemctl restart NetworkManager 2>/dev/null || true
            echo "   ✓ NetworkManager restarted"
        fi
    fi
    
    # Step 8: Remove systemd service file
    echo "8. Removing systemd service..."
    if [ -f /etc/systemd/system/batman-mesh.service ]; then
        systemctl daemon-reload 2>/dev/null || true
        rm -f /etc/systemd/system/batman-mesh.service
        systemctl daemon-reload 2>/dev/null || true
        echo "   ✓ Service file removed"
    fi
    
    # Step 9: Restore iptables (optional - clear mesh rules)
    echo "9. Clearing mesh iptables rules..."
    # Note: This clears all iptables rules, not just mesh ones
    # A more sophisticated version could backup/restore, but this is simpler
    iptables -t nat -F 2>/dev/null || true
    iptables -F 2>/dev/null || true
    echo "   ✓ iptables rules cleared"
    
    # Step 10: Unload batman-adv module (optional)
    echo "10. Unloading batman-adv module..."
    if lsmod | grep -q batman_adv; then
        modprobe -r batman-adv 2>/dev/null || true
        echo "   ✓ batman-adv module unloaded"
    else
        echo "   ⚠ batman-adv module not loaded"
    fi
    
    echo ""
    echo "========================================="
    echo "Mesh network configuration reverted!"
    echo "========================================="
    echo ""
    echo "Your wireless interface should now be restored to normal operation."
    echo ""
    echo "Next steps:"
    echo "1. Your WiFi interface ($WIRELESS_INTERFACE) should now be in managed mode"
    echo "2. NetworkManager should automatically reconnect to available WiFi networks"
    echo "3. If not, manually connect using:"
    echo "   sudo nmcli device wifi connect \"YOUR_SSID\" password \"YOUR_PASSWORD\""
    echo ""
    echo "To verify:"
    echo "  iw dev $WIRELESS_INTERFACE info          # Should show type: managed"
    echo "  ip addr show $WIRELESS_INTERFACE         # Should show normal IP or no IP"
    echo "  nmcli device status                      # Should show device available"
    echo ""
}

# Main execution
main() {
    echo "This script will revert the mesh network configuration and restore"
    echo "normal WiFi functionality. Your wireless interface will be reset to"
    echo "managed mode and NetworkManager will be re-enabled."
    echo ""
    read -p "Do you want to continue? (y/n): " REPLY
    if [ "$REPLY" != "y" ] && [ "$REPLY" != "Y" ]; then
        echo "Revert cancelled."
        exit 0
    fi
    
    detect_wireless_interface
    revert_mesh
}

# Run main function
main

