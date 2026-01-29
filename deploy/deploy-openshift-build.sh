#!/bin/bash
set -e

# Configuration
NAMESPACE="dmistry"
IMAGE_NAME="ci-docs-test"
CLUSTER="build01"

echo "=========================================="
echo "Deploying CI Docs Test to build01 cluster"
echo "Using OpenShift Build (no local Docker required)"
echo "=========================================="
echo "Namespace: ${NAMESPACE}"
echo "Cluster: ${CLUSTER}"
echo ""

# Set OC context with system:admin
OC_CMD="oc --context ${CLUSTER} --as system:admin"

# Check if we can access the cluster
if ! ${OC_CMD} get nodes &>/dev/null 2>&1; then
    echo "Error: Cannot access ${CLUSTER} cluster"
    exit 1
fi

echo "Using context: build01"
echo "Deploying as: system:admin"
echo ""

# Create namespace if it doesn't exist
echo "Step 1: Ensuring namespace exists..."
if ${OC_CMD} get namespace ${NAMESPACE} &>/dev/null 2>&1; then
    echo "✓ Namespace ${NAMESPACE} already exists"
else
    echo "Creating namespace ${NAMESPACE}..."
    ${OC_CMD} create namespace ${NAMESPACE}
    echo "✓ Namespace ${NAMESPACE} created"
fi
echo ""

# Create ImageStream
echo "Step 2: Creating ImageStream..."
${OC_CMD} create imagestream ${IMAGE_NAME} -n ${NAMESPACE} --dry-run=client -o yaml | ${OC_CMD} apply -f -
echo "✓ ImageStream ready"
echo ""

# Create BuildConfig
echo "Step 3: Creating BuildConfig..."
echo "Note: This will build from the current branch in your repository"
${OC_CMD} apply -f deploy/buildconfig.yaml

if [ $? -ne 0 ]; then
    echo "Error: Failed to create BuildConfig"
    exit 1
fi

echo "✓ BuildConfig created"
echo ""

# Start the build from local directory
echo "Step 4: Starting build from local source..."
echo "This will upload the current directory to the build..."
echo "Note: Ensuring git submodules are initialized..."
cd "$(dirname "$0")/.."  # Go to repo root

# Initialize submodules if needed
if [ -f .gitmodules ]; then
    git submodule update --init --recursive --depth 1 2>/dev/null || echo "Submodules may already be initialized"
fi

${OC_CMD} start-build ${IMAGE_NAME} --from-dir=. -n ${NAMESPACE} --follow

if [ $? -ne 0 ]; then
    echo "Error: Build failed"
    echo "Check build logs with:"
    echo "  ${OC_CMD} logs -n ${NAMESPACE} build/${IMAGE_NAME}-<number>"
    exit 1
fi

echo "✓ Build completed successfully"
echo ""

# Apply deployment manifests (update to use ImageStream)
echo "Step 5: Applying deployment manifests..."
# Update the deployment to use ImageStream instead of external registry
${OC_CMD} apply -f deploy/test-deployment.yaml

# Update deployment to use ImageStream
${OC_CMD} set image deployment/ci-docs-test nginx=${IMAGE_NAME}:latest -n ${NAMESPACE}

echo "✓ Deployment manifests applied"
echo ""

# Wait for deployment to be ready
echo "Step 6: Waiting for deployment to be ready..."
${OC_CMD} rollout status deployment/ci-docs-test -n ${NAMESPACE} --timeout=5m

if [ $? -ne 0 ]; then
    echo "Error: Deployment failed to become ready"
    echo "Check logs with: ${OC_CMD} logs -n ${NAMESPACE} -l app=ci-docs-test"
    exit 1
fi

echo "✓ Deployment is ready"
echo ""

# Get the route URL
echo "Step 7: Getting route URL..."
ROUTE_URL=$(${OC_CMD} get route ci-docs-test -n ${NAMESPACE} -o jsonpath='{.spec.host}' 2>/dev/null)

if [ -z "${ROUTE_URL}" ]; then
    echo "Warning: Could not get route URL"
    echo "Check route with: ${OC_CMD} get route -n ${NAMESPACE}"
else
    echo ""
    echo "=========================================="
    echo "✓ Deployment successful!"
    echo "=========================================="
    echo "Access your test deployment at:"
    echo "  https://${ROUTE_URL}"
    echo ""
    echo "To check status:"
    echo "  ${OC_CMD} get pods -n ${NAMESPACE}"
    echo "  ${OC_CMD} get route -n ${NAMESPACE}"
    echo ""
    echo "To view logs:"
    echo "  ${OC_CMD} logs -n ${NAMESPACE} -l app=ci-docs-test"
    echo ""
    echo "To delete the deployment:"
    echo "  ${OC_CMD} delete -f deploy/test-deployment.yaml"
    echo "  ${OC_CMD} delete buildconfig ${IMAGE_NAME} -n ${NAMESPACE}"
    echo "=========================================="
fi

