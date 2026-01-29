#!/bin/bash
set -e

# Configuration
NAMESPACE="dmistry"
IMAGE_NAME="ci-docs-test"
IMAGE_TAG="latest"
REGISTRY="registry.ci.openshift.org"
FULL_IMAGE="${REGISTRY}/${NAMESPACE}/${IMAGE_NAME}:${IMAGE_TAG}"
CLUSTER="build01"

echo "=========================================="
echo "Deploying CI Docs Test to build01 cluster"
echo "=========================================="
echo "Namespace: ${NAMESPACE}"
echo "Image: ${FULL_IMAGE}"
echo "Cluster: ${CLUSTER}"
echo ""

# Set OC context with system:admin
OC_CMD="oc --context ${CLUSTER} --as system:admin"

# Check if we can access the cluster (try a simple command)
if ! ${OC_CMD} get nodes &>/dev/null 2>&1; then
    echo "Error: Cannot access ${CLUSTER} cluster"
    echo "Please ensure:"
    echo "  1. You're logged in: oc login <cluster-url>"
    echo "  2. Context is set: oc config use-context ${CLUSTER}"
    exit 1
fi

# Check current context
CURRENT_CONTEXT=$(oc config current-context 2>/dev/null || echo "build01")
echo "Using context: ${CURRENT_CONTEXT}"
echo "Deploying as: system:admin"
echo ""

# Build the container image
echo "Step 1: Building container image..."
# Try podman first (works without sudo), then docker
if podman ps &>/dev/null 2>&1; then
    CONTAINER_CMD="podman"
    echo "Using podman"
elif docker ps &>/dev/null 2>&1; then
    CONTAINER_CMD="docker"
    echo "Using docker"
elif sudo docker ps &>/dev/null 2>&1; then
    CONTAINER_CMD="sudo docker"
    echo "Using sudo docker"
else
    echo "Error: Cannot access container runtime (podman/docker)"
    echo ""
    echo "Options:"
    echo "  1. Use OpenShift build (no local container runtime needed):"
    echo "     ./deploy/deploy-openshift-build.sh"
    echo ""
    echo "  2. Add your user to the docker group:"
    echo "     sudo usermod -aG docker $USER"
    echo "     (then log out and back in)"
    echo ""
    echo "  3. Run this script with sudo:"
    echo "     sudo ./deploy/deploy.sh"
    exit 1
fi

${CONTAINER_CMD} build -t ${FULL_IMAGE} -f Dockerfile .

if [ $? -ne 0 ]; then
    echo "Error: Docker build failed"
    exit 1
fi

echo "✓ Docker image built successfully"
echo ""

# Push the image to registry
echo "Step 2: Pushing image to registry..."
${CONTAINER_CMD} push ${FULL_IMAGE}

if [ $? -ne 0 ]; then
    echo "Error: Docker push failed"
    echo "Make sure you're logged into the registry:"
    echo "  docker login ${REGISTRY}"
    exit 1
fi

echo "✓ Image pushed successfully"
echo ""

# Create namespace if it doesn't exist
echo "Step 3: Ensuring namespace exists..."
if ${OC_CMD} get namespace ${NAMESPACE} &>/dev/null 2>&1; then
    echo "✓ Namespace ${NAMESPACE} already exists"
else
    echo "Creating namespace ${NAMESPACE}..."
    ${OC_CMD} create namespace ${NAMESPACE}
    if [ $? -ne 0 ]; then
        echo "Error: Failed to create namespace"
        exit 1
    fi
    echo "✓ Namespace ${NAMESPACE} created"
fi

# Check permissions (using system:admin should have all permissions)
echo "Checking permissions..."
if ! ${OC_CMD} auth can-i create deployments -n ${NAMESPACE} &>/dev/null; then
    echo "Warning: Cannot create deployments even with system:admin"
    echo "This may indicate a cluster configuration issue"
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
else
    echo "✓ Permissions verified"
fi

echo "✓ Namespace ready"
echo ""

# Apply deployment manifests
echo "Step 4: Applying deployment manifests..."
${OC_CMD} apply -f deploy/test-deployment.yaml

if [ $? -ne 0 ]; then
    echo "Error: Failed to apply manifests"
    exit 1
fi

echo "✓ Deployment manifests applied"
echo ""

# Wait for deployment to be ready
echo "Step 5: Waiting for deployment to be ready..."
${OC_CMD} rollout status deployment/ci-docs-test -n ${NAMESPACE} --timeout=5m

if [ $? -ne 0 ]; then
    echo "Error: Deployment failed to become ready"
    echo "Check logs with: oc logs -n ${NAMESPACE} deployment/ci-docs-test"
    exit 1
fi

echo "✓ Deployment is ready"
echo ""

# Get the route URL
echo "Step 6: Getting route URL..."
ROUTE_URL=$(${OC_CMD} get route ci-docs-test -n ${NAMESPACE} -o jsonpath='{.spec.host}' 2>/dev/null)

if [ -z "${ROUTE_URL}" ]; then
    echo "Warning: Could not get route URL"
    echo "Check route with: oc --context ${CLUSTER} get route -n ${NAMESPACE}"
else
    echo ""
    echo "=========================================="
    echo "✓ Deployment successful!"
    echo "=========================================="
    echo "Access your test deployment at:"
    echo "  https://${ROUTE_URL}"
    echo ""
    echo "To check status:"
    echo "  oc --context ${CLUSTER} get pods -n ${NAMESPACE}"
    echo "  oc --context ${CLUSTER} get route -n ${NAMESPACE}"
    echo ""
    echo "To view logs:"
    echo "  oc --context ${CLUSTER} logs -n ${NAMESPACE} -l app=ci-docs-test"
    echo ""
    echo "To delete the deployment:"
    echo "  oc --context ${CLUSTER} delete -f deploy/test-deployment.yaml"
    echo "=========================================="
fi

