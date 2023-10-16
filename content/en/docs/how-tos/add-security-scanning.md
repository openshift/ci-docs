---
title: "Add security scanning"
description: "How to add security scanning to gate PR merging."
---

This document will guide you through adding security scanning using Snyk to ensure that PRs are free of vulnerabilities before merging.

## Why add security scanning?

In recent times, ensuring the security of applications has become paramount. One of the key aspects of ensuring security is to cooperate with the Security team. Their initiative, known as _Shift Left_, aims to run security scanning early in the development pipeline. By introducing security scanning at this stage, we are proactive in detecting vulnerabilities, which can save a lot of time and resources in the long run.

## What is snyk?

[snyk](https://app.snyk.io/) is a leading security platform that provides developers with the tools needed to identify and fix vulnerabilities in their applications. With Snyk, you can:

1. **Scan Dependencies**: Snyk checks for vulnerabilities in project dependencies and provides insights into how to fix them.
2. **Scan Code**: Beyond just dependencies, Snyk can scan the actual codebase for known security vulnerabilities.

## How the security scanning workflow works?

The security scanning workflow, named [`openshift-ci-security`](https://steps.ci.openshift.org/workflow/openshift-ci-security), performs the following actions:

1. Invokes snyk to scan for vulnerabilities in dependencies.
2. Invokes snyk to scan the codebase for known vulnerabilities.
3. Uploads the resulting report to the [Snyk UI](https://app.snyk.io/org/openshift-ci-internal/) for detailed analysis and insights.

The scanning is performed using the RedHat enterprise license with snyk.

## How to add security scanning workflow as a test?

To add the security scanning workflow as a test, you can include the following configuration:

```yaml
- as: security
  optional: true
  steps:
    env:
      PROJECT_NAME: <your project name>
      ORG_NAME: <optional organisation name>
    workflow: openshift-ci-security
```

As we set `optional: true`, this test will not block the PR from merging. However, it is advised to set `optional: false` to ensure that the PR is gated until the security scanning workflow passes.

If your organisation is not OpenShift CI, you can optionally override the `ORG_NAME` environment variable to point to your organisation in snyk UI.
