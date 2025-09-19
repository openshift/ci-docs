---
title: "Quick Reference"
description: Common commands, patterns, and snippets for OpenShift CI
weight: 5
---

# Quick Reference

This page provides quick access to commonly used commands, configurations, and patterns in OpenShift CI.

## Prow Commands

### PR Management
```bash
# Trigger tests
/retest              # Rerun all failed required tests
/test <job-name>     # Run specific test
/test all            # Run all tests
/retest-required     # Rerun only failed required tests

# PR control
/hold                # Prevent auto-merge
/hold cancel         # Remove hold
/lgtm                # Approve (for reviewers)
/lgtm cancel         # Remove approval
/approve             # Approve (for approvers)
/approve cancel      # Remove approval

# Skip tests
/skip-test <job>     # Skip specific test
/override <job>      # Override failing required test
```

### Labels
```bash
# Common labels
/label needs-rebase
/label do-not-merge/work-in-progress
/remove-label needs-rebase

# Jira integration
/jira refresh        # Refresh Jira validation
```

## CI Configuration Snippets

### Basic Container Test
```yaml
tests:
- as: unit-test
  commands: make test
  container:
    from: src
```

### Multi-stage Test with Cluster
```yaml
tests:
- as: e2e-aws
  steps:
    cluster_profile: aws
    workflow: openshift-e2e-aws
```

### Custom Multi-stage Test
```yaml
tests:
- as: my-e2e-test
  steps:
    cluster_profile: aws
    pre:
    - as: setup
      commands: |
        echo "Setting up test environment"
      from: src
      resources:
        requests:
          cpu: 100m
          memory: 200Mi
    test:
    - as: test
      commands: make e2e-test
      from: src
      resources:
        requests:
          cpu: 1000m
          memory: 2Gi
    post:
    - as: cleanup
      commands: |
        echo "Cleaning up"
      from: src
    workflow: ipi-aws
```

### Conditional Test Execution
```yaml
tests:
- as: frontend-test
  run_if_changed: "^(frontend|web)/"
  commands: npm test
  container:
    from: node
```

### Optional Test
```yaml
tests:
- as: expensive-test
  optional: true
  commands: make slow-test
  container:
    from: src
```

### Periodic Test
```yaml
tests:
- as: nightly-e2e
  cron: "0 0 * * *"  # Daily at midnight UTC
  steps:
    cluster_profile: aws
    workflow: openshift-e2e-aws
```

## Release Configuration

### Integration Release
```yaml
releases:
  latest:
    integration:
      namespace: ocp
      name: "4.15"
```

### Stable Release
```yaml
releases:
  latest:
    release:
      channel: stable
      version: "4.14"
```

### Multiple Releases (for upgrade tests)
```yaml
releases:
  initial:
    release:
      channel: stable
      version: "4.13"
  latest:
    release:
      channel: stable  
      version: "4.14"
```

## Image Configuration

### Base Images
```yaml
base_images:
  cli:
    namespace: ocp
    name: "4.15"
    tag: cli
  upi-installer:
    namespace: ocp
    name: "4.15"
    tag: upi-installer
```

### Building Images
```yaml
images:
- from: base
  to: my-app
  dockerfile_path: Dockerfile
```

### Image Promotion
```yaml
promotion:
  to:
  - namespace: my-namespace
    name: my-app
    tag: latest
```

## Common Environment Variables

### In Test Steps
```bash
${ARTIFACT_DIR}       # Where to save test artifacts
${SHARED_DIR}         # Share data between steps
${KUBECONFIG}         # Cluster access (after install)
${CLUSTER_PROFILE_DIR} # Cloud credentials location
${RELEASE_IMAGE_LATEST} # Latest release image
${CLUSTER_NAME}       # Name of test cluster
${NAMESPACE}          # Test namespace
${JOB_NAME_SAFE}      # Safe job name for resources
```

### For Multi-arch
```bash
${GOARCH}             # Architecture (amd64, arm64, etc)
${IMAGE_FORMAT}       # Registry format string
```

## Resource Management

### Resource Requests
```yaml
resources:
  requests:
    cpu: 100m
    memory: 200Mi
  limits:
    memory: 4Gi
```

### Timeout Configuration
```yaml
tests:
- as: long-test
  timeout: 6h0m0s  # Job timeout
  steps:
    test:
    - as: test-step
      timeout: 2h0m0s  # Step timeout
      grace_period: 30s
```

## Secrets and Credentials

### Mount Secret in Step
```yaml
steps:
  test:
  - as: use-secret
    credentials:
    - namespace: test-credentials
      name: my-secret
      mount_path: /var/run/secrets/my-secret
    commands: |
      export TOKEN=$(cat /var/run/secrets/my-secret/token)
```

### Cluster Profile Credentials
```yaml
# AWS credentials at:
${CLUSTER_PROFILE_DIR}/.awscred

# GCP credentials at:
${CLUSTER_PROFILE_DIR}/gce.json

# Pull secret at:
${CLUSTER_PROFILE_DIR}/pull-secret
```

## Debugging Commands

### In Test Steps
```bash
# Save debugging info
env | sort > ${ARTIFACT_DIR}/environment.txt
oc get pods --all-namespaces > ${ARTIFACT_DIR}/pods.txt
oc get nodes -o yaml > ${ARTIFACT_DIR}/nodes.yaml

# Cluster info
oc version
oc get clusterversion
oc get clusteroperators

# Must-gather
oc adm must-gather --dest-dir=${ARTIFACT_DIR}/must-gather
```

### Common Debugging Patterns
```bash
# Fail gracefully with debugging
command || {
    echo "Command failed, gathering debug info..."
    oc get pods -n my-namespace
    oc logs deployment/my-app -n my-namespace
    exit 1
}

# Wait for condition
oc wait --for=condition=Available deployment/my-app \
  --timeout=300s -n my-namespace
```

## Make Targets (in openshift/release)

```bash
# Validate configuration
make validate-config

# Generate jobs
make jobs

# Update job configuration
make update

# Run rehearsals
make rehearse

# Specific config
make WHAT=my-repo CONFIG=my-config jobs
```

## Common Patterns

### Wait for Operator
```bash
# Wait for operator deployment
oc wait --for=condition=Available \
  deployment/my-operator \
  -n my-operator-namespace \
  --timeout=10m

# Wait for CRD
timeout 300s bash -c 'until oc get crd my-crds.example.com; do sleep 5; done'
```

### Create and Wait for Resource
```bash
# Apply configuration
oc apply -f config/

# Wait for rollout
oc rollout status deployment/my-app -n my-namespace

# Verify pods are running
oc get pods -n my-namespace | grep Running
```

### Retry Pattern
```bash
# Retry command up to 5 times
for i in {1..5}; do
    command && break || sleep 30
done
```

### Check Resource Existence
```bash
# Check if namespace exists
if oc get namespace my-namespace 2>/dev/null; then
    echo "Namespace exists"
else
    oc create namespace my-namespace
fi
```

## Useful Links

### Dashboards
- [Prow Status](https://prow.ci.openshift.org/)
- [Step Registry](https://steps.ci.openshift.org/)
- [TestGrid](https://testgrid.k8s.io/redhat)
- [Sippy](https://sippy.dptools.openshift.org/)

### Documentation
- [This Site](/)
- [Prow Commands](https://prow.ci.openshift.org/command-help)
- [CI Search](https://search.ci.openshift.org/)

### Repositories
- [openshift/release](https://github.com/openshift/release) - CI configs
- [openshift/ci-tools](https://github.com/openshift/ci-tools) - CI tooling

## Need More?

- Full command documentation: `/docs/architecture/`
- Troubleshooting: `/docs/troubleshooting/`
- Ask in Slack: `#forum-ocp-testplatform` 