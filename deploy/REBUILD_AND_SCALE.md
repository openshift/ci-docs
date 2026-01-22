# Rebuild and Scale Commands

Quick reference for rebuilding and scaling the `ci-docs-test` deployment.

## Configuration

```bash
NAMESPACE="dmistry"
IMAGE_NAME="ci-docs-test"
CLUSTER="build01"
OC_CMD="oc --context ${CLUSTER} --as system:admin"
```

## Rebuild Commands

### Option 1: Rebuild from Local Source (Current Directory)

This is the fastest way to rebuild with your current local changes:

```bash
# From the repository root directory
cd /home/dmistry/CI/ci-docs

# Ensure git submodules are initialized
git submodule update --init --recursive || echo "Submodules already initialized"

# Trigger a new build from current directory
oc --context build01 --as system:admin start-build ci-docs-test --from-dir=. -n dmistry --follow

# Or without following (build runs in background)
oc --context build01 --as system:admin start-build ci-docs-test --from-dir=. -n dmistry
```

### Option 2: Rebuild from Specific Commit

```bash
# Checkout the commit you want to build
git checkout <commit-hash>

# Ensure submodules are initialized
git submodule update --init --recursive

# Trigger build from current directory
oc --context build01 --as system:admin start-build ci-docs-test --from-dir=. -n dmistry --follow
```

### Option 3: Rebuild from PR Branch

```bash
# Fetch and checkout the PR branch
git fetch origin pull/<PR-number>/head:<pr-branch-name>
git checkout <pr-branch-name>

# Ensure submodules are initialized
git submodule update --init --recursive

# Trigger build
oc --context build01 --as system:admin start-build ci-docs-test --from-dir=. -n dmistry --follow
```

### Option 4: Rebuild from Git Repository (Requires Git BuildConfig)

If you have a Git-based BuildConfig (not currently configured), you would use:

```bash
# Update BuildConfig to point to specific branch/commit
oc --context build01 --as system:admin set env bc/ci-docs-test GIT_REF=<branch-or-commit> -n dmistry

# Trigger build
oc --context build01 --as system:admin start-build ci-docs-test -n dmistry --follow
```

## Monitor Build Status

```bash
# List all builds
oc --context build01 --as system:admin get builds -n dmistry -l app=ci-docs-test

# Watch build status
oc --context build01 --as system:admin get builds -n dmistry -l app=ci-docs-test -w

# View build logs
oc --context build01 --as system:admin logs -n dmistry build/ci-docs-test-<build-number>

# Get latest build
LATEST_BUILD=$(oc --context build01 --as system:admin get builds -n dmistry -l app=ci-docs-test -o jsonpath='{.items[0].metadata.name}')
oc --context build01 --as system:admin logs -n dmistry build/${LATEST_BUILD} --follow
```

## Scale Deployment Commands

### Scale Up/Down

```bash
# Scale to specific number of replicas
oc --context build01 --as system:admin scale deployment/ci-docs-test --replicas=<number> -n dmistry

# Examples:
oc --context build01 --as system:admin scale deployment/ci-docs-test --replicas=1 -n dmistry
oc --context build01 --as system:admin scale deployment/ci-docs-test --replicas=2 -n dmistry
oc --context build01 --as system:admin scale deployment/ci-docs-test --replicas=3 -n dmistry
```

### Scale Down to Zero (Stop Deployment)

```bash
oc --context build01 --as system:admin scale deployment/ci-docs-test --replicas=0 -n dmistry
```

### Scale Up from Zero

```bash
oc --context build01 --as system:admin scale deployment/ci-docs-test --replicas=1 -n dmistry
```

## Check Deployment Status

```bash
# Get deployment status
oc --context build01 --as system:admin get deployment/ci-docs-test -n dmistry

# Get pods
oc --context build01 --as system:admin get pods -n dmistry -l app=ci-docs-test

# Watch pods
oc --context build01 --as system:admin get pods -n dmistry -l app=ci-docs-test -w

# Check rollout status
oc --context build01 --as system:admin rollout status deployment/ci-docs-test -n dmistry

# View pod logs
oc --context build01 --as system:admin logs -n dmistry -l app=ci-docs-test --tail=50 -f
```

## Complete Rebuild and Deploy Workflow

```bash
#!/bin/bash
# Complete rebuild and deploy workflow

NAMESPACE="dmistry"
IMAGE_NAME="ci-docs-test"
CLUSTER="build01"
OC_CMD="oc --context ${CLUSTER} --as system:admin"

# 1. Ensure we're in the repo root
cd /home/dmistry/CI/ci-docs

# 2. Initialize submodules
echo "Initializing git submodules..."
git submodule update --init --recursive || echo "Submodules already initialized"

# 3. Trigger build
echo "Starting build..."
${OC_CMD} start-build ${IMAGE_NAME} --from-dir=. -n ${NAMESPACE} --follow

# 4. Wait for build to complete (if not using --follow)
# ${OC_CMD} wait --for=condition=complete build/${IMAGE_NAME}-<number> -n ${NAMESPACE} --timeout=10m

# 5. Restart deployment to pick up new image
echo "Restarting deployment..."
${OC_CMD} rollout restart deployment/${IMAGE_NAME} -n ${NAMESPACE}

# 6. Wait for rollout
echo "Waiting for rollout to complete..."
${OC_CMD} rollout status deployment/${IMAGE_NAME} -n ${NAMESPACE} --timeout=5m

# 7. Get route URL
echo ""
echo "Deployment complete!"
ROUTE_URL=$(${OC_CMD} get route ${IMAGE_NAME} -n ${NAMESPACE} -o jsonpath='https://{.spec.host}' 2>/dev/null)
if [ -n "${ROUTE_URL}" ]; then
    echo "Access your deployment at: ${ROUTE_URL}"
else
    echo "Route not found. Check with: ${OC_CMD} get route -n ${NAMESPACE}"
fi
```

## Quick Commands Reference

```bash
# Rebuild from current directory
oc --context build01 --as system:admin start-build ci-docs-test --from-dir=. -n dmistry --follow

# Scale to 2 replicas
oc --context build01 --as system:admin scale deployment/ci-docs-test --replicas=2 -n dmistry

# Scale down to 0 (stop)
oc --context build01 --as system:admin scale deployment/ci-docs-test --replicas=0 -n dmistry

# Restart deployment (picks up new image)
oc --context build01 --as system:admin rollout restart deployment/ci-docs-test -n dmistry

# Check status
oc --context build01 --as system:admin get deployment/ci-docs-test -n dmistry
oc --context build01 --as system:admin get pods -n dmistry -l app=ci-docs-test

# View logs
oc --context build01 --as system:admin logs -n dmistry -l app=ci-docs-test --tail=50 -f

# Get route URL
oc --context build01 --as system:admin get route ci-docs-test -n dmistry -o jsonpath='https://{.spec.host}'
```

## Troubleshooting

### Build Fails

```bash
# Check build logs
LATEST_BUILD=$(oc --context build01 --as system:admin get builds -n dmistry -l app=ci-docs-test -o jsonpath='{.items[0].metadata.name}' | head -1)
oc --context build01 --as system:admin logs -n dmistry build/${LATEST_BUILD}

# Check build events
oc --context build01 --as system:admin describe build/${LATEST_BUILD} -n dmistry
```

### Deployment Not Updating

```bash
# Force rollout restart
oc --context build01 --as system:admin rollout restart deployment/ci-docs-test -n dmistry

# Check image being used
oc --context build01 --as system:admin get deployment/ci-docs-test -n dmistry -o jsonpath='{.spec.template.spec.containers[0].image}'

# Check ImageStream
oc --context build01 --as system:admin get imagestream/ci-docs-test -n dmistry
```

### Pods Not Starting

```bash
# Check pod status
oc --context build01 --as system:admin get pods -n dmistry -l app=ci-docs-test

# Describe pod for events
oc --context build01 --as system:admin describe pod -n dmistry -l app=ci-docs-test

# Check pod logs
oc --context build01 --as system:admin logs -n dmistry -l app=ci-docs-test --tail=100
```

