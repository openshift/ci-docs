---
title: "Simple CI Example"
description: A concrete example of setting up basic CI for a Go project
weight: 3
keywords: ["example", "tutorial", "go", "golang", "simple", "basic"]
---

# Simple CI Example: Testing a Go Project

This example shows how to set up basic CI for a Go project. We'll create a configuration that:
- Runs unit tests on every pull request
- Builds your Go binary
- Runs linting checks

## The Configuration File

Here's a complete `ci-operator` configuration for a simple Go project:

```yaml
# This file would go in: ci-operator/config/myorg/myrepo/myorg-myrepo-main.yaml

# Define base images - these are the starting points for our builds
base_images:
  os:
    name: ubi-minimal  # Red Hat Universal Base Image (minimal version)
    namespace: ocp
    tag: "8"

# Define the build environment - where compilation happens
build_root:
  image_stream_tag:
    name: release
    namespace: openshift
    tag: golang-1.19  # Image with Go 1.19 compiler and tools

# Define how to build the binary
binary_build_commands: |
  go mod download      # Download dependencies
  go build ./cmd/...   # Build all commands in cmd/ directory

# Define container images to build
images:
- dockerfile_path: Dockerfile  # Path to Dockerfile in your repo
  to: myapp                   # Name of the resulting image

# Define the tests to run
tests:
# Unit tests - run on every PR
- as: unit                      # Test name (shows in GitHub)
  commands: |
    go test ./... -race         # Run all tests with race detection
  container:
    from: src                   # Run in the source image

# Lint checks - run on every PR  
- as: lint
  commands: |
    golangci-lint run ./...     # Run linting
  container:
    from: src

# Verify go mod is tidy
- as: verify
  commands: |
    go mod tidy
    git diff --exit-code go.mod go.sum
  container:
    from: src
```

## What Each Section Does

### Base Images
```yaml
base_images:
  os:
    name: ubi-minimal
    namespace: ocp
    tag: "8"
```
This defines a base operating system image that your application will run on. Think of it as the foundation layer.

### Build Root
```yaml
build_root:
  image_stream_tag:
    name: release
    namespace: openshift
    tag: golang-1.19
```
This specifies the image containing your build tools (Go compiler, etc.). The CI system will use this to compile your code.

### Build Commands
```yaml
binary_build_commands: |
  go mod download
  go build ./cmd/...
```
These commands run inside the build root to compile your application. The compiled binaries are saved for use in later stages.

### Container Images
```yaml
images:
- dockerfile_path: Dockerfile
  to: myapp
```
This tells CI to build a container image using your Dockerfile. The resulting image will be tagged as `myapp`.

### Tests
Each test runs in its own container and reports pass/fail status to your PR:

- **unit**: Runs `go test` with race detection enabled
- **lint**: Runs `golangci-lint` to check code style
- **verify**: Ensures `go.mod` is properly maintained

## Sample Dockerfile

Your repository would include a `Dockerfile` like this:

```dockerfile
# Multi-stage build
FROM registry.ci.openshift.org/openshift/release:golang-1.19 AS builder

WORKDIR /go/src/github.com/myorg/myrepo
COPY . .
RUN go build -o myapp ./cmd/myapp

# Final image
FROM registry.access.redhat.com/ubi8/ubi-minimal:latest
COPY --from=builder /go/src/github.com/myorg/myrepo/myapp /usr/bin/
ENTRYPOINT ["/usr/bin/myapp"]
```

## How It Works in Practice

1. **You push code** to a pull request
2. **Prow detects** the change and triggers ci-operator
3. **ci-operator**:
   - Sets up a temporary namespace
   - Imports the build root image (golang-1.19)
   - Clones your code
   - Runs your build commands
   - Executes each test in parallel
   - Builds the container image
4. **Results appear** as status checks on your PR

## Common Customizations

### Add Integration Tests
```yaml
- as: integration
  commands: |
    make test-integration
  container:
    from: src
```

### Test Multiple Go Versions
Create additional config files with different build roots:
- `myorg-myrepo-main.yaml` (Go 1.19)
- `myorg-myrepo-main__go1.20.yaml` (Go 1.20)

### Add Security Scanning
```yaml
- as: security-scan
  commands: |
    go list -json -deps ./... | nancy sleuth
  container:
    from: src
```

## Next Steps

- See [Multi-Stage Tests]({{< ref "../architecture/step-registry" >}}) for more complex scenarios
- Check [Examples]({{< ref "examples" >}}) for cloud-specific tests
- Browse the [Step Registry](https://steps.ci.openshift.org/) for reusable components 