# Nexum Mesh Network - Node Configuration

This directory contains configuration scripts and files for setting up Nexum mesh network nodes on different platforms.

## Platform Support

### Debian/Raspberry Pi OS
Located in: `debian/`

For devices running Debian-based operating systems, including:
- Raspberry Pi OS (recommended)
- Ubuntu
- Debian

**Quick Start:**
```bash
cd debian
sudo chmod +x install.sh
sudo ./install.sh
sudo ./setup-mesh.sh
```

See [debian/README.md](debian/README.md) for detailed documentation.

### OpenWrt
Located in: `openwrt/`

For devices running OpenWrt firmware, including:
- OpenWrt routers
- GL.iNet devices
- Other OpenWrt-compatible hardware

**Quick Start:**
```bash
cd openwrt
chmod +x install.sh
./install.sh
./setup-mesh.sh
```

See [openwrt/README.md](openwrt/README.md) for detailed documentation.

## Choosing the Right Platform

### Use Debian/Raspberry Pi OS if:
- You're using Raspberry Pi 3B+ or Raspberry Pi 4
- You want maximum flexibility and customization
- You need easy package management and updates
- You're developing or testing mesh networks

### Use OpenWrt if:
- You're using a router or embedded device with OpenWrt
- You need a lightweight, embedded-friendly solution
- You want UCI-based configuration management
- You're deploying on battery-powered or resource-constrained devices

## Common Features

Both platforms provide:

- ✅ **MAC-based IP assignment**: Deterministic self-assigned IPv4 addresses (169.254.0.0/16)
- ✅ **No DHCP required**: All IPs are calculated from MAC addresses
- ✅ **batman-adv mesh networking**: Reliable multi-hop routing
- ✅ **Single radio support**: Works with built-in WiFi adapters
- ✅ **Optional Access Point**: WiFi hotspot for clients (with limitations)
- ✅ **Validation scripts**: Verify mesh setup status
- ✅ **Revert scripts**: Restore normal WiFi functionality

## Network Requirements

For both platforms:

- **Mesh SSID**: Same on all nodes
- **Mesh Channel**: Same on all nodes (1-11)
- **Mesh Frequency**: Same on all nodes
- **IP Range**: 169.254.0.0/16 (link-local, self-assigned)

## Deployment Scenarios

### Disaster Relief Deployment

Both platforms support autonomous mesh network deployment:
1. **First node**: Establishes the mesh network
2. **Additional nodes**: Join automatically via batman-adv
3. **Resilience**: Network continues if nodes are lost
4. **Range extension**: Deploy nodes to extend coverage

### Hardware Requirements

**Debian/Raspberry Pi OS:**
- Raspberry Pi 3B+ or 4 (recommended)
- Built-in WiFi adapter
- Optional: USB WiFi adapter for AP

**OpenWrt:**
- OpenWrt-compatible router/device
- Built-in WiFi adapter
- Optional: Additional WiFi adapter for AP

## Getting Help

- **Debian/Raspberry Pi**: See `debian/README.md` and `debian/SETUP.md`
- **OpenWrt**: See `openwrt/README.md`
- **General Issues**: Check platform-specific troubleshooting guides

## License

This project is part of the Nexum mesh network solution for EDTH Berlin.

