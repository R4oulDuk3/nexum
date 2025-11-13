# Nexum Mesh Network - Hardware Requirements

## Raspberry Pi Requirements

### Minimum Hardware

- **Raspberry Pi 4** (recommended) or **Raspberry Pi 3B+**
- **MicroSD card**: 32GB or larger (Class 10 or better recommended)
- **Power supply**: 
  - Pi 4: 5V, 3A (15W) USB-C power supply
  - Pi 3B+: 5V, 2.5A (12.5W) micro-USB power supply
- **WiFi adapter**: Built-in on Pi 4/3B+ (802.11n, 2.4GHz)
- **Optional**: USB WiFi adapter for Access Point (recommended for production)

### Recommended Hardware

- **Raspberry Pi 4** (4GB or 8GB RAM)
  - Better performance for mesh routing
  - More reliable for multiple concurrent connections
  - Better power efficiency
- **High-quality MicroSD card**: 64GB+ Class 10 or better
  - Better reliability and performance
  - Longer lifespan for continuous operation
- **USB WiFi adapter**: For Access Point functionality
  - Allows simultaneous mesh and AP operation
  - Recommended: Dual-band USB WiFi adapter (2.4GHz and 5GHz)
- **External battery pack**: For portable/mobile deployment
  - 20,000mAh or larger recommended
  - Power bank with USB-C output for Pi 4
- **Weatherproof enclosure**: For outdoor deployment
  - IP65 or better rating
  - Ventilation for heat dissipation
  - Mounting options

## Hardware Specifications

### Raspberry Pi 4

- **CPU**: Broadcom BCM2711, Quad core Cortex-A72 (ARM v8) 64-bit SoC @ 1.8GHz
- **RAM**: 2GB, 4GB, or 8GB LPDDR4-3200
- **WiFi**: 2.4 GHz and 5.0 GHz IEEE 802.11ac wireless
- **Bluetooth**: Bluetooth 5.0, BLE
- **Power**: 5V USB-C, 3A (15W)
- **Operating temperature**: 0°C to 85°C

### Raspberry Pi 3B+

- **CPU**: Broadcom BCM2837B0, Cortex-A53 (ARMv8) 64-bit @ 1.4GHz
- **RAM**: 1GB LPDDR2 SDRAM
- **WiFi**: 2.4 GHz and 5.0 GHz IEEE 802.11ac wireless
- **Bluetooth**: Bluetooth 4.2, BLE
- **Power**: 5V micro-USB, 2.5A (12.5W)
- **Operating temperature**: 0°C to 85°C

## Performance Considerations

### Single Radio Limitation

- **Built-in WiFi**: Single radio (one physical WiFi adapter)
- **Limitation**: Cannot simultaneously operate IBSS (mesh) and AP modes reliably
- **Solution**: Use USB WiFi adapter for AP functionality
- **Alternative**: Connect clients directly to mesh network via IBSS mode

### Power Consumption

- **Raspberry Pi 4**: ~3-5W idle, ~5-7W under load
- **Raspberry Pi 3B+**: ~2-3W idle, ~4-5W under load
- **WiFi adapter**: ~0.5-1W additional power
- **External battery**: 20,000mAh ≈ 74Wh (about 10-15 hours on Pi 4)

### Range and Throughput

- **WiFi range**: ~100-300 meters (outdoor, line of sight)
- **Mesh throughput**: ~5-10 Mbps per hop
- **Latency**: <500 ms end-to-end RTT (target)
- **Node capacity**: 10-50 nodes per mesh network (depending on configuration)

## Recommended USB WiFi Adapters

### For Access Point (Secondary Radio)

1. **TP-Link Archer T2U Plus** (recommended)
   - Dual-band (2.4GHz and 5GHz)
   - USB 3.0
   - Good Linux support

2. **Alfa AWUS036ACS**
   - Dual-band
   - High power output
   - Excellent Linux support

3. **Panda PAU09**
   - Dual-band
   - USB 3.0
   - Good Linux support

### Single Radio Setup

- Use built-in WiFi for mesh network
- No USB adapter needed
- Clients connect directly to mesh via IBSS mode
- Simpler setup, lower power consumption

## Deployment Scenarios

### Fixed Node Deployment

- **Power**: AC power supply or PoE (with adapter)
- **Enclosure**: Weatherproof enclosure
- **Mounting**: Pole mount or wall mount
- **Antenna**: External antenna (optional, for extended range)

### Portable/Mobile Deployment

- **Power**: External battery pack (20,000mAh+)
- **Enclosure**: Weatherproof, rugged case
- **Mounting**: Backpack mount or vehicle mount
- **Antenna**: Integrated or external antenna

### Aerial Deployment (UAV)

- **Power**: Lightweight battery pack
- **Enclosure**: Lightweight, weatherproof case
- **Mounting**: UAV mounting bracket
- **Weight**: Minimize weight for flight time
- **Antenna**: Lightweight, directional antenna (optional)

## Operating Conditions

### Temperature Range

- **Recommended**: 0°C to 70°C
- **Extended**: -20°C to 85°C (with proper enclosure)
- **Heat management**: Ventilation or heatsinks may be needed in hot environments

### Humidity

- **Recommended**: <80% relative humidity
- **Extended**: IP65+ enclosure for high humidity or outdoor deployment

### Power Requirements

- **Stable power**: 5V ±5% (4.75V to 5.25V)
- **Current**: 3A for Pi 4, 2.5A for Pi 3B+
- **Battery**: Lithium-ion or LiPo battery pack recommended
- **Solar**: Solar panel with battery backup (optional, for remote deployment)

## Cost Considerations

### Basic Setup (Single Radio)

- Raspberry Pi 4 (4GB): ~$55
- MicroSD card (32GB): ~$10
- Power supply: ~$10
- **Total**: ~$75 per node

### Production Setup (Dual Radio)

- Raspberry Pi 4 (4GB): ~$55
- MicroSD card (64GB): ~$15
- Power supply: ~$10
- USB WiFi adapter: ~$25
- Weatherproof enclosure: ~$20
- **Total**: ~$125 per node

### Mobile Setup

- Raspberry Pi 4 (4GB): ~$55
- MicroSD card (64GB): ~$15
- Battery pack (20,000mAh): ~$30
- USB WiFi adapter: ~$25
- Rugged enclosure: ~$30
- **Total**: ~$155 per node

## Software Requirements

- **Operating System**: Raspberry Pi OS (Bullseye or later)
- **Kernel**: Linux kernel 5.10 or later (batman-adv support)
- **Storage**: 8GB minimum (32GB+ recommended)
- **RAM**: 1GB minimum (2GB+ recommended)

## Network Requirements

### Mesh Network

- **Protocol**: batman-adv (BATMAN_V routing algorithm)
- **Mode**: IBSS (Ad-hoc)
- **Frequency**: 2.4GHz (channels 1-11)
- **Channel**: Same channel for all nodes in mesh
- **IP addressing**: Self-assigned IPv4 link-local (169.254.0.0/16)
- **DHCP**: Disabled (no DHCP server)

### Access Point (Optional)

- **Mode**: AP (Access Point)
- **Security**: WPA2
- **IP addressing**: Self-assigned IPv4 link-local (169.254.0.0/16)
- **DHCP**: Disabled (clients must manually configure IPs)

## Troubleshooting

### Hardware Issues

1. **WiFi not detected**: Check if WiFi adapter is compatible with Linux
2. **Power issues**: Ensure adequate power supply (3A for Pi 4)
3. **Overheating**: Add heatsinks or improve ventilation
4. **SD card corruption**: Use high-quality SD card, enable read-only mode

### Performance Issues

1. **Low throughput**: Check channel interference, use less crowded channel
2. **High latency**: Reduce number of hops, optimize routing
3. **Connection drops**: Check signal strength, reduce distance between nodes
4. **Power consumption**: Disable unnecessary services, use power-saving mode

## Support

For hardware issues or questions:
- Check Raspberry Pi documentation: https://www.raspberrypi.com/documentation/
- Check batman-adv documentation: https://www.open-mesh.org/projects/batman-adv/wiki
- Review setup guide: SETUP.md

