---
title: "Set Up Slack Alerts for Job Results"
description: How to set up alerting to Slack for a CI job.
---

We can set up Slack alerts for job results by defining `reporter_config` in the job definition. This is possible for all job types: `periodics`, `presubmits`, and `postsubmits`.
`Prowgen` is [capable](https://docs.ci.openshift.org/how-tos/notification/#setting-up-slack-notifications-with-prowgen) of adding this to the job definition.

{{< alert title="Warning" color="warning" >}}
Currently, it is still possible to manually add the `reporter_config` to periodic jobs. This functionality is deprecated, and using `Prowgen` is preferred.
Once a significant number of jobs have migrated to use `Prowgen`, the ability to manually edit the periodics will be removed.
{{< /alert >}}

```yaml
reporter_config:
  slack:
    channel: '#forum'
    job_states_to_report:
    - failure
    report_template: Job {{.Spec.Job}} failed.
```

For example, by the above snippet, a Slack alert will be sent out to `#forum` channel when there is a failure of the job. The alert is formatted by `report_template`.

* The channel has to be in [coreos.slack.com](https://coreos.slack.com/).
* The channel has to be public. If it is not then the `@prow` bot has to be added to it otherwise it won't be able to properly post messages.
* The state in `job_states_to_report` has to be a valid Prow job state. See [upstream documentation](https://pkg.go.dev/sigs.k8s.io/prow/pkg/apis/prowjobs/v1#ProwJobState).
* The value of `report_template` is a [Go template](https://golang.org/pkg/text/template/) and it will be applied to the Prow job instance. The annotations such as `{{.Spec.Job}}` will be replaced by the job name when the alert is received in Slack. See [upstream documentation](https://pkg.go.dev/sigs.k8s.io/prow/pkg/apis/prowjobs/v1#ProwJob) for more fields of a Prow job. Note that no alerts will be sent out if the template is broken, e.g., cannot be parsed or applied successfully.

## Setting up Slack notifications with Prowgen
`Prowgen` is the tool that is used to generate `ProwJobs` from `ci-operator` configuration. It is possible to instruct `Prowgen` to add a `reporter_config` to specific jobs.
Doing so requires creating or updating the repo (or organization) in question's `.config.prowgen` file. This YAML configuration file is stored in the repo's `ci-operator` folder.
For example, `ci-tools` configuration file is found at `ci-operator/config/openshift/ci-tools/.config.prowgen`. The following example illustrates how to utilize this config to add slack notifications for jobs:

```yaml
slack_reporter:
- channel: "#slack-channel"
  job_states_to_report: #Accepts any ProwJob status
  - success
  - failure
  - error
  report_template: '{{if eq .Status.State "success"}} :rainbow: Job *{{.Spec.Job}}*
                           ended with *{{.Status.State}}*. <{{.Status.URL}}|View logs> :rainbow: {{else}}
                           :volcano: Job *{{.Spec.Job}}* ended with *{{.Status.State}}*. <{{.Status.URL}}|View
                           logs> :volcano: {{end}}'
  job_names: # Listing of job names (ci-operator's 'as' field) that this configuration applies to
  - unit
  - upload-results
  - lint
  excluded_variants: # It is possible to exclude notifications from specific variants, for example, when you don't require them from older releases
  - some-old-release
```

{{< alert title="Note" color="info" >}}
Note that it is possible to include multiple `slack_reporter` entries in this config, but each `job_name` should only be included in, at most, one.
{{< /alert >}}

{{< alert title="Note" color="info" >}}
It is possible to add slack reporting for the `images` postsubmit job by adding the "images" entry to `job_names`.
{{< /alert >}}

Once the configuration is added, simply use the `make jobs` target to generate the new job definitions containing the `reporter_config`.

### Slack Reporter Configuration

The `slack_reporter` configuration supports flexible job matching with multiple approaches:

1. **Exact matching** with `job_names`: Matches job names exactly
2. **Pattern matching** with `job_name_patterns`: Matches job names using regular expressions
3. **Exclusion** with `excluded_job_patterns`: Excludes jobs matching regex patterns (similar to `excluded_variants`)

**Matching Priority:**
- Exclusions are checked first - if a job matches any `excluded_job_patterns`, it's excluded regardless of other rules
- Exact matches in `job_names` take precedence over pattern matches in `job_name_patterns`
- This allows for more flexible job matching while maintaining compatibility with existing configurations

**Examples:**

```yaml
slack_reporter:
# Example 1: Mixed exact and pattern matching
- channel: "#my-team"
  job_names: ["unit", "images"]        # Exact matches
  job_name_patterns: ["^e2e-.*"]       # Regex patterns

# Example 2: Broad matching with exclusions (similar to excluded_variants)
- channel: "#ops-team"
  job_name_patterns: [".*"]            # Match all jobs
  excluded_job_patterns:               # But exclude these patterns
  - ".*-skip$"                         # Jobs ending with "-skip"
  - "^nightly-.*"                      # Jobs starting with "nightly-"
  - ".*-flaky-.*"                      # Jobs containing "-flaky-"

# Example 3: Combining all approaches
- channel: "#dev-team"
  job_names: ["critical-test"]         # Always include this specific job
  job_name_patterns: ["^unit-.*"]      # Include all unit tests
  excluded_job_patterns: [".*-slow$"]  # But exclude slow tests
```

The `excluded_job_patterns` approach is often simpler than complex inclusion patterns, especially when you want to match most jobs in a repository but exclude specific types.

The `SlackReporterConfig` is provided for [reference](https://github.com/openshift/ci-tools/blob/6810ce942bbe25a06c092af8098fd2d071604a04/pkg/config/load.go#L49-L57).
