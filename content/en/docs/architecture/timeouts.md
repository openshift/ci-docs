---
title: "Job Execution Timeouts"
date: 2020-12-21T23:27:39-04:00
draft: false
---

A typical OpenShift CI job runs [ci-operator](/docs/architecture/ci-operator/) in a pod which for each [step](/docs/architecture/step-registry/#step) of the job creates a pod, executing the commands defined by `tests.steps.test.commands` of a step in the job. A _test process_ is a process which runs such commands. There are timeouts in various phases of a job execution. In this document, we will explain those timeouts, show the logs if they occur in a job, and how the test process will be notified, and how to modify the values of those timeouts.

## Job Timeout

The job timeout can be considered as the overall time for `ci-operator` to run. When a job fails due to the job timeout, the job log contains:

```
Process did not finish before 4h0m0s timeout
```

The following stanza in [Prow's configuration](https://github.com/openshift/release/blob/9238ee8b89c861793f9b8e8f7f6509abe33bd0b8/core-services/prow/02_config/_config.yaml#L559) specifies the default value of job timeout and it can be overwritten at `org`, or `org/repo` level (not supported at a more specific level).

```yaml
plank: # a core component of Prow
  default_decoration_configs:
    '*':
      grace_period: 30m0s
      timeout: 4h0m0s
    'org/repo': # overwrite the job timeout at repo level
      grace_period: 45m0s
      timeout: 6h0m0s
```

When the job timeout appears, the job pod will be terminated and as a result, the `ci-operator` process in the pod will receive [SIGTERM](https://pkg.go.dev/syscall#SIGTERM). If `ci-operator` is still running after `grace_period`, which is also specified in Prow's config, it will be forcibly halted and the job log contains:

```
Process did not exit before 30m0s grace period
```

 Responding to `SIGTERM`, `ci-operator` starts to terminate the pods it created. If the pod is for a non-step job from a `ci-operator`'s config, such as the following snippet, the test process which runs `go vet ./...` receives [SIGTERM](https://pkg.go.dev/syscall#SIGTERM) and after that point, the test process has `30s`, e.g., to procedure all artifacts, before it is killed.

 ```yaml
tests:
- as: "vet"                 # names this test "vet"
  commands: "go vet ./..."  # declares which commands to run
  container:
    from: "src"             # runs the commands in "pipeline:src"
 ```
 
 The `30s` for non-step jobs is not configurable to the users. In [Step Timeout](/docs/architecture/timeouts/#step-timeout) we will show how to set it up for step jobs.

## Step Timeout

Each [step](/docs/architecture/step-registry/#step) of a job runs in a pod. In a step definition, a user can specify `active_deadline_seconds` and `termination_grace_period_seconds` regarding to timeouts. If the pod is still running after `active_deadline_seconds` since its creation, the test process will receive [SIGTERM](https://pkg.go.dev/syscall#SIGTERM) and the job log contains:

```
... steps failed ... exceeded the configured timeout ...
```

Similarly to a job's `grace_period`, `termination_grace_period_seconds` configured in a step is the duration given to the test process to terminate gracefully. All artifacts have to be ready before `termination_grace_period_seconds` is complete.

The following step definition shows how to specify the values of `active_deadline_seconds` and `termination_grace_period_seconds`:

```yaml
ref:
  as: org-repo-e2e
  from: repo-tests
  commands: org-repo-e2e-commands.sh
  resources:
    requests:
      cpu: 1000m
      memory: 100Mi
  active_deadline_seconds: 600
  termination_grace_period_seconds: 30
  documentation: |-
    Runs the end-to-end suite published by org/repo.
```

## FAQ

### I saw timeout and grace_period in the job definition. Can I modify those?

No if the job is [generated](/docs/how-tos/contributing-openshift-release/#tolerated-changes-to-generated-jobs) from `ci-operator` config.
