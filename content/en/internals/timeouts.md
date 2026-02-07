---
title: Timeouts and Interruptions
description: >
  A description of the implementation details of job and test timeouts and
  interruptions.
---

This section describes in detail how the CI infrastructure, both
[upstream][prow] and [downstream][ci_tools], handles interruptions.  It is
meant primarily for DPTP, but can also be useful when the [user
documentation][user_documentation] fails to fully explain the behavior
manifested in a job.

`Pod`s in CI jobs are not composed of just the container(s) configured in the
Prow job or `ci-operator` definition.  One or more small coordinating processes
are added to the final `Pod` definition, each responsible for implementing a
part of the overall job/test execution.

In particular, the commands configured in a Prow job
(`pod_spec.containers[].commands`) or `ci-operator` step (`commands`) are not
executed directly.  Instead, one or more of these processes are layered such
that each is made a parent of the next, with the ultimate descendant being the
shell which actually executes the test script as configured.  This means "PID 1"
described in this document and in the Kubernetes documentation will not be the
user script.  Each of these processes, however, when present, correctly forwards
signals to its child, so the method for handling interruptions remains the same.

These auxiliary processes are described in the next few sections.

## `entrypoint`

The `commands` configured in Prow job `Pod`s execute [`entrypoint`][entrypoint]
from `kubernetes/test-infra`.  As explained in the timeout [architecture]({{<
ref "/architecture/timeouts#architecture" >}}) section, this is so timeout
durations can be properly enforced given the limited primitives available in
Kubernetes.  `entrypoint` is configured via the environment variable
`ENTRYPOINT_OPTIONS`, as seen in the `ProwJob` object

{{< highlight "yaml" >}}
# pod_spec.containers[0].env[]|select(.name=="ENTRYPOINT_OPTIONS").value
{
  "timeout": 14400000000000,
  "grace_period": 3600000000000,
  "artifact_dir": "/logs/artifacts",
  "args": [
    "ci-operator",
    "--gcs-upload-secret=/secrets/gcs/service-account.json",
    "--image-import-pull-secret=/etc/pull-secret/.dockerconfigjson",
    "--report-credentials-file=/etc/report/credentials",
    "--target=gofmt"
  ],
  "container_name": "test",
  "process_log": "/logs/process-log.txt",
  "marker_file": "/logs/marker-file.txt",
  "metadata_file": "/logs/artifacts/metadata.json"
}
{{< / highlight >}}

The definition above is the result of a typical automatically generated Prow job
which executes `ci-operator`.  Recognizable here are the `timeout` and
`grace_period` values (4h and 1h respectively, in nanoseconds) and the
`commands`.  The expected hierarchy can be seen at runtime in the container:

{{< highlight console >}}
$ # pid, ppid, comm
$ # the ci-operator image doesn't currently have ps (but has awk…)
$ awk '{print $1,$4,$2}' /proc/[0-9]*/stat
1 0 (entrypoint)
13 1 (ci-operator)
{{< / highlight >}}

Interruptions in the context of `entrypoint` can happen in two cases:

- Internally, in case of a timeout (based on the `timeout` option).  A `SIGINT`
  is delivered to the child process; if it does not terminate within the
  configured `grace_period`, a `SIGKILL` is delivered and execution ends.
- Externally, in case of an interruption from Kubernetes (abortion, deletion,
  etc.).  `entrypoint` is the process which receives the signals, since it is
  PID 1.  A similar process as in the previous item occurs, except the received
  signal is also delivered to the child following the initial `SIGINT`.

In all cases, `entrypoint` will mark the child process as finished so that its
logs and artifacts can be uploaded (see the [artifacts][artifacts]
documentation).  This is controlled by the other options in its configuration,
as described in the next section.

## `sidecar`

`entrypoint` is singularly responsible for monitoring the test process.
[`sidecar`][sidecar], another container added in a similar manner to the `Pod`,
handles the processing and submission of the various artifacts which can be seen
in the job result pages.  All the other options in the `entrypoint`
configuration shown above control the interaction between these two processes.
They are mirrored in `sidecar`'s own configuration variable:

{{< highlight "yaml" >}}
# pod_spec.containers[1].env[]|select(.name=="SIDECAR_OPTIONS").value
{
  "gcs_options": {
    "items": [
      "/logs/artifacts"
    ],
    "bucket": "origin-ci-test",
    "path_strategy": "single",
    "default_org": "openshift",
    "default_repo": "origin",
    "mediaTypes": {
      "log": "text/plain"
    },
    "gcs_credentials_file": "/secrets/gcs/service-account.json",
    "dry_run": false
  },
  "entries": [
    {
      "args": [
        "ci-operator",
        "--gcs-upload-secret=/secrets/gcs/service-account.json",
        "--image-import-pull-secret=/etc/pull-secret/.dockerconfigjson",
        "--report-credentials-file=/etc/report/credentials",
        "--target=gofmt"
      ],
      "container_name": "test",
      "process_log": "/logs/process-log.txt",
      "marker_file": "/logs/marker-file.txt",
      "metadata_file": "/logs/artifacts/metadata.json"
    }
  ],
  "censoring_options": {
    "secret_directories": [
      "/etc/pull-secret",
      "/etc/report"
    ]
  }
}
{{< / highlight >}}

`marker_file` makes the connection between these two processes.  It is created
by `entrypoint` when the test process it is monitoring finishes (normally or
abnormally).  This signals `sidecar` to start uploading its artifacts.

Relevant to this document is the fact that `sidecar` has two modes, depending on
whether it is configured to ignore interrupts or not (`ignore_interrupts` in
`SIDECAR_OPTIONS`):

- In `ci-operator` step `Pod`s, this option is set, meaning no actions are taken
  when interruption signals arrive.  This mode relies solely on the marker file
  and assumes the test process terminates correctly.  Otherwise, artifacts are
  lost.

- In Prow job `Pod`s, this option is not set, meaning signals are processed
  normally.  Since all containers are signaled on interruption, `sidecar` will
  begin uploading artifacts immediately, while `entrypoint` is signaling the
  test process to terminate.

  This process is inherently unsafe, since it can happen in parallel with the
  actual upload if the child later terminates correctly, but it guarantees some
  artifacts are uploaded, rather than risking that none be.

## `entrypoint-wrapper`

In the specific case of `ci-operator` [multi-stage]({{< ref
"/architecture/step-registry" >}}) step `Pod`s, an additional process is
added: [`entrypoint-wrapper`][entrypoint_wrapper].  This is a downstream
component which, as the name indicates, acts as the parent process of
`entrypoint`, and implements the processes specific to this type of test.

{{< highlight console >}}
$ awk '{print$1,$4,$2}' /proc/[0-9]*/stat
1 0 (entrypoint-wrap)
22 1 (entrypoint)
30 22 (bash)
{{< / highlight >}}

This component is mentioned only for completeness: because it indiscriminately
forwards termination signals (`INT` and `TERM`) to its child process (i.e.
`entrypoint`) without further processing whenever they are received, it has no
effect on the protocol for handling interruptions.

[artifacts]: {{< ref "artifacts" >}}
[ci_tools]: https://github.com/openshift/ci-tools.git
[entrypoint]: https://github.com/kubernetes-sigs/prow/tree/main/cmd/entrypoint
[entrypoint_wrapper]: https://github.com/openshift/ci-tools/tree/master/cmd/entrypoint-wrapper
[sidecar]: https://github.com/kubernetes-sigs/prow/tree/main/cmd/sidecar
[prow]: https://github.com/kubernetes-sigs/prow.git
[user_documentation]: {{< ref "/architecture/timeouts" >}}
