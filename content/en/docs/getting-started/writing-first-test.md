---
title: "Writing Your First Test"
description: A step-by-step guide to creating your first CI test
weight: 3
---

# Writing Your First Test

This guide will walk you through creating your first test in OpenShift CI. We'll start simple and gradually add more features.

## Prerequisites

Before starting, make sure you have:
- A repository in the `openshift` GitHub organization (or one that's been onboarded to OpenShift CI)
- Basic understanding of YAML
- Familiarity with the [Core Concepts]({{< ref "concepts" >}})

## Step 1: Create a Simple Container Test

Let's start with the simplest type of test - running a command in a container.

Create a file named `.ci-operator.yaml` in your repository root:

```yaml
tests:
- as: my-first-test           # Name of your test
  commands: |                 # Commands to run
    echo "Hello from OpenShift CI!"
    go test ./...            # Example: run Go tests
  container:
    from: src                # Use the source code image
```

This test will:
1. Clone your repository
2. Run the specified commands
3. Report success or failure

## Step 2: Understanding the Test Environment

When your test runs, it has access to several things:

### Environment Variables
- `${SHARED_DIR}` - Share files between test steps
- `${ARTIFACT_DIR}` - Store test artifacts and logs

### Example: Saving Test Results
```yaml
tests:
- as: test-with-artifacts
  commands: |
    # Run tests and save results
    go test -v ./... | tee ${ARTIFACT_DIR}/test-results.txt
    
    # Save coverage report
    go test -coverprofile=${ARTIFACT_DIR}/coverage.out ./...
  container:
    from: src
```

## Step 3: Using Base Images

If your test needs specific tools, you can use different base images:

```yaml
base_images:
  golangci-lint:           # Define a base image
    namespace: ci
    name: golangci-lint
    tag: v1.54.2

tests:
- as: lint
  commands: golangci-lint run ./...
  container:
    from: golangci-lint    # Use the defined base image
```

## Step 4: Creating a Multi-Stage Test

For more complex scenarios, use multi-stage tests with the step registry:

```yaml
tests:
- as: e2e-aws
  steps:
    cluster_profile: aws              # Use AWS credentials
    workflow: openshift-e2e-aws       # Use a pre-defined workflow
```

This will:
1. Create an OpenShift cluster on AWS
2. Run the default OpenShift e2e tests
3. Collect logs and tear down the cluster

## Step 5: Customizing Multi-Stage Tests

You can customize workflows by adding your own test steps:

```yaml
tests:
- as: e2e-my-operator
  steps:
    cluster_profile: aws
    test:
    - as: deploy-operator
      commands: |
        # Deploy your operator
        oc create -f deploy/
        
        # Wait for rollout
        oc wait --for=condition=Available deployment/my-operator
      from: src
      resources:
        requests:
          cpu: 100m
          memory: 200Mi
    - as: run-tests
      commands: |
        # Run operator tests
        make test-e2e
      from: src
      resources:
        requests:
          cpu: 1000m
          memory: 2Gi
    workflow: ipi-aws        # Install, test, and deprovision cluster
```

## Step 6: Adding Your Test to CI

Once you've defined your test, you need to:

1. **Create the CI configuration**: Place your config in the `openshift/release` repository at:
   ```
   ci-operator/config/<org>/<repo>/<org>-<repo>-<branch>.yaml
   ```

2. **Generate the ProwJob**: Run the generation tool:
   ```bash
   make jobs
   ```

3. **Submit a PR**: The Test Platform team will review your configuration

## Common Patterns

### Pattern 1: Building and Testing Images
```yaml
images:
- from: base
  to: my-app
  dockerfile_path: Dockerfile

tests:
- as: verify-image
  commands: |
    # Test the built image
    podman run --rm ${IMAGE_FORMAT}/my-app:latest --version
  container:
    from: src
```

### Pattern 2: Running Tests Against a Live Cluster
```yaml
tests:
- as: cluster-tests
  steps:
    cluster_profile: aws
    test:
    - ref: my-test-suite     # Reference a step from the registry
    workflow: openshift-e2e-aws
```

### Pattern 3: Conditional Test Execution
```yaml
tests:
- as: optional-test
  optional: true            # Don't block PR merges
  commands: make slow-tests
  container:
    from: src
```

## Debugging Failed Tests

When your test fails:

1. **Check the Prow UI**: Click on the failed test in your PR
2. **Look at artifacts**: Download logs from `artifacts/` directory
3. **Review the build log**: Check for compilation or setup errors
4. **Use the shared directory**: Add debug information:
   ```bash
   echo "Debug info" > ${SHARED_DIR}/debug.txt
   ```

## Best Practices

1. **Keep tests focused**: One test should validate one thing
2. **Use meaningful names**: `as: test-authentication` not `as: test1`
3. **Set appropriate timeouts**: Don't let tests run forever
4. **Clean up resources**: Always clean up in post steps
5. **Save useful artifacts**: Help future debugging

## Next Steps

- Explore the [Step Registry](https://steps.ci.openshift.org/) for reusable components
- Read about [Advanced Testing Patterns]({{< ref "../how-tos/creating-a-pipeline" >}})
- Learn about [Adding Cluster Profiles]({{< ref "../how-tos/adding-a-cluster-profile" >}})

## Getting Help

If you're stuck:
- Check the [Troubleshooting Guide]({{< ref "../troubleshooting/_index.md" >}})
- Ask in `#forum-ocp-testplatform` on Slack
- Review [similar test configurations](https://github.com/openshift/release/tree/master/ci-operator/config) in other repositories 