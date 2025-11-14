# Nexum Mesh Network - Setup Guide

This guide will help you set up a Nexum mesh network node on a Raspberry Pi.

## Hardware Requirements

- Raspberry Pi 4 (or Raspberry Pi 3B+)
- MicroSD card (32GB or larger recommended)
- WiFi adapter (built-in on Pi 4/3B+, or USB adapter)
- Power supply (5V, 3A recommended for Pi 4)
- Optional: External battery pack for portable operation

## Software Requirements

- Raspberry Pi OS (Bullseye or later)
- Internet connection (for initial setup)

## Installation Steps

### 1. Clone the Repository

```bash
cd ~
git clone https://github.com/yourusername/nexum.git
cd nexum/node_configuration
```

### 2. Run Installation Script

The installation script installs all required dependencies:

```bash
sudo chmod +x install.sh
sudo ./install.sh
```

This script will:
- Update package lists
- Install required packages (batctl, hostapd, dnsmasq, etc.)
- Load batman-adv kernel module
- Configure modules to load on boot

### 3. Run Mesh Setup Script

The setup script configures the mesh network:

```bash
sudo chmod +x setup-mesh.sh
sudo ./setup-mesh.sh
```

The script will prompt you for:
- **Mesh SSID**: Network name for the mesh (default: nexum-mesh)
- **Mesh Channel**: WiFi channel (1-11, default: 6)
- **Mesh Frequency**: Frequency in MHz (default: 2437)
- **AP SSID**: WiFi access point name for responders (default: Nexum-Relief)
- **AP Password**: Password for the access point (default: ReliefNet123)
- **AP IP Address**: IP address for the access point (default: 10.0.0.1)
- **DHCP Range**: IP range for connected devices (default: 10.0.0.10-10.0.0.250)

**Important**: All nodes in the same mesh network must use the same:
- Mesh SSID
- Mesh Channel
- Mesh Frequency

### 4. Verify Installation

Check mesh status:
```bash
sudo batctl o          # Show originators (other mesh nodes)
sudo batctl n          # Show neighbors
sudo batctl m          # Show mesh topology
```

Check access point:
```bash
sudo iw dev ap0 info   # Show AP interface info
sudo systemctl status hostapd
```

Check network interfaces:
```bash
ip addr show
```

## Network Architecture

The setup creates a dual-interface configuration:

1. **bat0**: Mesh interface using batman-adv protocol
   - Uses link-local addressing (169.254.0.0/16)
   - Connects to other mesh nodes via ad-hoc WiFi

2. **ap0**: Access Point interface for disaster relief responders
   - Provides WiFi hotspot (AP_SSID)
   - IP range: AP_IP/24
   - DHCP server provides addresses to connected devices
   - Traffic is NATed through bat0 to reach the mesh network

## Testing the Mesh Network

### Test Connectivity Between Nodes

1. Set up two or more nodes following the installation steps
2. Ensure all nodes use the same mesh SSID, channel, and frequency
3. Wait 30-60 seconds for nodes to discover each other
4. On Node 1, check for neighbors:
   ```bash
   sudo batctl n
   ```
5. On Node 1, ping Node 2's bat0 address:
   ```bash
   ping 169.254.0.2
   ```

### Test Access Point

1. Connect a smartphone or tablet to the AP SSID
2. Verify IP assignment (should be in DHCP range)
3. Test connectivity:
   ```bash
   # From connected device
   ping 10.0.0.1  # Should reach AP
   ping 169.254.0.1  # Should reach mesh node
   ```

## Power Optimization

To optimize for battery operation:

1. **Disable unnecessary services**:
   ```bash
   sudo systemctl disable bluetooth
   sudo systemctl disable avahi-daemon
   ```

2. **Reduce CPU frequency** (if not needed):
   ```bash
   sudo nano /boot/config.txt
   # Add: arm_freq=1000
   ```

3. **Enable power saving mode**:
   ```bash
   sudo iw dev wlan0 set power_save on
   ```

## Troubleshooting

### Mesh nodes not connecting

1. Verify mesh SSID, channel, and frequency match on all nodes
2. Check if wireless interface is up:
   ```bash
   ip link show wlan0
   ```
3. Check batman-adv status:
   ```bash
   sudo batctl if
   cat /sys/class/net/bat0/mesh/orig_interval
   ```
4. Restart mesh service:
   ```bash
   sudo systemctl restart batman-mesh
   ```

### Access Point not working

1. Check hostapd status:
   ```bash
   sudo systemctl status hostapd
   sudo journalctl -u hostapd -n 50
   ```
2. Verify ap0 interface exists:
   ```bash
   ip addr show ap0
   ```
3. Check for conflicts:
   ```bash
   sudo iw dev
   ```

### DHCP not assigning addresses

1. Check dnsmasq status:
   ```bash
   sudo systemctl status dnsmasq
   sudo journalctl -u dnsmasq -n 50
   ```
2. Verify DHCP range in /etc/dnsmasq.conf
3. Check firewall rules:
   ```bash
   sudo iptables -L -n -v
   ```

### Network performance issues

1. Check mesh throughput:
   ```bash
   # On Node 1
   sudo iperf3 -s
   
   # On Node 2
   sudo iperf3 -c 169.254.0.1
   ```
2. Monitor mesh topology:
   ```bash
   sudo batctl m
   ```
3. Check for interference:
   ```bash
   sudo iw dev wlan0 scan | grep -i "signal\|channel"
   ```

## Maintenance

### Restart Mesh Network

```bash
sudo systemctl restart batman-mesh
sudo systemctl restart hostapd
sudo systemctl restart dnsmasq
```

### Update Configuration

1. Edit configuration files in `/etc/`:
   - `/etc/hostapd/hostapd.conf` - AP settings
   - `/etc/dnsmasq.conf` - DHCP settings
2. Restart services:
   ```bash
   sudo systemctl restart hostapd
   sudo systemctl restart dnsmasq
   ```

### View Logs

```bash
# Mesh service logs
sudo journalctl -u batman-mesh -f

# HostAPD logs
sudo journalctl -u hostapd -f

# DNSMASQ logs
sudo journalctl -u dnsmasq -f
```

## Security Considerations

1. **Change default passwords**: Update AP password in hostapd.conf
2. **Use WPA2**: Already configured in hostapd.conf
3. **Firewall**: Consider adding iptables rules for additional security
4. **Updates**: Regularly update system packages:
   ```bash
   sudo apt update && sudo apt upgrade
   ```

## Deployment Scenario

For disaster relief deployment:

1. **Initial Node**: First node establishes the mesh network
2. **Additional Nodes**: Subsequent nodes join the existing mesh
3. **Node Discovery**: Nodes automatically discover each other via batman-adv
4. **Resilience**: Network continues to operate if nodes are lost
5. **Range Extension**: Deploy nodes to extend network coverage

## Performance Targets

- **Throughput**: ~5 Mbps across mesh network
- **Latency**: <500 ms end-to-end RTT
- **Reliability**: 99% message delivery success rate
- **Node Failure**: Network continues operating with remaining nodes

## Support

For issues or questions:
- Check the troubleshooting section above
- Review logs using journalctl
- Consult the batman-adv documentation: https://www.open-mesh.org/projects/batman-adv/wiki

## License

This project is part of the Nexum mesh network solution for EDTH Berlin.

