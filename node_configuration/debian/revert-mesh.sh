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
    
    # Step 3: Remove bridge first (if AP was set up), then bat0
    echo "3. Removing bridge and mesh interface..."
    
    # Check if bridge exists and remove bat0 from it first
    if ip link show br-ap &>/dev/null; then
        echo "   Removing bat0 from bridge..."
        if brctl show br-ap 2>/dev/null | grep -q bat0; then
            brctl delif br-ap bat0 2>/dev/null || true
        fi
    fi
    
    # Now remove bat0 (can't delete if it's in a bridge)
    if ip link show bat0 &>/dev/null; then
        ip link set bat0 down 2>/dev/null || true
        batctl if del "$WIRELESS_INTERFACE" 2>/dev/null || true
        ip link del bat0 2>/dev/null || true
        echo "   ✓ bat0 interface removed"
    fi
    
    # Step 4: Remove bridge and AP interface (if AP was set up)
    echo "4. Removing bridge and AP interface..."
    
    # Remove bridge if it exists (br-ap)
    if ip link show br-ap &>/dev/null; then
        echo "   Removing bridge br-ap..."
        ip link set br-ap down 2>/dev/null || true
        
        # Remove interfaces from bridge (could be ap0, wlan1, wlan2, etc.)
        for IFACE in ap0 wlan1 wlan2; do
            if brctl show br-ap 2>/dev/null | grep -q "$IFACE"; then
                brctl delif br-ap "$IFACE" 2>/dev/null || true
                echo "   Removed $IFACE from bridge"
            fi
        done
        
        # Delete the bridge
        brctl delbr br-ap 2>/dev/null || true
        echo "   ✓ Bridge br-ap removed"
    fi
    
    # Remove virtual AP interface (ap0) if it exists
    if ip link show ap0 &>/dev/null; then
        ip link set ap0 down 2>/dev/null || true
        iw dev ap0 del 2>/dev/null || true
        echo "   ✓ ap0 interface removed"
    fi
    
    # Reset physical AP interfaces (wlan1, wlan2) if they exist
    for AP_IFACE in wlan1 wlan2; do
        if ip link show "$AP_IFACE" &>/dev/null; then
            echo "   Resetting $AP_IFACE (AP interface)..."
            ip link set "$AP_IFACE" down 2>/dev/null || true
            iw dev "$AP_IFACE" disconnect 2>/dev/null || true
            iw dev "$AP_IFACE" set type managed 2>/dev/null || true
            
            # Re-enable NetworkManager for AP interface
            if systemctl is-active --quiet NetworkManager 2>/dev/null; then
                if command -v nmcli &> /dev/null; then
                    nmcli device set "$AP_IFACE" managed yes 2>/dev/null || true
                fi
            fi
            
            ip link set "$AP_IFACE" up 2>/dev/null || true
            echo "   ✓ $AP_IFACE reset to managed mode"
        fi
    done
    
    # Stop dnsmasq service and revert DNS configuration
    echo "4a. Reverting DNS configuration..."
    if [ -f /etc/dnsmasq.conf.nexum-backup ]; then
        echo "   Restoring original dnsmasq.conf from backup..."
        cp /etc/dnsmasq.conf.nexum-backup /etc/dnsmasq.conf
        rm -f /etc/dnsmasq.conf.nexum-backup
        echo "   ✓ DNS configuration restored"
    elif [ -f /etc/dnsmasq.conf ]; then
        # Remove nexum DNS entry if backup doesn't exist
        sed -i '/^# Nexum hostname resolution$/d' /etc/dnsmasq.conf
        sed -i '/^address=\/nexum\//d' /etc/dnsmasq.conf
        echo "   ✓ Nexum DNS entry removed"
    fi
    
    systemctl stop dnsmasq 2>/dev/null || true
    systemctl disable dnsmasq 2>/dev/null || true
    echo "   ✓ dnsmasq stopped and disabled"
    
    # Step 5: Reset wireless interfaces (wlan0 for mesh, wlan1 for AP)
    echo "5. Resetting wireless interfaces..."
    
    # Function to reset an interface to managed mode
    reset_interface() {
        local iface=$1
        local purpose=$2
        
        if ip link show "$iface" &>/dev/null; then
            echo "   Resetting $iface ($purpose)..."
            
            # Bring down interface
            ip link set "$iface" down 2>/dev/null || true
            
            # Disconnect from IBSS/AP if connected
            iw dev "$iface" disconnect 2>/dev/null || true
            
            # Set interface back to managed mode
            iw dev "$iface" set type managed 2>/dev/null || true
            
            # Reset MTU back to default (1500)
            ip link set mtu 1500 dev "$iface" 2>/dev/null || true
            
            # Re-enable NetworkManager for the interface
            if systemctl is-active --quiet NetworkManager 2>/dev/null; then
                if command -v nmcli &> /dev/null; then
                    nmcli device set "$iface" managed yes 2>/dev/null || true
                fi
            fi
            
            ip link set "$iface" up 2>/dev/null || true
            echo "   ✓ $iface reset to managed mode"
        fi
    }
    
    # Reset wlan0 (mesh interface)
    reset_interface wlan0 "mesh interface"
    
    # Reset wlan1 (AP interface) - Note: This may have been partially done in Step 4
    # But we ensure it's fully reset here
    reset_interface wlan1 "AP interface"
    
    # Step 6: Restart NetworkManager to reconnect
    echo "6. Restarting NetworkManager..."
    if systemctl is-active --quiet NetworkManager 2>/dev/null; then
        systemctl restart NetworkManager 2>/dev/null || true
        echo "   ✓ NetworkManager restarted"
    fi
    
    # Step 7: Remove systemd service file
    echo "7. Removing systemd service..."
    if [ -f /etc/systemd/system/batman-mesh.service ]; then
        systemctl daemon-reload 2>/dev/null || true
        rm -f /etc/systemd/system/batman-mesh.service
        systemctl daemon-reload 2>/dev/null || true
        echo "   ✓ Service file removed"
    fi
    
    # Step 8: Remove Nexum port forwarding rules
    echo "8. Removing Nexum port forwarding rules..."
    
    # Remove specific port forwarding rules (80 → 5000)
    # Try to get bridge IP to remove specific rules
    BRIDGE_IP=""
    if ip link show br-ap &>/dev/null; then
        BRIDGE_IP=$(ip addr show br-ap 2>/dev/null | grep "inet " | awk '{print $2}' | cut -d'/' -f1 || echo "")
    fi
    
    # Remove port forwarding rules
    iptables -t nat -D PREROUTING -p tcp --dport 80 -j REDIRECT --to-port 5000 2>/dev/null || true
    iptables -t nat -D OUTPUT -p tcp -d 127.0.0.1 --dport 80 -j REDIRECT --to-port 5000 2>/dev/null || true
    
    if [ -n "$BRIDGE_IP" ]; then
        iptables -t nat -D OUTPUT -p tcp -d "$BRIDGE_IP" --dport 80 -j REDIRECT --to-port 5000 2>/dev/null || true
    fi
    
    # Save iptables rules if iptables-persistent is available
    if command -v netfilter-persistent &> /dev/null; then
        netfilter-persistent save 2>/dev/null || true
    elif [ -d /etc/iptables ]; then
        iptables-save > /etc/iptables/rules.v4 2>/dev/null || true
    fi
    
    echo "   ✓ Nexum port forwarding rules removed"
    
    # Step 9: Unload batman-adv module (optional)
    echo "9. Unloading batman-adv module..."
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
    echo "1. WiFi interfaces (wlan0, wlan1) should now be in managed mode"
    echo "2. NetworkManager should automatically reconnect to available WiFi networks"
    echo "3. If not, manually connect using:"
    echo "   sudo nmcli device wifi connect \"YOUR_SSID\" password \"YOUR_PASSWORD\""
    echo ""
    echo "To verify:"
    echo "  iw dev wlan0 info          # Should show type: managed"
    echo "  iw dev wlan1 info          # Should show type: managed (if exists)"
    echo "  ip addr show wlan0         # Should show normal IP or no IP"
    echo "  ip addr show wlan1         # Should show normal IP or no IP (if exists)"
    echo "  nmcli device status        # Should show devices available"
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

