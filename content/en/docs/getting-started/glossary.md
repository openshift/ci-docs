---
title: "Glossary"
description: Common terms and concepts used in OpenShift CI
weight: 5
keywords: ["glossary", "terms", "definitions", "vocabulary", "concepts", "terminology"]
---

# OpenShift CI Glossary

This glossary defines common terms you'll encounter when working with OpenShift CI. Terms are organized alphabetically.

## A

### Artifact
Files or logs produced by a test job that are saved for later inspection. These might include test results, screenshots, cluster logs, or any other debugging information.

### Approval (`/approve`)
A Prow command used in pull requests to indicate that the code changes have been reviewed and approved. Requires appropriate permissions defined in OWNERS files.

## B

### Base Image
A container image used as a starting point for building other images. In CI, these are often language-specific images (like `golang:1.19`) that contain build tools.

### Branch Protection
GitHub settings that prevent direct pushes to important branches and enforce that certain CI checks pass before merging. OpenShift CI automatically manages these settings based on your job configuration.

### Build Farm
The OpenShift clusters where CI jobs run. These clusters provide the compute resources and infrastructure needed to execute tests.

### Build Root
The container image that contains all the tools and dependencies needed to compile your project. This is where commands like `make build` or `go build` are executed.

## C

### Chain
In the step registry, a sequence of steps that run in order. Chains can be reused across different workflows, making it easy to share common sequences like "install a cluster" or "run conformance tests".

### CI Operator (`ci-operator`)
The core component of OpenShift CI that understands how to build, test, and promote OpenShift components. It handles tasks like building images, creating test clusters, and running tests.

### Cincinnati
Red Hat's update service that manages OpenShift release channels and determines which versions users can upgrade to. CI can test with releases from Cincinnati.

### Cluster Profile
A predefined configuration that specifies how to provision test clusters on different cloud platforms (AWS, GCP, Azure, etc.). Each profile includes the necessary credentials and settings.

### Cluster Pool
A set of pre-installed OpenShift clusters that tests can claim instead of installing a new cluster each time. This significantly speeds up test execution.

## D

### Dependency
In multi-stage tests, a reference to an image or artifact that a step needs. Dependencies ensure that required resources are available before a step runs.

## E

### Ephemeral Cluster
A temporary OpenShift cluster created just for running tests. These clusters are automatically destroyed after the tests complete.

### Ephemeral Release
A custom OpenShift release payload created during testing that includes the images built from your pull request. This allows testing changes before they're merged.

## G

### GitHub App
Automated GitHub integrations used by OpenShift CI. Two main apps are used: "OpenShift CI" for running tests and "OpenShift Merge Bot" for merging approved PRs.

## I

### ImageStream
An OpenShift/Kubernetes resource that tracks multiple versions (tags) of related container images. Think of it as a named collection of image versions.

### ImageStreamTag
A specific version of an image within an ImageStream. Written as `stream:tag` (e.g., `pipeline:src`). This is how images are referenced in OpenShift.

### Integration Stream
A continuously updated set of images representing the latest tested versions of all OpenShift components. Used to ensure components work together.

## J

### Job
A CI task that runs in response to events like opening a PR, merging code, or on a schedule. Jobs execute the tests and builds you've configured.

## L

### Lease
A reservation for cloud resources (like AWS quota) that ensures your test has the necessary infrastructure to create clusters.

### Linting
Automated code style and quality checks. Common linters include `golangci-lint` for Go code and `shellcheck` for shell scripts.

## M

### Multi-stage Test
A test composed of multiple steps that can share data and run in sequence. This is the preferred way to write complex tests in OpenShift CI.

### Must-gather
A tool that collects diagnostic information from OpenShift clusters. CI automatically runs this when tests fail to help with debugging.

## N

### Namespace
An OpenShift/Kubernetes concept for isolating resources. Each CI job runs in its own namespace to prevent interference between tests.

## O

### OSBS
OpenShift Build Service - Red Hat's production system for building container images that are shipped to customers.

### OWNERS File
A file in your repository that defines who can approve changes to different parts of the code. Used by Prow for automatic review assignment and approval permissions.

## P

### Periodic Job
A CI job that runs on a schedule (like a cron job) rather than being triggered by code changes. Useful for nightly tests or regular health checks.

### Pipeline
In CI context, this typically refers to the series of images created during a build: `pipeline:root` → `pipeline:src` → `pipeline:bin` → your output images.

### Postsubmit Job
A CI job that runs after code is merged. Often used for building and publishing official images or updating documentation.

### Presubmit Job
A CI job that runs on pull requests before merging. These are your main quality gates that ensure code changes don't break things.

### Promotion
The process of publishing tested container images to a registry where other components can use them. Images are only promoted after passing all tests.

### Prow
The Kubernetes-native CI/CD system that OpenShift CI is built on. Prow handles GitHub integration, job scheduling, and reporting results.

### Pull Secret
Credentials needed to pull container images from private registries. CI provides these automatically for common registries like `registry.redhat.io`.

### Pull Specification (pull-spec)
The full address of a container image, including registry, namespace, name, and tag or digest. Example: `quay.io/openshift/origin-tests:4.13`.

## R

### RBAC
Role-Based Access Control - The permission system used in Kubernetes/OpenShift to control who can perform what actions.

### Rehearsal
A test run of CI configuration changes to ensure they work correctly before being applied to all pull requests.

### Release Payload
A bundle of container images that together form a complete OpenShift release. CI tests often install clusters using these payloads.

### Retest (`/retest`)
A Prow command to re-run failed CI jobs on a pull request. Useful when failures are due to infrastructure issues rather than code problems.

## S

### Semantic Versioning (SemVer)
A version numbering scheme (MAJOR.MINOR.PATCH) used by OpenShift. Example: 4.13.0, where 4 is major, 13 is minor, and 0 is patch.

### Shared Directory (`$SHARED_DIR`)
A filesystem location where test steps can write files that other steps in the same job can read. Used for passing data between steps.

### Step
The smallest unit of a multi-stage test. Each step runs in its own container and performs a specific task.

### Step Registry
A library of reusable test components (steps, chains, workflows) that can be combined to create new tests. Browse it at [steps.ci.openshift.org](https://steps.ci.openshift.org/).

## T

### Tag
1. In Git: A named reference to a specific commit
2. In container images: A version identifier for an image (like `latest` or `v1.2.3`)
3. In CI: Often refers to ImageStreamTags

### Test Step
See "Step" above.

### Tide
The Prow component that automatically merges approved pull requests when all tests pass. It handles the merge queue and ensures master/main branches stay green.

## W

### Workflow
In the step registry, a complete test definition consisting of three phases: pre (setup), test (main tests), and post (cleanup). Workflows are composed of chains and steps.

## Common Abbreviations

- **CI**: Continuous Integration
- **CD**: Continuous Delivery/Deployment  
- **DPP**: Developer Productivity and Productivity (Red Hat team)
- **e2e**: End-to-end (tests that exercise the full system)
- **OCP**: OpenShift Container Platform
- **OKD**: The community distribution of Kubernetes that powers OpenShift
- **PR**: Pull Request
- **QE**: Quality Engineering

## Getting More Help

- Can't find a term? Ask in `#forum-ocp-testplatform` on Slack
- Want to add a term? [Submit a PR](https://github.com/openshift/ci-docs) to this glossary
- Need more context? Check the [Core Concepts]({{< ref "concepts" >}}) guide 