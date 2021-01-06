---
title: "Setup Slack Alerts for Periodic Job Results"
date: 2020-01-06T10:08:01-04:00
draft: false
---

We can set up Slack alerts for job results by defining `reporter_config` in the job definition.

```yaml
reporter_config:
  slack:
    channel: '#forum'
    job_states_to_report:
    - failure
    report_template: 'Job {{.Spec.Job}} failed.'
```

For example, by the above snippet, a Slack alert will be sent out to `#forum` channel when there is a failure of the job. The alert is formatted by `report_template`.

* The channel has to be in [coreos.slack.com](https://coreos.slack.com/).
* The state in `job_states_to_report` has to be a valid Prow job state. See [upstream documentation](https://godoc.org/k8s.io/test-infra/prow/apis/prowjobs/v1#ProwJobState).
* The value of `report_template` is a [Go template](https://golang.org/pkg/text/template/) and it will be applied to the Prow job instance. The annotations such as `{{.Spec.Job}}` will be replaced by the job name when the alert is received in Slack. See [upstream documentation](https://godoc.org/k8s.io/test-infra/prow/apis/prowjobs/v1#ProwJob) for more fields of a Prow job. Note that no alerts will be sent out if the template is broken, e.g., cannot be parsed or applied successfully.

The following snippet shows an example of embedding the `reporter_config` into a job definition:

```yaml
agent: kubernetes
cron: 0 */6 * * *
decorate: true
name: periodic-job-name
reporter_config:
  slack:
    channel: '#forum'
    job_states_to_report:
    - failure
    report_template: 'Job {{.Spec.Job}} failed'
spec: {}  # Valid Kubernetes PodSpec.
```

_Note_ that we have to modify the job yaml directly even if the job is generated from a `ci-operator`'s config and regenerating the jobs does not change the existing `reporter_config`. Moreover, we do not support `reporter_config` for **generated** presubmits and postsubmits.
