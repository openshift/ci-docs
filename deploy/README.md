# Test Deployment Guide

This directory contains manifests and scripts to deploy a test version of the CI docs to the build01 cluster in the `dmistry` namespace.

## Prerequisites

1. **Access to build01 cluster**
   ```bash
   oc login <build01-cluster-url>
   ```

2. **Docker access to registry**
   ```bash
   docker login registry.ci.openshift.org
   ```

3. **Required tools**
   - `oc` (OpenShift CLI)
   - `docker` or `podman`
   - Access to `dmistry` namespace on build01

## Quick Deploy

```bash
# Make the script executable
chmod +x deploy/deploy.sh

# Run the deployment script
./deploy/deploy.sh
```

The script will:
1. Build the Docker image
2. Push it to `registry.ci.openshift.org/dmistry/ci-docs-test:latest`
3. Create/verify the namespace
4. Deploy the application
5. Display the route URL

## Manual Deployment

If you prefer to deploy manually:

### 1. Build and Push Image

```bash
docker build -t registry.ci.openshift.org/dmistry/ci-docs-test:latest -f Dockerfile .
docker push registry.ci.openshift.org/dmistry/ci-docs-test:latest
```

### 2. Apply Manifests

```bash
oc apply -f deploy/test-deployment.yaml
```

### 3. Check Status

```bash
# Check pods
oc get pods -n dmistry

# Check route
oc get route -n dmistry

# View logs
oc logs -n dmistry -l app=ci-docs-test
```

## Accessing the Deployment

After deployment, get the route URL:

```bash
oc get route ci-docs-test -n dmistry -o jsonpath='{.spec.host}'
```

The site will be available at: `https://<route-host>`

## Differences from Production

This test deployment:
- Uses namespace `dmistry` (not the production namespace)
- Uses service name `ci-docs-test` (not `ci-docs`)
- Uses different route name to avoid conflicts
- Uses a different image name/tag
- Has minimal resources (1 replica, lower resource limits)

## Troubleshooting

### Image Build Fails

```bash
# Check Dockerfile
cat Dockerfile

# Build locally to test
docker build -t test-build -f Dockerfile .
```

### Image Push Fails

```bash
# Verify registry login
docker login registry.ci.openshift.org

# Check permissions
oc whoami
```

### Deployment Not Ready

```bash
# Check pod status
oc get pods -n dmistry

# Check pod logs
oc logs -n dmistry -l app=ci-docs-test

# Check events
oc get events -n dmistry --sort-by='.lastTimestamp'
```

### Route Not Accessible

```bash
# Check route
oc get route -n dmistry

# Check service
oc get svc -n dmistry

# Check endpoints
oc get endpoints -n dmistry
```

## Cleanup

To remove the test deployment:

```bash
oc delete -f deploy/test-deployment.yaml
```

Or delete individual resources:

```bash
oc delete deployment ci-docs-test -n dmistry
oc delete service ci-docs-test -n dmistry
oc delete route ci-docs-test -n dmistry
```

## Updating the Deployment

To update after making changes:

1. Make your code changes
2. Rebuild and push the image:
   ```bash
   docker build -t registry.ci.openshift.org/dmistry/ci-docs-test:latest -f Dockerfile .
   docker push registry.ci.openshift.org/dmistry/ci-docs-test:latest
   ```
3. Restart the deployment:
   ```bash
   oc rollout restart deployment/ci-docs-test -n dmistry
   ```

Or use the deployment script again - it will rebuild and redeploy.

