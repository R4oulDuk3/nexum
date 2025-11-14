#!/bin/bash
# Nexum Mesh Network - Uninstall Script
# Removes installed script, systemd unit, and related runtime state

set -e

if [ -z "$BASH_VERSION" ]; then
    exec /bin/bash "$0" "$@"
fi

NON_INTERACTIVE=false
while [ "$#" -gt 0 ]; do
    case "$1" in
        -y|--yes|--force)
            NON_INTERACTIVE=true
            shift
            ;;
        --help|-h)
            echo "Usage: $0 [--yes]"
            echo "Removes the batman-mesh systemd unit and installed setup script." 
            exit 0
            ;;
        *)
            shift
            ;;
    esac
done

if [ "$(id -u)" -ne 0 ]; then
    echo "Please run as root (sudo)"
    exit 1
fi

echo "This will remove the batman-mesh systemd unit and the installed setup script."
if [ "$NON_INTERACTIVE" = false ]; then
    read -p "Continue and remove installed files? (y/N): " REPLY
    if [ "$REPLY" != "y" ] && [ "$REPLY" != "Y" ]; then
        echo "Aborted by user."
        exit 0
    fi
fi

echo "Stopping and disabling batman-mesh.service (if present)..."
systemctl stop batman-mesh.service 2>/dev/null || true
systemctl disable batman-mesh.service 2>/dev/null || true

UNIT_PATH="/etc/systemd/system/batman-mesh.service"
if [ -f "$UNIT_PATH" ]; then
    echo "Removing systemd unit: $UNIT_PATH"
    rm -f "$UNIT_PATH"
    systemctl daemon-reload
    echo "  Removed and reloaded systemd units"
else
    echo "  No systemd unit found at $UNIT_PATH"
fi

SCRIPT_PATH="/usr/local/bin/setup-mesh.sh"
if [ -f "$SCRIPT_PATH" ]; then
    echo "Removing installed script: $SCRIPT_PATH"
    rm -f "$SCRIPT_PATH"
else
    echo "  No installed script found at $SCRIPT_PATH"
fi

# Remove runtime state if present
STATE_DIR="/run/nexum"
if [ -d "$STATE_DIR" ]; then
    echo "Removing runtime state directory: $STATE_DIR"
    rm -rf "$STATE_DIR" || true
fi

# Remove persistent sysctl file if present (created by installer if used)
SYSCTL_CONF="/etc/sysctl.d/99-nexum.conf"
if [ -f "$SYSCTL_CONF" ]; then
    echo "Found persistent sysctl config $SYSCTL_CONF"
    if [ "$NON_INTERACTIVE" = false ]; then
        read -p "Remove $SYSCTL_CONF as well? (y/N): " RR
        if [ "$RR" = "y" ] || [ "$RR" = "Y" ]; then
            rm -f "$SYSCTL_CONF"
            sysctl --system >/dev/null 2>&1 || true
            echo "  Removed $SYSCTL_CONF"
        else
            echo "  Left $SYSCTL_CONF in place"
        fi
    else
        rm -f "$SYSCTL_CONF" || true
        sysctl --system >/dev/null 2>&1 || true
        echo "  Removed $SYSCTL_CONF"
    fi
fi

echo "Uninstall complete."
echo "If you also changed NetworkManager or other system settings, you may want to verify/restore them manually."

exit 0
