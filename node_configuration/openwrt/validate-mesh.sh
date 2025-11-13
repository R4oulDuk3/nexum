#!/bin/sh
# Nexum Mesh Network - OpenWrt Validation Script
# This script validates that the mesh network setup is successful on OpenWrt

echo "========================================="
echo "Nexum Mesh Network - OpenWrt Validation"
echo "========================================="
echo ""

PASSED=0
FAILED=0
WARNINGS=0

# Simple status print
print_status() {
    status=$1
    message=$2
    if [ "$status" = "PASS" ]; then
        echo "✓ $message"
        PASSED=$((PASSED + 1))
    elif [ "$status" = "FAIL" ]; then
        echo "✗ $message"
        FAILED=$((FAILED + 1))
    elif [ "$status" = "WARN" ]; then
        echo "⚠ $message"
        WARNINGS=$((WARNINGS + 1))
    else
        echo "  $message"
    fi
}

echo "Checking mesh network configuration..."
echo ""

# 1. Check batman-adv module
echo "1. Checking batman-adv kernel module..."
if lsmod | grep -q batman_adv; then
    print_status "PASS" "batman-adv module is loaded"
else
    print_status "FAIL" "batman-adv module is NOT loaded"
fi
echo ""

# 2. Check bat0 interface
echo "2. Checking bat0 mesh interface..."
if ip link show bat0 &>/dev/null; then
    print_status "PASS" "bat0 interface exists"
    if ip link show bat0 | grep -q "state UP"; then
        print_status "PASS" "bat0 interface is UP"
    else
        print_status "FAIL" "bat0 interface is DOWN"
    fi
    if ip addr show bat0 | grep -q "inet "; then
        BAT0_IP=$(ip addr show bat0 | grep "inet " | awk '{print $2}' | cut -d'/' -f1)
        print_status "PASS" "bat0 has IP address: $BAT0_IP"
    else
        print_status "FAIL" "bat0 has NO IP address"
    fi
else
    print_status "FAIL" "bat0 interface does NOT exist"
fi
echo ""

# 3. Check wireless configuration
echo "3. Checking wireless configuration..."
if uci show wireless | grep -q "mode='adhoc'"; then
    print_status "PASS" "Wireless interface configured for adhoc mode"
else
    print_status "FAIL" "Wireless interface not configured for adhoc mode"
fi
echo ""

# 4. Check batman-adv interface
echo "4. Checking batman-adv interface assignment..."
if command -v batctl >/dev/null 2>&1; then
    if batctl if 2>/dev/null | grep -q "active"; then
        print_status "PASS" "Interface added to batman-adv"
    else
        print_status "FAIL" "No interface added to batman-adv"
    fi
else
    print_status "WARN" "batctl command not found"
fi
echo ""

# 5. Check mesh originators
echo "5. Checking mesh originators..."
if command -v batctl >/dev/null 2>&1; then
    ORIG_COUNT=$(batctl o 2>/dev/null | grep -v "^$" | wc -l)
    if [ "$ORIG_COUNT" -eq 0 ]; then
        print_status "WARN" "No other mesh nodes found (normal if first/only node)"
    else
        print_status "PASS" "Found $ORIG_COUNT originator(s) in mesh"
    fi
fi
echo ""

# 6. Check network configuration
echo "6. Checking network configuration..."
if uci show network.mesh &>/dev/null; then
    print_status "PASS" "Mesh network interface configured in UCI"
else
    print_status "WARN" "Mesh network interface not in UCI config"
fi
echo ""

# 7. Check IP forwarding
echo "7. Checking IP forwarding..."
if [ "$(cat /proc/sys/net/ipv4/ip_forward 2>/dev/null)" = "1" ]; then
    print_status "PASS" "IP forwarding is enabled"
else
    print_status "FAIL" "IP forwarding is disabled"
fi
echo ""

# Summary
echo "========================================="
echo "Validation Summary"
echo "========================================="
echo "Passed: $PASSED"
echo "Failed: $FAILED"
echo "Warnings: $WARNINGS"
echo ""

if [ $FAILED -eq 0 ]; then
    echo "✓ Mesh network setup appears to be successful!"
    exit 0
else
    echo "✗ Mesh network setup has issues that need attention."
    exit 1
fi

