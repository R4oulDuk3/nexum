# Nexum Mesh Network - Node Configuration

This directory contains scripts and configuration files for setting up Nexum mesh network nodes on Raspberry Pi devices.

## Quick Start

1. **Clone the repository:**
   ```bash
   git clone https://github.com/yourusername/nexum.git
   cd nexum/node_configuration
   ```

2. **Install dependencies:**
   ```bash
   sudo chmod +x install.sh
   sudo ./install.sh
   ```

3. **Configure mesh network:**
   ```bash
   sudo chmod +x setup-mesh.sh
   sudo ./setup-mesh.sh
   ```

4. **Follow the prompts** to configure your mesh network settings.

## Files

- **install.sh**: Installation script for dependencies and system setup
- **setup-mesh.sh**: Mesh network configuration script
- **validate-mesh.sh**: Validation script to check mesh setup status
- **revert-mesh.sh**: Revert script to restore normal WiFi functionality
- **hostapd.conf**: Template for WiFi Access Point configuration (optional)
- **batman-mesh.service**: Systemd service file for batman-adv mesh
- **SETUP.md**: Detailed setup guide and troubleshooting
- **HARDWARE.md**: Hardware requirements and specifications

## Single Radio Limitation

**Important**: On a single radio (single WiFi adapter), there is a fundamental limitation:

- **IBSS (Ad-hoc) mode** is required for mesh networking between nodes
- **AP (Access Point) mode** is required for client devices to connect
- These two modes **cannot coexist** on the same physical radio in Linux

### Solutions

1. **Use two radios** (recommended for production):
   - Primary radio: Mesh network (IBSS mode)
   - Secondary radio (USB WiFi adapter): Access Point for clients

2. **Direct mesh connection**:
   - Have client devices connect directly to the mesh network via IBSS mode
   - Many modern devices support ad-hoc mode
   - No separate AP needed

3. **Hybrid approach** (experimental):
   - Use batman-adv bridge mode
   - Create a bridge interface on bat0
   - Provide network access through the bridge
   - Note: This still requires client devices to support IBSS mode

### Current Implementation

The current scripts attempt to create both a mesh interface and an AP interface on a single radio. This may work in some configurations but is not guaranteed. If you encounter issues:

1. Check if the AP interface (ap0) is created: `iw dev`
2. Check hostapd logs: `sudo journalctl -u hostapd -n 50`
3. Consider using a USB WiFi adapter for the AP

## Network Architecture

```
[Client Device] <--WiFi AP--> [ap0] <--Bridge--> [bat0] <--Mesh--> [Other Nodes]
                                                       <--IBSS--> [bat0] <--Mesh--> [More Nodes]
```

- **bat0**: Mesh interface using batman-adv protocol
- **ap0**: Access Point interface for client devices (optional, single radio limitation)
- **169.254.0.0/16**: Self-assigned IPv4 link-local addresses (all interfaces)
- **No DHCP**: All IP addresses are self-assigned automatically

## Configuration

### Mesh Network Settings

All nodes in the same mesh must use:
- Same Mesh SSID
- Same Mesh Channel
- Same Mesh Frequency

### Access Point Settings (Optional)

- AP SSID: Network name for client devices
- AP Password: WPA2 password for client devices
- IP addressing: Self-assigned IPv4 link-local (169.254.0.0/16)
- No DHCP: Clients must manually configure IP addresses in 169.254.0.0/16 range
- Note: Single radio limitation - AP and mesh may conflict

## Validation

After setup, validate the mesh network configuration:

```bash
# Run the validation script (recommended)
sudo chmod +x validate-mesh.sh
sudo ./validate-mesh.sh
```

The validation script checks:
- batman-adv module status
- bat0 interface and IP address
- Wireless interface mode (IBSS)
- batman-adv interface assignment
- Mesh originators and neighbors
- Systemd service status
- IP forwarding
- iptables rules
- MAC-based IP calculation

## Testing

After validation, test mesh connectivity:

```bash
# Check mesh neighbors
sudo batctl n

# Check mesh originators
sudo batctl o

# Check mesh topology
sudo batctl m

# Ping another node (replace with actual IP)
ping 169.254.X.Y
```

## Reverting Mesh Configuration

If you need to restore normal WiFi functionality:

```bash
sudo chmod +x revert-mesh.sh
sudo ./revert-mesh.sh
```

This will:
- Stop and disable mesh services
- Remove interface from batman-adv
- Reset wireless interface to managed mode
- Re-enable NetworkManager
- Remove systemd service
- Clean up mesh configuration

**Note**: After reverting, you may need to manually reconnect to your WiFi network using NetworkManager or `nmcli`.

## Troubleshooting

See **SETUP.md** for detailed troubleshooting guide.

Common issues:
1. **Lost WiFi connection**: This is expected - the interface is converted to mesh mode. Use `revert-mesh.sh` to restore normal WiFi.
2. **AP not starting**: Check single radio limitation above
3. **Mesh nodes not connecting**: Verify mesh SSID, channel, and frequency match
4. **IP addresses not assigned**: Check link-local address assignment (see SETUP.md)
5. **No connectivity**: Verify IP forwarding is enabled and firewall rules are correct

## Deployment

For disaster relief deployment:

1. **First node**: Establishes the mesh network
2. **Additional nodes**: Join the existing mesh network
3. **Node discovery**: Automatic via batman-adv protocol
4. **Resilience**: Network continues operating if nodes are lost
5. **Range extension**: Deploy nodes to extend network coverage

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
- Check SETUP.md for detailed troubleshooting
- Review logs using journalctl
- Consult batman-adv documentation: https://www.open-mesh.org/projects/batman-adv/wiki

## License

This project is part of the Nexum mesh network solution for EDTH Berlin.

