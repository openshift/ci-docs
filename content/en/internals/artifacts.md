---
title: Artifact gathering in Prow job and `ci-operator` tests
description: >
  A description of the components and processes responsible for uploading test
  results and artifacts to long-term storage.
---

## Components

Artifact collection is based on components from the [`prow`][prow]
repository.  These coordinating components are collectively know as
[`pod-utilities`][pod_utils] and  augment the `pod_spec` declared in a `ProwJob`
to add functionality such as [timeouts][timeouts], output censoring, execution
synchronization, and, of course, artifact gathering.

In OpenShift CI jobs, this process is done at two levels using the same
components: for the Prow job (independently of what it executes) and for
individual `ci-operator` steps inside a job.  The latter become subdirectories
of the artifacts directory of the former.

## `entrypoint`

[`entrypoint`][entrypoint] is a small program which acts as the parent process
of the command configured in the `pod_spec` of the `ProwJob`.  It redirects the
child process output to a file so it can be collected, generates a signal when
that process finishes so that artifact gathering and upload can begin, among
other functions.  It is configured via the `ENTRYPOINT_OPTIONS` environment
variable, as can be seen in the `ProwJob` object:

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

- `artifact_dir` is the path where the artifacts directory is created so that
  the test can place files in it.
- `process_log` is the file to which the output of the child process is
  redirected.
- `marker_file` is be created at the end of the execution to signal that the
  test has finished.

## `sidecar`

[`sidecar`][sidecar] is the component responsible for gathering and uploading
artifacts to Google Cloud Storage (GCS).  It is added as a secondary container
to the one declared in the `pod_spec` and so will be executed in parallel with
it.  The signal emitted by `entrypoint` when the test finishes (in most cases,
see the [timeout][timeouts] documentation) will cause it to being its work.  It
is controlled by a special environment variable `SIDECAR_OPTIONS`, which can be
seen in the `ProwJob` object:

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

- `gcs_options` control how and where in GCS files are placed.  The final paths
  are determined by these options and the Prow job's `JOB_SPEC`.

  - Files from a periodic or post-submit job called `$name` with build ID
    `$build_id` can be listed with:

    {{< highlight console >}}
$ gsutil ls gs://$bucket/logs/$name/$build_id/artifacts/
    {{< / highlight >}}
  - Files from a pre-submit job for pull request `$pull` in repository
    `$org/$repo` can be listed with:

    {{< highlight console >}}
$ gsutil ls gs://$bucket/pr-logs/pull/$org_$repo/$pull/$name/$build_id/artifacts/
    {{< / highlight >}}

- `entries` contains information about test processes to wait for and collect
  data from.  These correspond to the `entrypoint` options.

- `censoring_options` controls the censoring of artifacts prior to the upload
  based on the content of secrets mounted into the `Pod`.

## Testing

When executing `ci-operator` locally, most of the time artifacts are not
necessary.  If that is the case, simply not including a `gcs_credentials_secret`
(usually set to `gce-sa-credentials-gcs-publisher`) in the `JOB_SPEC` will allow
tests to be executed.  The `sidecar` container will fail to upload artifacts,
but that is not considered an error by `ci-operator`.  Alternatively, creating
an empty `Secret` object in the test namespace (either directly or via
`ci-operator`'s `--secret-dir` argument) will cause `sidecar` to fail
immediately and not even attempt to gather or upload artifacts.

For some test setups, artifact gathering is required, and `ci-operator` does not
currently provide a way to disable it.  In order to executed tests locally, the
test namespace needs to contain valid GCS credentials.  In this case, or if
artifacts actually need to be inspected, the `Secret` can be copied from one of
the build clusters:

{{< highlight console >}}
$ secret=$(oc --namespace ci extract --to - secret/gce-sa-credentials-gcs-publisher)
$ oc create secret generic gce-sa-credentials-gcs-publisher --from-literal service-account.json="$secret"
{{< / highlight >}}

The `Secret` name is determined by `decoration_config.gcs_credentials_secret` in
the `JOB_SPEC`.  Note that this setup has the potential to interfere with actual
job results, since artifacts from local executions will be uploaded to the same
locations as they are.  In case a `JOB_SPEC` with real values is used, these
artifacts can overwrite and/or pollute real job results.  The
`decoration_config.gcs_configuration.path_prefix` field can be used to avoid
this.  The artifacts can be listed with:

{{< highlight console >}}
$ gsutil ls gs://$bucket/$path_prefix/… # …/logs/, …/pr-logs/, etc., as above
{{< / highlight >}}

[entrypoint]: https://github.com/kubernetes-sigs/prow/tree/main/cmd/entrypoint
[pod_utils]: https://github.com/kubernetes-sigs/prow/tree/main/pkg/pod-utils 
[sidecar]: https://github.com/kubernetes-sigs/prow/tree/main/cmd/sidecar
[prow]: https://github.com/kubernetes-sigs/prow.git
[timeouts]: {{< ref "/architecture/timeouts" >}}
