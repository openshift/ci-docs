---
title: "Getting Started"
linkTitle: "Getting started"
weight: 1
description: >
  Start here to learn about OpenShift CI and how to use it effectively
---

# Getting Started with OpenShift CI

Welcome to OpenShift CI! This section will guide you through understanding and using our CI platform.

## Learning Path

We recommend following this path to get started:

### 1. [Core Concepts]({{< ref "concepts" >}})
Start here to understand the fundamental components and terminology of OpenShift CI. This page covers:
- What is Prow and ci-operator?
- How do jobs and steps work?
- What are cluster profiles and the step registry?

### 2. [Writing Your First Test]({{< ref "writing-first-test" >}})
A hands-on tutorial that walks you through creating your first CI test, from simple container tests to complex multi-stage workflows.

### 3. [Simple CI Example]({{< ref "simple-example" >}})
A complete, annotated example of CI configuration for a Go project with detailed explanations.

### 4. [Examples]({{< ref "examples" >}})
Practical examples of common CI configurations:
- Running e2e tests on different cloud providers
- Building and testing container images
- Using shared test components

### 4. [Useful Links]({{< ref "useful-links" >}})
Quick reference to important resources:
- CI cluster access and dashboards
- Slack channels and support
- Common tools and services

### 5. [FAQ]({{< ref "helpdesk-faq" >}})
Frequently asked questions from the community, automatically updated from our Slack discussions.

### 6. [Glossary]({{< ref "glossary" >}})
Definitions of common terms and concepts used throughout OpenShift CI documentation.

## Quick Start Checklist

If you're completely new to OpenShift CI:

- [ ] Read the [Core Concepts]({{< ref "concepts" >}}) page
- [ ] Join `#forum-ocp-testplatform` on Slack
- [ ] Follow the [Writing Your First Test]({{< ref "writing-first-test" >}}) tutorial
- [ ] Explore the [Step Registry](https://steps.ci.openshift.org/)
- [ ] Review existing [CI configurations](https://github.com/openshift/release/tree/master/ci-operator/config) for examples

## Common Next Steps

After getting started, you might want to:

- [Onboard a new component]({{< ref "../how-tos/onboarding-a-new-component" >}}) to OpenShift CI
- [Add your jobs to TestGrid]({{< ref "../how-tos/add-jobs-to-testgrid" >}}) for monitoring
- [Configure notifications]({{< ref "../how-tos/notification" >}}) for test results
- [Set up release gating]({{< ref "../architecture/release-gating" >}}) for your component

## Getting Help

When you need assistance:

1. **Check the documentation** - This site and the linked resources
2. **Search Slack history** - Many questions have been answered before
3. **Ask in Slack** - Use `#forum-ocp-testplatform` for general questions
4. **File a Jira ticket** - For bugs or feature requests (use the Slack workflows)

## Contributing

Found an issue with the documentation? Want to add an example? We welcome contributions! 
- [Documentation source](https://github.com/openshift/ci-docs)
- [CI configurations](https://github.com/openshift/release)
