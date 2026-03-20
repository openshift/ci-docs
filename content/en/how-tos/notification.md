---
title: "Set Up Slack Alerts for Job Results"
description: How to set up alerting to Slack for a CI job.
---

We can set up Slack alerts for job results by configuring the `reporter_config` field on individual tests in the `ci-operator` configuration file. This is possible for all job types: `periodics`, `presubmits`, and `postsubmits`.

## Setting up Slack notifications

To add Slack reporting for a test, add the `reporter_config` field to the test in your `ci-operator` configuration:

```yaml
tests:
- as: "unit"
  commands: "make test-unit"
  container:
    from: "bin"
  reporter_config:
    channel: "#my-channel"
    job_states_to_report:
    - failure
    - error
    report_template: 'Job {{.Spec.Job}} ended with {{.Status.State}}. <{{.Status.URL}}|View logs>'
```

### Configuration fields

* `channel` (**required**) The Slack channel to report to (e.g., `#my-channel`).
* `job_states_to_report` (optional) Which job states trigger a report. Defaults to `["success", "failure", "error"]` if not set. Must be valid [Prow job states](https://pkg.go.dev/sigs.k8s.io/prow/pkg/apis/prowjobs/v1#ProwJobState).
* `report_template` (optional) A [Go template](https://golang.org/pkg/text/template/) for the Slack message. Applied to the [ProwJob](https://pkg.go.dev/sigs.k8s.io/prow/pkg/apis/prowjobs/v1#ProwJob) instance. If not set, Prow uses its built-in default template. No alerts will be sent if the template cannot be parsed or applied.
* `report_presubmit` (optional) Only relevant for periodic tests with `presubmit: true`. When set to `true`, the Slack config also applies to the presubmit job generated from the periodic. By default, periodic-only Slack config does not carry over to the presubmit.

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
  reporter_config:
    channel: "#my-team"
```

This will report on `success`, `failure`, and `error` states using Prow's default template.

## Deprecated: `.config.prowgen` Slack configuration

{{< alert title="Warning" color="warning" >}}
The `.config.prowgen` file `reporter_config` section is deprecated. Slack reporting should be configured directly on each test using the `reporter_config` field as shown above. The `.config.prowgen` fallback is still supported but will be removed in the future.
{{< /alert >}}

The legacy `.config.prowgen` approach used a separate file (`ci-operator/config/$org/$repo/.config.prowgen`) with pattern-based job matching:

```yaml
reporter_config:
- channel: "#slack-channel"
  job_states_to_report:
  - failure
  - error
  job_names:
  - unit
  - e2e
```

This is now replaced by the per-test `reporter_config` field in the `ci-operator` configuration, which is simpler and keeps all configuration in one place.
