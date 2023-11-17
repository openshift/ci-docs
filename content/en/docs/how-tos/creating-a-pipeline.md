---
title: "Creating a Pipeline"
description: How to use existing functionalities to create a simple 2-stage pipeline
---

Prow does not support pipelines. Hence, when submitting a new pull request, all tests are executed, including resource-intensive tests that can lead to increased infrastructure costs. To address this limitation, OpenShift CI introduces an abstraction layer utilizing GitHub's branch protection rules. This enables the use of both manual (triggered by a user) and automatic (triggered by a bot) two-stage pipelines.

## Marking CI job as second stage job

To enable two-stage pipelines, two actions are required. First, a specific branch protection setting must be activated within the Prow configuration of the repository ([example](https://github.com/openshift/release/blob/master/core-services/prow/02_config/openshift/ci-tools/_prowconfig.yaml#L6)) or organization.

{{< alert title="Note" color="info" >}}
Branch protection configuration can also be enabled on the branch level. It will, however, disable the possibility of using automatic pipelines as they work on the repository and organization level.
{{< /alert >}}

```yaml
branch-protection:
  orgs:
    openshift:
      repos:
        ci-tools:
          require_manually_triggered_jobs: true # enable pipelines on repo level
```

Secondly, a job that is intended to be promoted to the second stage must be appropriately marked. This involves explicitly setting the `always_run: false` property. Additionally, the job cannot be marked as `optional: true` and should not have `skip_if_only_changed` or `run_if_changed` configured.

```yaml
- always_run: false # job has to be explicitly marked
  as: e2e
  steps:
    test:
    - as: e2e
      commands:
      ...
      from: test-bin
      resources:
        requests:
          cpu: 100m
          memory: 200Mi
```
Upon submitting a PR with changes and merging, it may take up to six hours for the changes to be applied. This is because the Test Platform executes a branch protection periodic job every 6h which updates the GitHub configuration.

## Manual Pipelines

Users can enable manual pipeline support and have complete control over when the second stage is executed. Manual pipelines are recommended for users who:
- Are comfortable manually executing the second stage of the pipeline.
- Want to wait for labels and then trigger the second stage of testing, such as trigger manually after receiving an `LGTM` and `approve` label.

Manual pipelines are currently a default solution, so if all tests are properly marked, they should be enabled. To trigger the second stage of the pipeline, user should create a comment on PR `/test remaining-required`. This will run all tests that have been promoted to the second stage.

### Known issues
- Tide displays the message `In merge pool` if all required labels are applied, the first stage is complete, and no `/test remaining-required` comment is made. While this may suggest that the pull request is ready to be merged, this is not the case. The pull request will not be merged until all tests, including those in the second stage, have passed. TP is currently developing a fix for Tide to address this misleading message.

## Automatic Pipelines (experimental)

Users can opt-in to use automatic pipelines, which eliminates the need to track job execution. Our bot account will automatically comment `/test remaining-required` on pull requests when the following criteria are met:

- The PR is not a draft.
- All required jobs necessary for merging are green (optional jobs are ignored by the controller).

{{< alert title="Note" color="info" >}}
Automatic pipelines trigger the second stage immediately upon successful completion of the first stage. This means that the second stage cannot wait for labels or other triggers. If you require such functionality, please switch to manual pipelines.
{{< /alert >}}

The controller responsible for triggering the second stage maintains a 24-hour memory of job contexts. Consequently, it will not comment on PRs that have been abandoned. If new commits are added or existing commits are modified and the first stage is triggered again, the controller resets the clock and reconsiders the PR.

### Enabling automatic pipelines at the repository or organization level

To enable automatic pipelines, a PR must be submitted to modify the [openshift/release config](https://github.com/openshift/release/blob/master/core-services/pipeline-controller/config.yaml), adding the desired repository. Alternatively, it is also possible to add an entire organization by submitting a PR with the organization name, and without specifying any repositories.

### Troubleshooting
Support for automatic pipelines is experimental. TP has made every effort to cover all known corner cases and ensure that the bot comments on PRs. However, in rare instances, including situations when the GitHub webhook is unavailable due to factors such as partial GitHub outages, the bot may not post the comment. In such cases, users should comment on the PR themselves `/test remaining-required` to activate second stage. If the issue persists or is repeatable in certain situations, please submit a bug report using our bot in the `#forum-ocp-testplaftorm` Slack channel.

