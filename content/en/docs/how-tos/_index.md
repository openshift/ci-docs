---
title: "How To's"
linkTitle: "How To's"
weight: 2
description: >
  Step-by-step guides for common CI tasks, organized by category
---

# How-To Guides

This section contains practical guides for accomplishing specific tasks in OpenShift CI.

## 🚀 Getting Started

### Setting Up CI
- [Onboarding a New Component]({{< ref "onboarding-a-new-component" >}}) - Complete guide to adding your project to CI
- [Contributing CI Configuration]({{< ref "contributing-openshift-release" >}}) - How to submit CI configuration changes
- [Naming Your CI Jobs]({{< ref "naming-your-ci-jobs" >}}) - Best practices for job naming

### Writing Tests
- [Creating a Test Pipeline]({{< ref "creating-a-pipeline" >}}) - Building test workflows
- [Using External Images]({{< ref "external-images" >}}) - Incorporating external container images
- [Testing with Nested Podman]({{< ref "nested-podman" >}}) - Running container tests within CI

## 📊 Test Management

### Test Configuration
- [Add Jobs to TestGrid]({{< ref "add-jobs-to-testgrid" >}}) - Monitor test results over time
- [Multi-Architecture Testing]({{< ref "multi-architecture" >}}) - Test on different architectures
- [Multi-PR Testing]({{< ref "multi-pr-presubmit-testing" >}}) - Test multiple PRs together

### Test Execution
- [Interact with Running Jobs]({{< ref "interact-with-running-jobs" >}}) - Debug jobs in real-time
- [Override Failing CI Jobs]({{< ref "overriding-failing-ci-jobs" >}}) - Emergency procedures
- [Trigger Jobs via REST API]({{< ref "triggering-prowjobs-via-rest" >}}) - Programmatic job execution

## 🔧 Advanced Configuration

### Registry and Artifacts
- [Adding Step Registry Content]({{< ref "adding-changing-step-registry-content" >}}) - Create reusable test components
- [Migrating to Multi-Stage Tests]({{< ref "migrating-template-jobs-to-multistage" >}}) - Modernize legacy jobs
- [Managing Artifacts]({{< ref "artifacts" >}}) - Store and retrieve test outputs

### Images and Promotion
- [Mirror Images to Quay]({{< ref "mirroring-to-quay" >}}) - External image publication
- [Use Registries in Build Farm]({{< ref "use-registries-in-build-farm" >}}) - Registry configuration

## 🔒 Security and Access

### Secrets and Credentials
- [Add a New Secret to CI]({{< ref "adding-a-new-secret-to-ci" >}}) - Manage sensitive data
- [Add a Cluster Profile]({{< ref "adding-a-cluster-profile" >}}) - Configure cloud access
- [RBAC Configuration]({{< ref "rbac" >}}) - Set up permissions

### Security Scanning
- [Add Security Scanning]({{< ref "add-security-scanning" >}}) - Integrate vulnerability scanning
- [Private Repository Access]({{< ref "add-team-access-to-private-deck" >}}) - Configure private deck access

## 🎯 Specialized Testing

### Operator Testing
- [Testing Operator SDK Operators]({{< ref "testing-operator-sdk-operators" >}}) - OLM-based operator testing

### Cluster Management
- [Using Cluster Claims]({{< ref "cluster-claim" >}}) - Pre-provisioned cluster pools
- [Platform Capabilities]({{< ref "capabilities" >}}) - Feature gate testing

## 📢 Monitoring and Notifications

### Alerting
- [Set Up Notifications]({{< ref "notification" >}}) - Slack and email alerts
- [PR Reminder Bot]({{< ref "pr-reminder" >}}) - Automated PR notifications

## 📚 Quick Reference

### Common Tasks by Role

**For Developers:**
1. Start with [Onboarding a New Component]({{< ref "onboarding-a-new-component" >}})
2. Learn about [Creating a Test Pipeline]({{< ref "creating-a-pipeline" >}})
3. Set up [Notifications]({{< ref "notification" >}}) for your jobs

**For Test Engineers:**
1. Explore [Step Registry Content]({{< ref "adding-changing-step-registry-content" >}})
2. Configure [Multi-Architecture Testing]({{< ref "multi-architecture" >}})
3. Add jobs to [TestGrid]({{< ref "add-jobs-to-testgrid" >}})

**For Platform Engineers:**
1. Manage [Cluster Profiles]({{< ref "adding-a-cluster-profile" >}})
2. Configure [RBAC]({{< ref "rbac" >}})
3. Set up [Security Scanning]({{< ref "add-security-scanning" >}})

## Need Help?

Can't find what you're looking for?
- Check the [Troubleshooting Guide]({{< ref "../troubleshooting/_index.md" >}})
- Review [Examples]({{< ref "../getting-started/examples" >}})
- Ask in `#forum-ocp-testplatform` on Slack
