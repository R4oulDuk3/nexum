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
- **hostapd.conf**: Template for WiFi Access Point configuration
- **dnsmasq.conf**: Template for DHCP/DNS configuration
- **batman-mesh.service**: Systemd service file for batman-adv mesh
- **SETUP.md**: Detailed setup guide and troubleshooting

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
- **ap0**: Access Point interface for client devices (if supported)
- **10.0.0.0/24**: Client network subnet
- **169.254.0.0/16**: Mesh network subnet (link-local)

## Configuration

### Mesh Network Settings

All nodes in the same mesh must use:
- Same Mesh SSID
- Same Mesh Channel
- Same Mesh Frequency

### Access Point Settings

- AP SSID: Network name for client devices
- AP Password: WPA2 password for client devices
- AP IP: Gateway IP for client devices (default: 10.0.0.1)
- DHCP Range: IP range for client devices (default: 10.0.0.10-10.0.0.250)

## Testing

After setup, test the mesh network:

```bash
# Check mesh neighbors
sudo batctl n

# Check mesh originators
sudo batctl o

# Check mesh topology
sudo batctl m

# Ping another node
ping 169.254.0.2
```

## Troubleshooting

See **SETUP.md** for detailed troubleshooting guide.

Common issues:
1. **AP not starting**: Check single radio limitation above
2. **Mesh nodes not connecting**: Verify mesh SSID, channel, and frequency match
3. **DHCP not working**: Check dnsmasq logs and firewall rules

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

## Support

For issues or questions:
- Check SETUP.md for detailed troubleshooting
- Review logs using journalctl
- Consult batman-adv documentation: https://www.open-mesh.org/projects/batman-adv/wiki

## License

This project is part of the Nexum mesh network solution for EDTH Berlin.

