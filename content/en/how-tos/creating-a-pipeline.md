---
title: "Creating a Pipeline"
description: Configure and use two-stage test pipelines with the Pipeline Controller
---

The Pipeline Controller splits pull request testing into two stages. Fast, required first-stage tests can run immediately; more expensive second-stage tests can wait for first-stage success, review approval, or an explicit command. Repository enrollment determines the trigger, and job configuration determines which second-stage tests apply to the changed files.

## Choose a trigger

| Mode | When the controller dispatches second-stage tests |
| --- | --- |
| **Manual** | When a user requests them with `/pipeline required` or `/pipeline remaining`. |
| **Automatic** | After the applicable required first-stage tests pass. |
| **LGTM** | When the `lgtm` label is added. Use `/pipeline auto` to add `pipeline-auto` and enable automatic dispatch after first-stage success for that PR. |

{{< alert title="Automatic mode limitation" color="warning" >}}
If a PR is left inactive with failing tests and revisited later without a new HEAD commit, automatic mode may not start the second stage. The controller relies on in-cluster ProwJob data, which has a limited lifetime, rather than querying GitHub for historical results. Use `/pipeline remaining` to request missing jobs, or `/pipeline required` when you intend to rerun the full required set.
{{< /alert >}}

The controller posts an opening notification explaining the second stage. Use `/test ?` to list available tests and `/test <job-name>` to request an individual job.

Automatic and LGTM modes complement jobs you start manually. When their trigger occurs, the controller schedules only applicable second-stage jobs that do not already have a run at the current PR HEAD. This missing set is the **delta**. Starting one job manually does not put the pipeline under manual control. A new HEAD starts a fresh pipeline.

A job that already ran at the current HEAD is excluded from the delta even if it failed. Use `/test <job-name>` to rerun that job, or `/pipeline required` to rerun the full required set.

## Run tests with commands

Post each command on its own line in a new PR comment. Use a separate comment for each pipeline command. `/pipeline help` lists all supported commands with short descriptions.

| Command | Behavior |
| --- | --- |
| `/pipeline help` | List pipeline commands. |
| `/pipeline required` | Force dispatch of the full applicable required second-stage set, including jobs that already ran or are still running. |
| `/pipeline remaining` | Dispatch only applicable required second-stage jobs missing at the current HEAD. |
| `/pipeline auto` | In LGTM mode, add `pipeline-auto` so dispatch follows first-stage success for this PR. |
| `/pipeline skip-agentic-mode` | For an agentic-enrolled PR, switch to traditional scheduling, including future pushes. |
| `/pipeline agentic-mode` | Restore the configured agentic mode; completed dispatch can defer the change until the next HEAD. |
| `/pipeline mark-pipeline-gate [<HEAD>]` | Acknowledge dispatch completion for the current HEAD, creating a missing gate when requested by an organization member or repository collaborator. |

Both `/pipeline required` and `/pipeline remaining` bypass the first-stage gate and work in all three traditional trigger modes. Use them when you intentionally want to start the second stage early. They do not disable subsequent automatic or LGTM scheduling: later automatic dispatch still fills only the delta.

{{< alert title="Warning" color="warning" >}}
`/pipeline required` can duplicate running jobs. Use `/pipeline remaining` to fill gaps without rerunning jobs that already started. While agentic mode is active, both commands are rejected rather than queued; opt out first and then repeat the command.
{{< /alert >}}

## Configure second-stage tests

In ci-operator configuration, set `always_run: false` for second-stage tests. A test is always required in the second stage when it is not `optional: true` and has no conditional selection fields:

```yaml
- always_run: false
  as: e2e-critical-test
  steps:
    workflow: openshift-e2e-aws
```

An optional test is not included in the always-required set merely because it has `always_run: false`.

### Run tests for matching changes

Use `pipeline_run_if_changed` when a test should run only if at least one changed file matches a regular expression:

```yaml
- always_run: false
  as: e2e-builds-test
  pipeline_run_if_changed: ^(pkg/build)|^(test/extended/builds)
  steps:
    workflow: openshift-e2e-aws-builds
```

### Skip tests for limited changes

Use `pipeline_skip_if_only_changed` when a test should be skipped if every changed file matches a regular expression. If any changed file falls outside the pattern, the test applies:

```yaml
- always_run: false
  as: e2e-integration-test
  pipeline_skip_if_only_changed: ^(?:docs|\.github)/|\.md$|^(?:\.gitignore|OWNERS|OWNERS_ALIASES|PROJECT|LICENSE)$
  steps:
    workflow: openshift-e2e-aws
```

These ci-operator fields become annotations on generated Prow jobs. Keep the fields alongside `always_run` in ci-operator configuration, as shown above. Use `|` to combine regular expression alternatives and check the patterns against representative file paths. Avoid setting both fields on one test: `pipeline_run_if_changed` takes precedence.

## Enroll a repository

Add the repository to the appropriate configuration in `openshift/release`:

- [Main pipeline configuration](https://github.com/openshift/release/blob/main/core-services/pipeline-controller/config.yaml) for traditional automatic or manual mode.
- [LGTM pipeline configuration](https://github.com/openshift/release/blob/main/core-services/pipeline-controller/lgtm-config.yaml) for traditional LGTM mode.

Both files accept repository names or objects with `name`, `branches`, and `mode`. For example, in the main configuration:

```yaml
orgs:
  - org: your-org
    repos:
      - your-repo-1
      - name: your-repo-2
        branches:
          - main
          - release-4.x
        mode:
          trigger: manual
```

A bare repository name or an omitted `mode.trigger` defaults to `auto` in the main configuration. An omitted or empty `branches` list enables all target branches; otherwise only the listed PR target branches are enrolled.

The shared mode schema has `trigger: auto`, `manual`, or `lgtm`, and an optional `agentic.mode: chai`. Traditional automatic and manual enrollment uses the main file; traditional LGTM enrollment uses the LGTM file, which supplies the LGTM trigger even when `mode.trigger` is omitted. For agentic enrollment, all three triggers are supported in the main file; the LGTM file also accepts `agentic.mode: chai` and uses the LGTM trigger. The trigger controls traditional fallback if Chai does not respond or a user opts out.

### Require the dispatch gate

With GitHub App authentication, the controller publishes `ci/pipeline-gate` for the current HEAD. In traditional mode it waits for the configured trigger, then succeeds after the applicable jobs are dispatched through `/test`. It also succeeds when no jobs apply or all applicable jobs already have runs. Planning or dispatch errors do not make it green.

This check tracks **dispatch, not test results**. Individual native job contexts continue to report and gate their own results. A green pipeline gate does not mean the tests passed.

Require the controller App's `ci/pipeline-gate` in Tide and branch protection for enrolled branches so a missed dispatch blocks merging. Scope that requirement to the same target branches as enrollment; an unenrolled branch will not receive the check. Replace any older `ci/tests-dispatched` requirement with `ci/pipeline-gate`.

### Recover a missing or stuck gate

An organization member or repository collaborator can post:

```text
/pipeline mark-pipeline-gate
```

This creates a missing `ci/pipeline-gate` as successful, or completes the controller-owned gate for the current PR HEAD and target branch, including a pending or running gate. Use it when dispatch has been checked and the gate needs recovery. It does not start tests or override native job contexts or their results.

To bind the acknowledgment to a particular commit, supply the full 40-character HEAD SHA:

```text
/pipeline mark-pipeline-gate <HEAD>
```

The supplied SHA must match the current PR HEAD. Without a SHA, the command targets the current HEAD when processed. A new push starts a fresh pipeline and needs its own dispatch or recovery. The command requires GitHub App authentication. The controller rejects a gate owned by another PR; a shared commit does not transfer dispatch completion between PRs.

## Agentic mode with Chai — CLOSED BETA

{{< alert title="CLOSED BETA" color="warning" >}}
Agentic mode is available only to explicitly enrolled repositories and branches. `/pipeline agentic-mode` cannot enroll a repository or enable Chai on an unsupported branch.
{{< /alert >}}

Agentic mode hands second-stage test selection and dispatch to Chai. An enrolled entry uses the same configuration schema:

```yaml
orgs:
  - org: your-org
    repos:
      - name: your-repo
        branches:
          - main
        mode:
          trigger: auto
          agentic:
            mode: chai
```

After the applicable first-stage tests pass, the controller creates a queued `ci/pipeline-gate`. Its check-run creation event signals that Chai may begin and starts a response timeout. A new comment from the configured trusted Chai account after readiness and within that timeout acknowledges the handoff. Chai then selects tests, publishes their native job contexts, and dispatches them. It acknowledges dispatch completion with `/pipeline mark-pipeline-gate <HEAD>` after the native job contexts are in place to gate merging; the controller does not wait for test results.

If Chai does not respond before the deadline, the controller falls back to traditional selection for that HEAD, respecting first-stage success and the configured automatic, manual, or LGTM trigger. Late Chai comments or completion commands cannot reclaim dispatch after fallback. Once Chai responds, there is no completion timeout.

Trusted Chai completion requires an active readiness gate for the current HEAD and target branch. Chai cannot create a missing gate through the recovery command; missing-gate recovery is reserved for organization members and repository collaborators.

### Opt out and restore agentic mode

Use `/pipeline skip-agentic-mode` to add `pipeline-skip-agentic-mode` and return to traditional scheduling. The opt-out persists across pushes until removed. If Chai has responded but dispatch stalls, opt out and use `/pipeline remaining` or `/pipeline required` to recover. Running tests are not cancelled.

Use `/pipeline agentic-mode` to remove the opt-out and restore the repository's configured agentic mode. If dispatch is already complete for the current HEAD, the existing completion and ownership are preserved, and a new agentic handoff waits for the next HEAD. Traditional rerun commands remain available on a revision whose dispatch is already owned by traditional scheduling, including recovery of a later failed rerun. Otherwise, restoration waits for first-stage success to create a fresh readiness signal.

While agentic mode owns selection, `/pipeline required` and `/pipeline remaining` are rejected and must be repeated after opting out. `/pipeline auto` only sets the LGTM automatic-trigger label; it does not take test selection away from Chai.

## Troubleshooting

- **No opening notification:** Check repository enrollment and the PR target branch. A PR opened before enrollment may need another event or a manual command.
- **Automatic dispatch has not started:** Check applicable first-stage results and the configured trigger. Manually started second-stage jobs do not disable automatic scheduling. In agentic mode, also check whether Chai has responded or the response timeout has expired.
- **The gate is green but tests are failing:** The pipeline gate records dispatch only. Inspect and recover the individual failing job contexts.
- **The gate is missing or stuck:** Verify dispatch, then ask an organization member or repository collaborator to use `/pipeline mark-pipeline-gate [<HEAD>]`. This recovery does not run the tests.
- **Changing the repository's trigger:** Update enrollment configuration. `/pipeline auto` changes an individual LGTM PR's behavior; it does not change repository enrollment.
