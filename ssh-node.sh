#!/bin/bash
# SSH into a build01 node using keys from /home/dmistry/keys/build02

set -e

CLUSTER="build01"
KEY_FILE="/home/dmistry/keys/build02"
OC_CMD="oc --context ${CLUSTER}"

# Check if key file exists
if [ ! -f "${KEY_FILE}" ]; then
    echo "Error: Key file ${KEY_FILE} not found"
    exit 1
fi

# Set proper permissions on key file
chmod 600 "${KEY_FILE}" 2>/dev/null || true

# Check if we can access the cluster
if ! ${OC_CMD} get nodes &>/dev/null 2>&1; then
    echo "Error: Cannot access ${CLUSTER} cluster"
    exit 1
fi

# If node name provided as argument, use it
if [ $# -eq 1 ]; then
    NODE_NAME="$1"
    # Remove 'node/' prefix if present
    NODE_NAME="${NODE_NAME#node/}"
else
    # List nodes and let user select
    echo "Available nodes in ${CLUSTER}:"
    echo ""
    ${OC_CMD} get nodes -o custom-columns=NAME:.metadata.name,EXTERNAL-IP:.status.addresses[?\(@.type==\"ExternalIP\"\)].address,INTERNAL-IP:.status.addresses[?\(@.type==\"InternalIP\"\)].address,ROLES:.status.capacity.kubernetes\\.io/arch --no-headers | nl -v 1 -w 2 -s '. '
    echo ""
    read -p "Enter node number or node name: " INPUT
    
    # Check if input is a number
    if [[ "$INPUT" =~ ^[0-9]+$ ]]; then
        NODE_NAME=$(${OC_CMD} get nodes -o custom-columns=NAME:.metadata.name --no-headers | sed -n "${INPUT}p")
        if [ -z "$NODE_NAME" ]; then
            echo "Error: Invalid node number"
            exit 1
        fi
    else
        NODE_NAME="$INPUT"
        # Remove 'node/' prefix if present
        NODE_NAME="${NODE_NAME#node/}"
    fi
fi

# Get node external IP
NODE_IP=$(${OC_CMD} get node "${NODE_NAME}" -o jsonpath='{.status.addresses[?(@.type=="ExternalIP")].address}' 2>/dev/null)

if [ -z "$NODE_IP" ]; then
    echo "Error: Could not get external IP for node ${NODE_NAME}"
    echo "Trying to use internal IP or hostname..."
    NODE_IP=$(${OC_CMD} get node "${NODE_NAME}" -o jsonpath='{.status.addresses[?(@.type=="InternalIP")].address}' 2>/dev/null)
    if [ -z "$NODE_IP" ]; then
        NODE_IP="${NODE_NAME}"
    fi
fi

echo ""
echo "Connecting to node: ${NODE_NAME}"
echo "Using IP: ${NODE_IP}"
echo "Using key: ${KEY_FILE}"
echo ""

# Try SSH first
echo "Attempting SSH connection..."
if timeout 5 ssh -i "${KEY_FILE}" -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=5 core@${NODE_IP} "echo 'SSH connection successful'" 2>/dev/null; then
    echo "SSH connection successful! Opening interactive session..."
    ssh -i "${KEY_FILE}" -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null core@${NODE_IP}
else
    echo "SSH connection failed (likely due to network/firewall restrictions)"
    echo ""
    echo "Falling back to 'oc debug node' method..."
    echo "This uses OpenShift's built-in node debugging feature."
    echo "Note: Run 'chroot /host' to access host binaries and filesystem"
    echo ""
    ${OC_CMD} --as system:admin debug node/${NODE_NAME}
fi

