---
title: "Handling Job Timeouts and Interruptions"
description: An overview of job execution timeouts, how to configure them and what the test workload is expected to do when handling them. 
---

# Overview

Job execution timeouts and preemptions occur regularly in the OpenShift CI infrastructure, and a well-formed job must be able to handle these events. The most common tasks that jobs should execute when reacting to interruptions are to generate output artifacts and logs to aid developers investigating the job failure in the future and to clean up any shared infrastructure or cloud resources that the job may be using.

# Architecture

## How Interruptions (Preemptions and Timeouts) Occur

Fully understanding the set of timeout conditions requires an overview of how jobs are executed on the fleet of OpenShift build farm clusters that make up the CI infrastructure. When a job is triggered by Prow, our top-level job orchestrator, a `Pod` is launched on the central CI build farm clusters to execute it. In OpenShift CI, this `Pod` runs [`ci-operator`](/docs/architecture/ci-operator), our job-specific orchestrator, with a cursory set of parameters (please execute job _foo_ for the _main_ branch of a specific repository). `ci-operator` in turn creates a `Namespace` on the build farm cluster in which more `Pods` execute individual [steps](/docs/architecture/step-registry/#step). Each `Pod` executes the commands as configured in `tests.steps.test.commands`, these commands are known as the _test process_. As a job author, you control the content of these commands, and the set of steps which run in the job.

Timeouts occur for a job when the overall job or some subset of the job exceeds the configured budget for execution. Preemptions occur when a new version of the job is triggered, and the previous version is rendered obsolete, as happens when new code is pushed to a Pull Request and previous commits are no longer important to test. Timeouts and preemptions are implemented via `Pod` deletions on our build farm clusters. Therefore, all interruption events will obey the basic rules of Kubernetes [graceful termination](https://cloud.google.com/blog/products/containers-kubernetes/kubernetes-best-practices-terminating-with-grace): the main process (PID 1) in each container is given a `SIGTERM`, some time to react to it gracefully, then given a `SIGKILL`. Distribution of signals to child processes in a container is the responsibility of the main test workload process.

Furthermore, instability in the OpenShift build farm clusters hosting these workloads may also trigger the deletion of `Pods` that implement a job. In these cases, the resulting workflow is identical, as `Pod` eviction honors the configured grace periods.

### Types of Timeouts

#### Prow Infrastructure Timeouts

{{< alert title="Note" color="info" >}}
Prow's infrastructure timeouts exist to guard the system against denial-of-service from poorly-formed jobs. These values are documented here for completeness, but exist to be tuned by administrators only. Effectively, job authors should worry only about test process timeouts from [Prow](#prow-test-process-timeouts), [`ci-operator`](#ci-operator-test-process-timeouts) and the [step registry](#step-registry-test-process-timeouts).
{{< /alert >}}

Prow is [configured](https://github.com/openshift/release/blob/9238ee8b89c861793f9b8e8f7f6509abe33bd0b8/core-services/prow/02_config/_config.yaml) to tightly bound the execution time budgets for all jobs in the system. The configuration specifies a number of timeouts, exceeding any of these will cause the test `Pod` (running `ci-operator`) to be deleted, triggering the Kubernetes graceful termination process. Each timeout has specific semantics:

- The `default_job_timeout` is a hard timeout for the overall lifetime of a job. This may be overridden for a specific job, but only to values smaller than the global timeout. This setting is global for all Prow jobs, it's needed as Prow can launch job types other than Kubernetes `Pods`.
- The `plank.pod_{pending,unscheduled}_timeout` settings allow Prow to move on from a job for which `Pods` cannot start. Jobs exhibiting these timeouts occur when issues exist with the underlying build farm clusters where `Pods` are executed. These jobs will be listed as errored, not failed, and the DPTP on-call rotation will investigate them.
- The `plank.pod_running_timeout` is the default timeout for the overall lifetime for a running `Pod` for a job. This value is _not_ encoded in the `pod.spec.activeDeadlineSeconds`, but handled by Prow itself.
- The `sinker.max_pod_age` is the timeout in Prow's garbage collector for how long any individual `Pod` may exist. This value is _not_ encoded in the `pod.spec.activeDeadlineSeconds`, but handled by Prow itself.
- The `sinker.max_prowjob_age` is the timeout in Prow's garbage collector for how long Prow will try to execute a job - any individual attempt to run a `Pod` for the job may fail, and Prow will continue to retry where it can until this timeout is reached.

```yaml
default_job_timeout: 24h0m0s
plank: # Prow's controller to launch Pods for jobs
  pod_pending_timeout: 15m0s
  pod_running_timeout: 48h0m0s
  pod_unscheduled_timeout: 5m0s
sinker: # Prow's garbage collector
  max_pod_age: 6h0m0s
  max_prowjob_age: 24h0m0s
```

#### Prow Test Process Timeouts

Prow is furthermore [configured](https://github.com/openshift/release/blob/9238ee8b89c861793f9b8e8f7f6509abe33bd0b8/core-services/prow/02_config/_config.yaml) to tightly bound the execution time budgets for all test processes for jobs in the system. Prow's infrastructure timeouts exist to guard the system against denial-of-service situations, so they are implemented as hard deadlines and are not meant to provide a pleasant user experience for test process authors. Prow projects a set of test process timeouts into jobs, as well, to allow test processes to exit gracefully before hard infrastructure timeouts occur. The configuration specifies a timeout as well as a grace period and can be overridden at the GitHub organization, repository or specific job level.

In OpenShift CI, this timeout and grace period apply to the `ci-operator` orchestrator and are forwarded to test processes running for steps of a job. The `timeout` setting is _not_ encoded in the `pod.spec.activeDeadlineSeconds`, but handled by Prow itself. The `grace_period` is set as `pod.spec.terminationGracePeriodSeconds`. Prow will delete the `ci-operator` job `Pod` when the timeout is reached and Kubernetes handles the final `SIGKILL` after the configured grace period expires. 

```yaml
plank: # Prow's controller to launch Pods for jobs
  default_decoration_configs:
    '*':
      grace_period: 30m0s
      timeout: 4h0m0s
    'org/repo': # overwrite the job timeout at repo level
      grace_period: 45m0s
      timeout: 6h0m0s
```

For configuring on a specific job, use a block [like][decoration_config-timeout-example]:

```yaml
decoration_config:
  timeout: 8h0m0s
```

When this timeout is reached in a job, the following log lines will be shown in the test log:

```
# when the timeout is reached:
{"component":"entrypoint","level":"error","msg":"Process did not finish before 4h0m0s timeout"}
# if the process responds to the interruption and exits:
{"component":"entrypoint","level":"error""msg":"Process gracefully exited before 30m0s grace period"}
# if the process does not exit:
{"component":"entrypoint","level":"error","msg":"Process did not exit before 30m0s grace period"}
```

#### `ci-operator` Test Process Timeouts

`ci-operator` itself handles the `SIGTERM` that occurs when the job is interrupted for any reason. The response to this signal depends on what stage the job is executing when interrupted: if a `pre-` or `test-` step is running when the interrupt occurs, the `SIGTERM` is passed on to that step by deleting its `Pod`. The step may continue to execute until its configured grace period is exhausted. If a `post-` step is running, it is not interrupted. Once no `pre-` or `test-` step is running, `post-` steps are executed, in order, until `ci-operator` itself reaches its grace period.

When this timeout is reached in a job, the following log lines from `ci-operator` will be shown in the logs:

```
# when the timeout is reached:
time="2021-02-15T15:27:53Z" level=info msg="Received signal." signal=interrupt
2021/02/15 15:27:53 error: Process interrupted with signal interrupt, cancelling execution...
# cleanup begins:
2021/02/15 15:27:53 cleanup: Deleting release pod release-images-initial
2021/02/15 15:27:53 cleanup: Deleting release pod release-images-latest
# post-steps are triggered:
2021/02/15 15:53:03 Executing pod "e2e-aws-upgrade-gather-extra" running image "stable:cli" 
```

#### Step Registry Test Process Timeouts

Each [step](/docs/architecture/step-registry/#step) may be configured to have a specific execution time budget with `timeout` and grace period with `grace_period`. By default, the `timeout` will be two hours and the `grace_period` fifteen seconds. The timeout is handled by a wrapper around the test process; the grace period implicitly sets the respective field (`pod.spec.terminationGracePeriodSeconds`) on the `Pod` that executes the step by assuming that generating artifacts takes 80% of cleanup time, while uploading takes 20%. For instance, when a step is configured to have a `grace_period` of 100 seconds, the overall termination grace period on the `Pod` will be 125% of that, or 125s. These options may be provided one at a time, in order to set only a grace period, for instance. Note that the calculations for the termination grace period above mean that the grace period configured for a step must only be long enough to generate any artifacts. The following step definition shows how to specify the values of `timeout` and `grace_period`:

```yaml
ref:
  as: org-repo-e2e
  from: repo-tests
  commands: org-repo-e2e-commands.sh
  resources:
    requests:
      cpu: 1000m
      memory: 100Mi
  timeout: 5m0s
  grace_period: 30s
  documentation: |-
    Runs the end-to-end suite published by org/repo.
```

{{< alert title="Warning" color="warning" >}}
The `pod.spec.activeDeadlineSeconds` setting on a `Pod` only implicitly bounds the amount of time that a `Pod` executes for on a Kubernetes cluster. The active deadline begins at the first moment that a `kubelet` acknowledges the `Pod`, which is after it is scheduled to a specific node but before it pulls images, sets up a container sandbox, _etc_. It is therefore possible to exceed the active deadline without ever having a container in the `Pod` execute. Please see the [API documentation](https://kubernetes.io/docs/reference/generated/kubernetes-api/v1.20/#podspec-v1-core) for more details. For these reasons, no timeout configured in the system makes use of this setting, instead relying on a thin wrapper around the executing code that's injected by Prow itself.
{{< /alert >}}

## How Interruptions May Be Handled

Two main approaches exist to handling interruptions for a test process: first, the test process itself may listen for and handle `SIGTERM`; second, `post` steps may be declared in a test `workflow` to be run after an interruption occurs. The first approach is most useful when relevant state for responding to the interrupt exists only in the test process itself, and the response is fairly short. This approach has the downside of requiring complex test process code and signal handling implementation. The second approach is suggested as it is more robust and tunable. In this approach, state needed to respond to the interrupt should be stored in the [`${SHARED_DIR}`](/docs/architecture/step-registry/#sharing-data-between-steps) for use by the `post` step. The `post` step may be marked as [best-effort](/docs/architecture/step-registry/#marking-post-steps-best-effort) if it only gathers artifacts or cleans up resources. Examples of both approaches follow.

### Handling `SIGTERM` In A Test Process

An individual test process configured as a step in a job workflow may handle `SIGTERM` itself to gracefully exit and produce all logs and artifacts necessary. Handling interruption signals within a test process is useful when test process state is necessary to correctly handle interruption. Note that the grace period for a step must only be long enough to generate any artifacts - time taken to upload logs and artifacts is taken from a separate budget. Here's an example of a step configuration that handles `SIGTERM` itself:

```yaml
ref:
  as: my-test
  from: src
  commands: my-test-commands.sh
  resources:
    requests:
      cpu: 1000m
      memory: 100Mi
  grace_period: 120s
  documentation: |-
    Runs the test suite from source code.
```

Note that the step declares a 120s termination grace period, which is much larger than the default of 30s. The step commands might look like:

```shell
#!/usr/bin/env bash

set -o errexit
set -o nounset
set -o pipefail

current=0

function cleanup() {
  echo "Validated up to ${current}!"
  exit 1
}
trap cleanup EXIT

for (( i = 0; i < 999; i++ )); do
    ./validate.sh $i # validate the number using a script in the repo
    current=$i
done
```

{{< alert title="Warning" color="warning" >}}
By default, the shell will *not* propagate `SIGTERM` to child processes, regardless of whether they are in the foreground or background. In the above example, if `./validate.sh` is running when the parent receives `SIGTERM`, the `trap` will fire without forwarding the signal. In practical terms, this means that `./validate.sh` will not get a chance to exit cleanly before the `Pod` running this step is terminated. See the [below](#forwarding-signals-to-children-in-steps) section for a more complex approach that handles this case.
{{< /alert >}}

#### Forwarding Signals To Children In Steps

It may be required that your test step forward termination signals to children of the shell and wait for them to exit cleanly before the parent shell process (the main test process in the step) exits. The following step commands will forward `SIGTERM` to the children of the shell and wait for them to finish running before exiting:

```shell
#!/usr/bin/env bash

set -o errexit
set -o nounset
set -o pipefail

current=0

function cleanup() {
  for child in $( jobs -p ); do
    kill "${child}"
  done
  wait
  echo "Validated up to ${current}!"
  exit 1
}
trap cleanup EXIT

for (( i = 0; i < 999; i++ )); do
    /tmp/validate.sh $i & # validate the number using a script in the repo
    wait $!
    current=$i
done
```

### Declaring Post Steps

When the amount of work necessary to respond to an interrupt is large, or the work does not depend on specific test process state, it is best to write the work as a `post-` step that will be executed once `ci-operator` begins handling the interrupt. For an example of such a step, see the [`must-gather`](https://steps.ci.openshift.org/reference/gather-must-gather) step in the [`gather`](https://steps.ci.openshift.org/chain/gather) chain, which holds generic steps that gather debugging information from OpenShift clusters under test to help with processing job output after the fact. All `post-` steps that run after `ci-operator` begins handling the interrupt must finish before the configured [grace period](#prow-test-process-timeouts).

[decoration_config-timeout-example]: https://github.com/openshift/release/blob/8708ff67f91fb654f8a06213825d609f92c80135/ci-operator/jobs/infra-periodics.yaml#L366-L367
