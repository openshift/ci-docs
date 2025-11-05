---
title: "Creating a Pipeline"
description: How to use existing functionalities to create a simple 2-stage pipeline
---

Prow does not support pipelines. Hence, when submitting a new pull request, all tests are executed, including resource-intensive tests that can lead to increased infrastructure costs. To address this limitation, OpenShift CI introduces an abstraction layer utilizing component named Pipeline Controller. This enables the use of both manual (triggered by a user) and automatic (triggered by a bot or lgtm-triggered) two-stage pipelines.

## Overview

The Pipeline Controller operates in three distinct modes, each offering different levels of automation for triggering second-stage tests. Second-stage tests are tests that run after the initial required tests pass, typically integration tests, optional tests, or tests that depend on specific file changes.

## Three Operating Modes

### 1. Manual Mode

In **Manual Mode**, the pipeline controller does not automatically trigger any tests. Users must manually trigger tests using commands.

**How it works:**
- When a PR is opened, the controller posts information in jobs status section which jobs belong to second stage.
- Users can trigger tests using:
  - `/test <job-name>` to run specific jobs
  - `/test ?` to see a list of all available jobs
  - `/pipeline required` to trigger all required and necessary jobs in second stage in this context

**When to use:**
- Teams that prefer full control over when tests run
- Repositories with expensive or time-consuming tests
- When you want to explicitly choose which tests to run

### 2. Automatic Mode

In **Automatic Mode**, the pipeline controller automatically triggers second-stage tests after all required tests pass successfully. This mode reassembles classical Jenkins or Bamboo pipeline expirience. 

**How it works:**
- When a PR is opened, the controller posts an informational comment
- Once all required tests (first stage) pass, the controller automatically:
  - Detects which tests should run based on file changes
  - Uses `pipeline_run_if_changed` and `pipeline_skip_if_only_changed` annotations to determine relevance
  - Triggers the appropriate second-stage tests automatically
- The controller posts a comment showing which tests will be scheduled

**When to use:**
- Teams that want fully automated test execution
- When you want to ensure all relevant tests run automatically

{{< alert title="Warning" color="warning" >}}
If you manually trigger any second-stage test before the automatic trigger occurs, the controller will detect this and inform you that the pipeline is now under manual control. You will need to use `/pipeline required` to trigger the remaining tests manually until the PR HEAD changes.
{{< /alert >}}


### 3. LGTM Mode

In **LGTM Mode**, the pipeline controller triggers second-stage tests when the `lgtm` label is added to a pull request.

**How it works:**
- When a PR is opened, the controller posts an informational comment
- When the `lgtm` label is added to the PR:
  - The controller automatically detects which tests should run based on file changes
  - Triggers the appropriate second-stage tests
  - Posts a comment showing which tests will be scheduled

**When to use:**
- Teams that want tests to run only when code review is approved
- To reduce unnecessary test runs during active development

{{< alert title="Warning" color="warning" >}}
If you manually trigger any second-stage test before the LGTM label is added, the controller will detect this and inform you that the pipeline is now under manual control. You will need to use `/pipeline required` to trigger the remaining tests manually until the PR HEAD changes.
{{< /alert >}}


## The `/pipeline required` Command

The `/pipeline required` command works in **all three modes** and allows you to explicitly request that the pipeline controller trigger all required and necessary second-stage tests.

**When to use `/pipeline required`:**
- In Manual Mode: To trigger all required tests at once
- In Automatic Mode: To trigger tests before they would automatically run, or to retrigger after manual intervention
- In LGTM Mode: To trigger tests before the LGTM label is added, or to retrigger after manual intervention
- When you've manually triggered some tests and want to trigger the remaining ones


{{< alert title="Warning" color="warning" >}}
When you use `/pipeline required` in Automatic or LGTM mode before the automatic trigger occurs, you take responsibility for manual control. The controller will not automatically trigger tests after this point until the PR HEAD changes.
{{< /alert >}}

## Test Detection

The pipeline controller automatically detects which tests should run based on:

1. **Protected tests**: Always required, cannot be skipped
2. **Always required tests**: Tests that must always run
3. **Conditionally required tests**: Tests that run based on file changes using:
   - `pipeline_run_if_changed`: Tests run if matching files changed
   - `pipeline_skip_if_only_changed`: Tests skip if only matching files changed

The controller analyzes the files changed in your PR and determines which tests are relevant.

## Always Required Second-Stage Tests

Assuming repository is properly configured, always required second-stage tests are tests that:
- Have `always_run: false` (they don't run automatically in the first stage)
- Are **not** marked as `optional: true` (they are required to pass)
- Do not have conditional annotations (`pipeline_run_if_changed` or `pipeline_skip_if_only_changed`)

These tests will always be triggered by the pipeline controller in the second stage, regardless of file changes.

**Example configuration:**
```yaml
- always_run: false
  as: e2e-critical-test
  steps:
    workflow: openshift-e2e-test
```

Note: If a test is marked as `optional: true`, it will not be considered an always required test, even if it has `always_run: false`.

## Conditional Test Annotations

The pipeline controller supports two conditional annotations that allow tests to run based on file changes in the pull request in second stage:

### `pipeline_run_if_changed`

This field specifies that a test should run **only if** files matching the pattern have changed in the PR.

**How it works:**
- If any file in the PR matches the regex pattern, the test will be triggered
- If no files match the pattern, the test will be skipped
- Test will run as part of the second stage


**How to add it:**

Add the field to your test configuration in the ci-operator config file:

```yaml
- always_run: false
  as: e2e-builds-test
  pipeline_run_if_changed: ^(pkg/build)|^(test/extended/builds)
```

### `pipeline_skip_if_only_changed`

This field specifies that a test should run **unless** only files matching the pattern have changed. In other words, the test will run if any file outside the pattern changes, but will be skipped if only files matching the pattern changed.

**How it works:**
- If **all** changed files match the pattern, the test will be skipped
- If **any** changed file does not match the pattern, the test will run
- Commonly used to skip tests when only documentation or non-code files change
- Test will run as part of the second stage

**How to add it:**

Add the field to your test configuration in the ci-operator config file:

```yaml
- always_run: false
  as: e2e-integration-test
  pipeline_skip_if_only_changed: ^(?:docs|\.github)/|\.md$|^(?:\.gitignore|OWNERS|OWNERS_ALIASES|PROJECT|LICENSE)$
```

## Manual Trigger Detection

If you manually trigger any second-stage test (using `/test <job-name>`) in Automatic or LGTM mode before the automatic trigger occurs, the controller will:

1. Detect that tests were manually triggered
2. Post a comment informing you that the pipeline is now under manual control
3. Require you to use `/pipeline required` to trigger remaining tests
4. Continue requiring manual control until the PR HEAD changes

This prevents duplicate test runs and ensures you have full control once you've started manually triggering tests.

## Enrolling Repository

To enroll repository with the pipeline controller, you need to add it to the appropriate configuration:

### For Manual or Automatic Mode

Repository needs to be added to the main pipeline controller configuration file which can be fonud in [openshift/release config](https://github.com/openshift/release/blob/master/core-services/pipeline-controller/config.yaml).

The configuration format is:
```yaml
orgs:
  - org: your-org
    repos:
      - repo: your-repo
        trigger: manual  # or "auto"
```

### For LGTM Mode

Repository needs to be added to the LGTM-specific configuration file which can be found in [openshift/release lgtm config](https://github.com/openshift/release/blob/master/core-services/pipeline-controller/lgtm-config.yaml).

The configuration format is:
```yaml
orgs:
  - org: your-org
    repos:
      - repo: your-repo
```

## Best Practices

1. **Wait for automatic triggers**: In Automatic and LGTM modes, let the controller automatically trigger tests when appropriate, unless you have a specific need to trigger them manually.

2. **Use `/pipeline required` when needed**: If you need to trigger tests manually, use `/pipeline required` to trigger all required tests at once rather than individual `/test` commands.

3. **Understand manual control**: Once you manually trigger tests in Automatic or LGTM mode, you're responsible for triggering the remaining tests until the PR HEAD changes.

## Troubleshooting

**Q: I don't see the pipeline controller comment on my PR**
- Check if your repository is enrolled in the pipeline controller
- Verify the repository is in the correct configuration file
- Ensure the PR was opened after enrollment

**Q: Tests aren't triggering automatically in Automatic mode**
- Check that all required (first-stage) tests have passed
- Verify the PR hasn't been manually controlled (check for manual trigger messages)
- Ensure your tests have the correct annotations (`pipeline_run_if_changed`, etc.)

**Q: I manually triggered a test and now nothing runs automatically**
- This is expected behavior. The controller detected manual intervention and requires manual control
- Use `/pipeline required` to trigger remaining tests
- Automatic triggering will resume after the PR HEAD changes

**Q: How do I switch between modes?**
- Change the repository configuration

