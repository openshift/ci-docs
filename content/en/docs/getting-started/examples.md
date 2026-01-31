---
title: "Examples"
description: Examples of common tasks in CI configuration.
weight: 2
---

# CI Configuration Examples

This page provides practical examples for common CI configuration scenarios. Each example includes the full configuration and explanation.

## Table of Contents
- [Basic Testing](#basic-testing)
- [End-to-End Testing](#end-to-end-testing)
- [Building and Testing Images](#building-and-testing-images)
- [Cross-Repository Testing](#cross-repository-testing)
- [Advanced Patterns](#advanced-patterns)

## Basic Testing

### Simple Unit Test
Run unit tests without needing a cluster:

{{< highlight yaml >}}
tests:
- as: unit
  commands: |
    echo "Running unit tests..."
    go test -race -cover -v ./pkg/...
  container:
    from: src
{{< /highlight >}}

### Linting and Code Quality
Use external tools for code quality checks:

{{< highlight yaml >}}
base_images:
  golangci-lint:
    namespace: ci
    name: golangci-lint
    tag: v1.54.2

tests:
- as: lint
  commands: |
    echo "Running linters..."
    golangci-lint run --timeout=10m
  container:
    from: golangci-lint
    clone: true  # Clone source code into the linter image

- as: verify-deps
  commands: |
    echo "Verifying dependencies..."
    go mod tidy
    go mod vendor
    git diff --exit-code
  container:
    from: src
{{< /highlight >}}

### Running Tests in Parallel
Speed up test execution with parallel test suites:

{{< highlight yaml >}}
tests:
- as: parallel-unit-tests
  steps:
    test:
    - as: test-pkg-api
      commands: go test -v ./pkg/api/...
      from: src
      resources:
        requests:
          cpu: 2
          memory: 4Gi
    - as: test-pkg-controller
      commands: go test -v ./pkg/controller/...
      from: src
      resources:
        requests:
          cpu: 2
          memory: 4Gi
    - as: test-pkg-util
      commands: go test -v ./pkg/util/...
      from: src
      resources:
        requests:
          cpu: 1
          memory: 2Gi
{{< /highlight >}}

## End-to-End Testing

### Basic E2E on AWS
{{< highlight yaml >}}
tests:
- as: e2e-aws
  steps:
    cluster_profile: aws
    workflow: openshift-e2e-aws
{{< /highlight >}}

### E2E with Custom Test Suite
Run your own e2e tests on a cluster:

{{< highlight yaml >}}
tests:
- as: e2e-custom
  steps:
    cluster_profile: aws
    test:
    - as: run-my-tests
      commands: |
        echo "Running custom e2e tests..."
        export KUBECONFIG=${KUBECONFIG}
        
        # Wait for cluster to be ready
        oc wait --for=condition=Ready nodes --all --timeout=300s
        
        # Run your test suite
        make test-e2e
      from: src
      resources:
        requests:
          cpu: 100m
          memory: 200Mi
    workflow: ipi-aws  # Handles cluster creation/destruction
{{< /highlight >}}

### E2E with Operator Deployment
Deploy and test an operator:

{{< highlight yaml >}}
tests:
- as: e2e-operator
  steps:
    cluster_profile: aws
    test:
    - as: install-operator
      commands: |
        # Create namespace
        oc create namespace my-operator
        
        # Install CRDs
        oc apply -f deploy/crds/
        
        # Deploy operator
        oc apply -f deploy/ -n my-operator
        
        # Wait for deployment
        oc wait --for=condition=Available \
          deployment/my-operator \
          -n my-operator \
          --timeout=300s
      from: src
      resources:
        requests:
          cpu: 100m
          memory: 200Mi
    - as: test-operator
      commands: |
        # Create test resources
        oc apply -f test/e2e/resources/
        
        # Run operator e2e tests
        go test -v ./test/e2e/... \
          -kubeconfig=${KUBECONFIG} \
          -namespace=my-operator-test
      from: src
      resources:
        requests:
          cpu: 1
          memory: 2Gi
    workflow: ipi-aws
{{< /highlight >}}

### Upgrade Testing
Test upgrades between OpenShift versions:

{{< highlight yaml >}}
releases:
  initial:
    release:
      channel: stable
      version: "4.13"
  latest:
    release:
      channel: stable
      version: "4.14"

tests:
- as: e2e-upgrade
  steps:
    cluster_profile: aws
    workflow: openshift-upgrade-aws
{{< /highlight >}}

## Building and Testing Images

### Build Multiple Images
{{< highlight yaml >}}
base_images:
  base:
    namespace: ocp
    name: "4.14"
    tag: base

images:
- from: base
  to: controller
  dockerfile_path: build/controller.Dockerfile
- from: base
  to: webhook
  dockerfile_path: build/webhook.Dockerfile
- from: base
  to: cli
  dockerfile_path: build/cli.Dockerfile

tests:
- as: verify-images
  commands: |
    # Test controller image
    podman run --rm ${IMAGE_FORMAT}/controller:latest --version
    
    # Test webhook image
    podman run --rm ${IMAGE_FORMAT}/webhook:latest --help
    
    # Test CLI image
    podman run --rm ${IMAGE_FORMAT}/cli:latest version
  container:
    from: src
{{< /highlight >}}

### Multi-Stage Build Testing
Test images built with multi-stage Dockerfiles:

{{< highlight yaml >}}
binary_build_commands: make build

images:
- dockerfile_literal: |
    FROM registry.ci.openshift.org/ocp/builder:rhel-8-golang-1.20-openshift-4.14 AS builder
    WORKDIR /go/src/github.com/org/repo
    COPY . .
    RUN make build

    FROM registry.ci.openshift.org/ocp/4.14:base
    COPY --from=builder /go/src/github.com/org/repo/bin/app /usr/bin/
    ENTRYPOINT ["/usr/bin/app"]
  from: base
  inputs:
    bin:
      as:
      - registry.ci.openshift.org/ocp/builder:rhel-8-golang-1.20-openshift-4.14
  to: my-app

promotion:
  to:
  - namespace: my-namespace
    name: my-app
    tag: latest
{{< /highlight >}}

## Cross-Repository Testing

### Using Images from Another Repository
Test with images published by another repository:

{{< highlight yaml >}}
base_images:
  another-component:
    namespace: ocp
    name: "4.14"
    tag: another-component

tests:
- as: integration-test
  commands: |
    # Start the other component
    podman run -d --name other ${ANOTHER_COMPONENT_IMAGE}
    
    # Run integration tests against it
    export OTHER_COMPONENT_URL=http://localhost:8080
    make test-integration
    
    # Cleanup
    podman stop other
  container:
    from: src
  dependencies:
  - name: another-component
    env: ANOTHER_COMPONENT_IMAGE
{{< /highlight >}}

### Testing Multiple Repositories Together
Using a shared workflow to test multiple components:

{{< highlight yaml >}}
# In repo A
tests:
- as: cross-repo-test
  steps:
    cluster_profile: aws
    test:
    - ref: deploy-component-a
    - ref: deploy-component-b  # From shared registry
    - ref: run-integration-tests
    workflow: openshift-e2e-aws

# In the step registry
ref:
  as: deploy-component-b
  from: component-b-image
  commands: |
    oc apply -f https://raw.githubusercontent.com/org/component-b/main/deploy/
    oc wait --for=condition=Available deployment/component-b
  resources:
    requests:
      cpu: 100m
      memory: 200Mi
{{< /highlight >}}

## Advanced Patterns

### Conditional Testing Based on Changes
Only run expensive tests when relevant files change:

{{< highlight yaml >}}
tests:
# Always run unit tests
- as: unit
  commands: make test-unit
  container:
    from: src

# Only run integration tests if source code changes
- as: integration
  run_if_changed: "^(pkg|cmd)/"
  commands: make test-integration
  container:
    from: src

# Only run e2e if APIs or controllers change
- as: e2e-aws
  optional: true  # Don't block merge
  run_if_changed: "^(api|controllers|deploy)/"
  steps:
    cluster_profile: aws
    workflow: openshift-e2e-aws
{{< /highlight >}}

### Testing with External Services
Using secrets to test with external services:

{{< highlight yaml >}}
tests:
- as: external-integration
  steps:
    test:
    - as: test-with-database
      credentials:
      - namespace: test-credentials
        name: database-credentials
        mount_path: /var/run/secrets/database
      commands: |
        # Read credentials
        export DB_HOST=$(cat /var/run/secrets/database/host)
        export DB_USER=$(cat /var/run/secrets/database/user)
        export DB_PASS=$(cat /var/run/secrets/database/password)
        
        # Run tests against external database
        make test-database-integration
      from: src
      resources:
        requests:
          cpu: 500m
          memory: 1Gi
{{< /highlight >}}

### Platform-Specific Testing
Run tests on multiple cloud providers:

{{< highlight yaml >}}
tests:
- as: e2e-aws
  steps:
    cluster_profile: aws
    env:
      FEATURE_SET: TechPreviewNoUpgrade
    workflow: openshift-e2e-aws

- as: e2e-gcp
  steps:
    cluster_profile: gcp
    env:
      FEATURE_SET: TechPreviewNoUpgrade
    workflow: openshift-e2e-gcp

- as: e2e-azure
  steps:
    cluster_profile: azure4
    env:
      FEATURE_SET: TechPreviewNoUpgrade
    workflow: openshift-e2e-azure
{{< /highlight >}}

### Periodic Regression Testing
Set up nightly tests with notifications:

{{< highlight yaml >}}
tests:
- as: nightly-regression
  cron: "0 2 * * *"  # 2 AM UTC daily
  steps:
    cluster_profile: aws
    test:
    - as: deploy-latest
      commands: |
        # Deploy latest development version
        oc apply -f https://raw.githubusercontent.com/org/repo/main/deploy/dev/
      from: src
    - as: run-full-suite
      commands: |
        # Run comprehensive test suite
        make test-regression
      from: src
      timeout: 3h0m0s
    post:
    - as: send-results
      commands: |
        # Process and send results (if using a notification system)
        if [ -f ${ARTIFACT_DIR}/junit.xml ]; then
          python3 scripts/send-test-report.py \
            --junit ${ARTIFACT_DIR}/junit.xml \
            --webhook ${SLACK_WEBHOOK}
        fi
      from: src
    workflow: ipi-aws
{{< /highlight >}}

### Using Cluster Pools for Faster Tests
Instead of provisioning a new cluster:

{{< highlight yaml >}}
tests:
- as: e2e-cluster-pool
  cluster_claim:
    architecture: amd64
    cloud: aws
    owner: openshift-ci
    product: ocp
    timeout: 1h0m0s
    version: "4.14"
  steps:
    test:
    - as: test
      commands: |
        # Cluster is already provisioned
        oc get nodes
        make test-e2e
      from: src
      resources:
        requests:
          cpu: 2
          memory: 8Gi
    workflow: generic-claim
{{< /highlight >}}

## Next Steps

- Review the [Step Registry](https://steps.ci.openshift.org/) for reusable components
- Check [Architecture documentation](/docs/architecture/) for deeper understanding
- See [How-To guides](/docs/how-tos/) for specific tasks
- Use the [Troubleshooting guide](/docs/troubleshooting/) when things go wrong

Remember: Start simple, test locally when possible, and gradually add complexity as needed!
