---
title: "Add security scanning"
description: "How to add security scanning to gate PR merging."
---

This document will guide you through adding security scanning using snyk to ensure that PRs are free of vulnerabilities before merging.

## Why add security scanning?

In recent times, ensuring the security of applications has become paramount. One of the key aspects of ensuring security is to cooperate with the Security team. Their initiative, known as _Shift Left_, aims to run security scanning early in the development pipeline. By introducing security scanning at this stage, we are proactive in detecting vulnerabilities, which can save a lot of time and resources in the long run.

## What is snyk?

[snyk](https://app.snyk.io/) is a leading security platform that provides developers with the tools needed to identify and fix vulnerabilities in their applications. With snyk, you can:

1. **Scan Dependencies**: snyk checks for vulnerabilities in project dependencies and provides insights into how to fix them.
2. **Scan Code**: Beyond just dependencies, snyk can scan the actual codebase for known security vulnerabilities.

## How the security scanning workflow works?

The security scanning workflow, named [`openshift-ci-security`](https://steps.ci.openshift.org/workflow/openshift-ci-security), performs the following actions:

1. Invokes snyk to scan for vulnerabilities in dependencies.
2. Invokes snyk to scan the codebase for known vulnerabilities.
3. Uploads the resulting report to the [snyk UI](https://app.snyk.io/org/openshift-ci-internal/) for detailed analysis and insights.

The scanning is performed using the RedHat enterprise license with snyk.

## How to add the security scanning workflow as a test?

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

If your organization is not OpenShift, you can optionally override the `ORG_NAME` environment variable to point to your organization in snyk UI.

## How to ignore vulnerabilities?

You can ignore vulnerabilities in various ways depending on the scenario:

### Ignoring vulnerabilities in snyk dependencies scan

To ignore vulnerabilities for a snyk dependencies scan, you need to create a `.snyk` file in your project. More information on how to configure this file can be found in the [snyk documentation](https://docs.snyk.io/snyk-cli/commands/ignore).

### Ignoring vulnerabilities in snyk code scan

Vulnerabilities found by a snyk code scan can be ignored via the web UI on [snyk's platform](https://app.snyk.io). After a code scan is conducted and if it fails, snyk will report the vulnerabilities found in the test output. It will also provide a link to the scan report, as shown below:

```plaintext
Your test results are available at:
https://app.snyk.io/org/openshift-ci-internal/project/XXX/history/XXX
```

Following this link will take you to the scan report where you have the option to ignore the identified vulnerabilities.