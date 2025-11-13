# Nexum Mesh Network - OpenWrt Configuration

This directory contains scripts and configuration files for setting up Nexum mesh network nodes on OpenWrt devices.

## Quick Start

1. **Install dependencies:**
   ```bash
   chmod +x install.sh
   ./install.sh
   ```

2. **Configure mesh network:**
   ```bash
   chmod +x setup-mesh.sh
   ./setup-mesh.sh
   ```

3. **Follow the prompts** to configure your mesh network settings.

4. **Validate setup:**
   ```bash
   chmod +x validate-mesh.sh
   ./validate-mesh.sh
   ```

## Files

- **install.sh**: Installation script for dependencies (opkg packages)
- **setup-mesh.sh**: Mesh network configuration script using UCI
- **validate-mesh.sh**: Validation script to check mesh setup status
- **revert-mesh.sh**: Revert script to restore normal WiFi functionality
- **README.md**: This file

## OpenWrt-Specific Notes

### Differences from Debian/Raspberry Pi OS

1. **Package Management**: Uses `opkg` instead of `apt-get`
2. **Configuration**: Uses UCI (Unified Configuration Interface) instead of direct config files
3. **Network Management**: Uses `netifd` and UCI network configuration
4. **Wireless**: Configured via UCI wireless settings
5. **Init System**: Uses procd/init scripts instead of systemd

### UCI Configuration

OpenWrt uses UCI for configuration. The setup script automatically configures:

- **Wireless**: `/etc/config/wireless` - IBSS (ad-hoc) mode configuration
- **Network**: `/etc/config/network` - Mesh network interface (bat0)

You can manually edit configurations with:
```bash
uci set wireless.radio0_mesh.ssid="nexum-mesh"
uci commit wireless
wifi reload
```

### IP Addressing

Like the Debian version, OpenWrt uses MAC-based self-assigned IPv4 addresses:
- Range: `169.254.0.0/16` (link-local)
- Algorithm: `169.254.MAC[last-2-bytes-hex-to-decimal]`
- No DHCP server required

### Single Radio Limitation

Same as Debian version:
- Single radio cannot reliably operate IBSS (mesh) and AP modes simultaneously
- Solution: Use a second radio (USB WiFi adapter) for AP functionality
- Or have clients connect directly to mesh network via IBSS mode

## Network Configuration

### Mesh Network Settings

All nodes in the same mesh must use:
- Same Mesh SSID
- Same Mesh Channel
- Same Mesh Frequency

### Access Point Settings (Optional)

- AP SSID: Network name for client devices
- AP Password: WPA2 password for client devices
- IP addressing: Self-assigned IPv4 link-local (169.254.0.0/16)
- Note: Single radio limitation - AP and mesh may conflict

## Validation

After setup, validate the mesh network configuration:

```bash
./validate-mesh.sh
```

The validation script checks:
- batman-adv module status
- bat0 interface and IP address
- Wireless interface mode (IBSS/ad-hoc)
- batman-adv interface assignment
- Mesh originators and neighbors
- Network configuration
- IP forwarding

## Testing

After validation, test mesh connectivity:

```bash
# Check mesh neighbors
batctl n

# Check mesh originators
batctl o

# Check mesh topology
batctl m

# Ping another node (replace with actual IP)
ping 169.254.X.Y
```

## Reverting Mesh Configuration

If you need to restore normal WiFi functionality:

```bash
chmod +x revert-mesh.sh
./revert-mesh.sh
```

This will:
- Remove interface from batman-adv
- Remove mesh wireless configuration
- Remove mesh network configuration
- Restart network services
- Unload batman-adv module

**Note**: After reverting, you may need to manually reconfigure WiFi access point.

## Troubleshooting

### Common Issues

1. **bat0 interface not created**: Check if wireless interface is properly configured in UCI
2. **Mesh nodes not connecting**: Verify mesh SSID, channel, and frequency match on all nodes
3. **IP addresses not assigned**: Check if bat0 interface is up and batman-adv is working
4. **Wireless not working**: Check UCI wireless configuration and reload: `wifi reload`

### Manual Configuration

To manually configure mesh network:

```bash
# Edit wireless configuration
uci set wireless.radio0_mesh=wifi-iface
uci set wireless.radio0_mesh.device=radio0
uci set wireless.radio0_mesh.mode=adhoc
uci set wireless.radio0_mesh.ssid="nexum-mesh"
uci set wireless.radio0_mesh.network=mesh
uci commit wireless

# Edit network configuration
uci set network.mesh=interface
uci set network.mesh.proto=none
uci set network.mesh.ifname=bat0
uci commit network

# Reload network
wifi reload
/etc/init.d/network restart

# Add interface to batman-adv
batctl if add wlan0
ip link set bat0 up
```

### Logs

Check system logs:
```bash
logread | grep -i batman
logread | grep -i mesh
logread | grep -i wireless
```

## Deployment

For disaster relief deployment on OpenWrt devices:

1. **First node**: Establishes the mesh network
2. **Additional nodes**: Join the existing mesh network using same SSID/channel
3. **Node discovery**: Automatic via batman-adv protocol
4. **Resilience**: Network continues operating if nodes are lost

## Performance

Target performance metrics:
- **Throughput**: ~5 Mbps across mesh network
- **Latency**: <500 ms end-to-end RTT
- **Reliability**: 99% message delivery success rate
- **Node failure**: Network continues operating with remaining nodes
- **IP addressing**: Self-assigned IPv4 link-local (169.254.0.0/16)
- **DHCP**: Disabled (no DHCP server, all IPs self-assigned)

## Support

For issues or questions:
- Check troubleshooting section above
- Review OpenWrt documentation: https://openwrt.org/docs
- Consult batman-adv documentation: https://www.open-mesh.org/projects/batman-adv/wiki

## License

This project is part of the Nexum mesh network solution for EDTH Berlin.

