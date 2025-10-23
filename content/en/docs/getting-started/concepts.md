---
title: "Core Concepts"
description: Understanding the fundamental concepts of OpenShift CI
weight: 1
keywords: ["concepts", "prow", "ci-operator", "basics", "introduction", "getting started", "fundamentals"]
---

# Core Concepts

Welcome to OpenShift CI! Before diving into examples and tutorials, it's important to understand the key concepts that make up our CI platform.

## Overview

OpenShift CI is a Kubernetes-native CI/CD system that tests OpenShift components and other projects. It's built on top of [Prow](https://docs.prow.k8s.io/), a Kubernetes-based CI/CD system developed by the Kubernetes community.

## Key Components

### Prow
Prow is the foundation of OpenShift CI. It handles:
- **GitHub integration**: Responds to pull requests, issues, and merges
- **Job scheduling**: Decides when and where to run CI jobs
- **Result reporting**: Comments on PRs with test results

Common Prow interactions you'll see:
- `/retest` - Retriggers failed tests
- `/test <job-name>` - Runs a specific test job
- `/hold` - Prevents automatic merging

### ci-operator
`ci-operator` is the OpenShift-specific component that knows how to:
- Build container images from your source code
- Create ephemeral OpenShift clusters for testing
- Run your tests in a consistent environment
- Clean up resources after tests complete

Think of it as the "brain" that understands OpenShift's build and test requirements.

### Jobs and Steps

**Jobs** are the individual CI tasks that run on your code:
- **Presubmit jobs**: Run on pull requests before merging
- **Postsubmit jobs**: Run after code is merged
- **Periodic jobs**: Run on a schedule

**Steps** are the building blocks of jobs:
- Each step runs in its own container
- Steps can share data through a shared directory
- Steps are reusable across different jobs

### The Step Registry

The [Step Registry](https://steps.ci.openshift.org/) is a library of reusable test components:
- **Steps**: Individual test actions (e.g., "install cluster", "run e2e tests")
- **Chains**: Sequences of steps that are commonly used together
- **Workflows**: Complete test scenarios combining pre, test, and post chains

### Cluster Profiles

Cluster profiles define where and how to create test clusters:
- `aws`: Creates clusters on Amazon Web Services
- `gcp`: Creates clusters on Google Cloud Platform
- `azure`: Creates clusters on Microsoft Azure
- And many more...

Each profile includes the necessary credentials and configuration for that platform.

## How It All Works Together

Here's a simplified flow of what happens when you push code to a pull request:

1. **GitHub** notifies **Prow** about the new commits
2. **Prow** looks up which jobs should run for your repository
3. For each job, **Prow** creates a Pod that runs **ci-operator**
4. **ci-operator** reads your job configuration and:
   - Builds any necessary container images
   - Sets up test infrastructure (like OpenShift clusters)
   - Runs your test steps in order
   - Collects logs and artifacts
5. **Prow** reports the results back to your pull request

## Common Terms You'll Encounter

- **Release payload**: A set of container images that make up an OpenShift release
- **Promotion**: Publishing your container images for use by other components
- **Rehearsal**: Testing CI configuration changes before they're applied
- **Lease**: Cloud quota reservation for running tests
- **Must-gather**: Diagnostic data collection from failed tests

## What's Next?

Now that you understand the basic concepts:
- Check out [Examples]({{< ref "examples" >}}) for common CI configurations
- Learn about [Writing Your First Test]({{< ref "writing-first-test" >}})
- Explore the [Step Registry](https://steps.ci.openshift.org/) for reusable components

## Need Help?

- Join `#forum-ocp-testplatform` on Slack for questions
- Check the [FAQ]({{< ref "helpdesk-faq" >}}) for common issues
- Review the [Troubleshooting Guide]({{< ref "../troubleshooting/_index.md" >}}) for debugging help 