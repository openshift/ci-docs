---
title: "Set Up Slack Alerts for Job Results"
description: How to set up alerting to Slack for a CI job.
---

We can set up Slack alerts for job results by configuring the `slack_reporter` field on individual tests in the `ci-operator` configuration file. This is possible for all job types: `periodics`, `presubmits`, and `postsubmits`.

## Setting up Slack notifications

To add Slack reporting for a test, add the `slack_reporter` field to the test in your `ci-operator` configuration:

```yaml
tests:
- as: "unit"
  commands: "make test-unit"
  container:
    from: "bin"
  slack_reporter:
    channel: "#my-channel"
    job_states_to_report:
    - failure
    - error
    report_template: 'Job {{.Spec.Job}} ended with {{.Status.State}}. <{{.Status.URL}}|View logs>'
```

### Configuration fields

* `channel` (**required**) The Slack channel to report to (e.g., `#my-channel`).
* `job_states_to_report` (optional) Which job states trigger a report. Defaults to `["failure", "error"]` if not set. Must be valid [Prow job states](https://pkg.go.dev/sigs.k8s.io/prow/pkg/apis/prowjobs/v1#ProwJobState).
* `report_template` (optional) A [Go template](https://golang.org/pkg/text/template/) for the Slack message. Applied to the [ProwJob](https://pkg.go.dev/sigs.k8s.io/prow/pkg/apis/prowjobs/v1#ProwJob) instance. If not set, a default template is used. No alerts will be sent if the template cannot be parsed or applied.

### Requirements

* The channel must be on [coreos.slack.com](https://coreos.slack.com/).
* The channel must be public, or the `@prow` bot must be added to it.

### Example with defaults

When only `channel` is provided, defaults are applied for `job_states_to_report` and `report_template`:

```yaml
tests:
- as: "e2e"
  commands: "make test-e2e"
  container:
    from: "bin"
  slack_reporter:
    channel: "#my-team"
```

This will report on `failure` and `error` states using a default template.

## Deprecated: `.config.prowgen` Slack configuration

{{< alert title="Warning" color="warning" >}}
The `.config.prowgen` file `slack_reporter` section is deprecated. Slack reporting should be configured directly on each test using the `slack_reporter` field as shown above. The `.config.prowgen` fallback is still supported but will be removed in the future.
{{< /alert >}}

The legacy `.config.prowgen` approach used a separate file (`ci-operator/config/$org/$repo/.config.prowgen`) with pattern-based job matching:

```yaml
slack_reporter:
- channel: "#slack-channel"
  job_states_to_report:
  - failure
  - error
  job_names:
  - unit
  - e2e
```

This is now replaced by the per-test `slack_reporter` field in the `ci-operator` configuration, which is simpler and keeps all configuration in one place.
