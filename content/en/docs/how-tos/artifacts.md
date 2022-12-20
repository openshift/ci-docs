---
title: "Viewing job artifacts"
description: How to investigate the execution and outcome of a CI job using the artifacts directory.
---

Every Prow job executed by the CI system generates an artifacts directory
containing information about that execution and its results.  This document
describes the contents of this directory and how they can be used to investigate
the steps by the job.

{{< alert title="Info" color="info" >}}
The subjects explored here are documented, if somewhat superficially, in the
following files in the `kubernetes/test-infra` repository, in reverse order of
usefulness to the casual Prow user:

- ["Life of a Prow Job"](https://github.com/kubernetes/test-infra/blob/master/prow/life_of_a_prow_job.md)
- ["Understanding Started.json and Finished.json"](https://github.com/kubernetes/test-infra/blob/master/prow/metadata_artifacts.md)
- ["Pod Utilities"](https://github.com/kubernetes/test-infra/blob/master/prow/pod-utilities.md)
{{< / alert >}}

The job examined will be a simple unit test from the `openshfit/ci-tools`
repository, which is executed as a pre-submit job.  While each test has complete
control over the contents of its artifacts, that is only a subdirectory of the
final, root artifacts directory, and the overall structure of the latter does
not vary significantly between jobs.

When a job is triggered in a [pull request](https://github.com/openshift/ci-tools/pull/2877),
the [status](https://github.com/openshift/ci-tools/pull/2877#event-6849176188)
of checks at the bottom of the page will contain a link to the
[job details page](https://prow.ci.openshift.org/view/gs/origin-ci-test/pr-logs/pull/openshift_ci-tools/2877/pull-ci-openshift-ci-tools-master-unit/1539279980293263360).
The pages for post-submit and periodic jobs can be found via the main `deck`
[page](https://prow.ci.openshift.org/).  These pages will be familiar to CI
users: they contain the most important information about the execution, such as
start time, result, duration, JUnit output, log, etc.

The top and bottom of the page have various links to other pages which contain
auxiliary information.  The sequence of links at the top depends on the type of
job, but for most of them it is:

- Job history: a list of all executions of the job across all pull requests, in
  reverse chronological order.  This page can be used to determine the overall
  condition of the job: whether other recent executions passed or fail.  For
  jobs added recently, it can also be useful for telling whether the job has
  _ever_ succeeded.

- Prow Job YAML: the `ProwJob` object created to execute the job.  This page can
  be used to determine whether the expected version of the job was executed and
  to quickly inspect the parameters of the job, such as target cluster,
  timeouts, etc.  This information is also available in `prowjob.json` in the
  artifacts directory.

  This `ProwJob` is a runtime version of the content in
  [`ci-operator/jobs`](https://github.com/openshift/release/tree/master/ci-operator/jobs)
  in the [`openshift/release`](https://github.com/openshift/release.git)
  repository, which in turn is usually [automatically generated]({{< ref
  "docs/how-tos/contributing-openshift-release" >}}) by `ci-operator-prowgen`
  based on the `ci-operator` configuration in
  [`ci-operator/config`](https://github.com/openshift/release/tree/master/ci-operator/config)
  in the same repository.

  Note that for `ci-operator` jobs, this and all references to "pod" in this
  section refer to the pod which executes `ci-operator` itself, not the one
  which executes the actual test (described [below]({{< ref
  "#ci-operator-artifacts" >}})).

- PR / PR History: a link to the original pull request and to a grid displaying
  all job executions for that pull request.  The history page can be used to
  determine whether other executions of the job or other jobs for that PR
  succeeded, i.e.  whether a failure is particular to a job or a general failure
  of the pull request.

- Artifacts: a link to the directory which contains all output files created by
  the job.  This page is described [below]({{< ref "#artifacts" >}}).

The middle of the page contains the main build log.  Particular error patterns
are highlighted and the full output is initially folded so that only relevant
parts are displayed.  For `ci-operator` jobs, this section contains the log
messages of level `info` and above from its output, described [below]({{< ref
"#ci-operator-artifacts" >}}).  The "raw build-log.txt" link contains the same
text, but served as a regular text file, and is also available as
`build-log.txt` in the artifacts directory.

In the case of the example job, the `build-log.txt` was as follows (parts of it
will be used in examples in this and the next sections).

{{< highlight bash >}}
INFO[2022-06-21T16:12:42Z] ci-operator version v20220617-3280eb53d
INFO[2022-06-21T16:12:42Z] Loading configuration from https://config.ci.openshift.org for openshift/ci-tools@master
INFO[2022-06-21T16:12:42Z] Resolved source https://github.com/openshift/ci-tools to master@3280eb53, merging: #2877 92d493ad @hongkailiu
INFO[2022-06-21T16:12:42Z] Using namespace https://console-openshift-console.apps.build04.34d2.p2.openshiftapps.com/k8s/cluster/projects/ci-op-qmyrhiml
INFO[2022-06-21T16:12:42Z] Running [input:root], src, unit
INFO[2022-06-21T16:12:42Z] Tagging build-cache/openshift-ci-tools:master into pipeline:root.
INFO[2022-06-21T16:12:42Z] Building src
INFO[2022-06-21T16:16:42Z] Build src succeeded after 4m4s
INFO[2022-06-21T16:16:42Z] Executing test unit
INFO[2022-06-21T16:29:43Z] Ran for 17m0s
INFO[2022-06-21T16:29:43Z] Reporting job state 'succeeded'
{{< / highlight >}}

The bottom row of links/buttons can be used to display more information about
the job:

- Pod: a summary of the main fields of the `Pod` generated from the `ProwJob` in
  the "Prow Job YAML" page, such as the start time and build node.

- Volumes: the collection of volumes added to the test pod by Kubernetes,
  OpenShift, Prow, and `ci-operator-prowgen`.

- Events: `Event` objects associated with the test pod.  Useful in cases where
  the scheduling of the pod is delayed or impossible, volumes cannot be mounted,
  etc.  This information is also available in the `podinfo.json` file in the
  artifacts directory.

- Containers: not a single section, but one for each container in the test pod,
  with basic information such as the image used and the exit status.  This list
  varies depending on the job, but common sections are:

  - `clonerefs`: the program used to clone repository code.  If it is present
    here, it likely indicates the code is necessary for the execution of
    `ci-operator` itself, such as when part of its configuration is placed
    there.

  - `initupload`: this is an _init_ container which signals that the job has
    successfully started and uploads some of the files which compose the result
    page and artifacts.

  - `place-entrypoint`: an _init_ container used in the implementation of job
    execution, rarely interesting for job authors.

  - `test`: the actual test container, whose output is shown in the "build log"
    section.  Somewhat surprisingly, the entry point program is not the one in
    the `ProwJob` definition, but a program called `entrypoint`, executed from a
    shared volume populated by the previous container.

    This section decodes the `entrypoint` configuration and displays the test
    command which was executed, along with other information such as the timeout
    and grace periods.

  - `sidecar`: this container is executed in parallel with the main test and
    uploads information about the execution to the artifacts directory.

- YAML: this is a dump of the full `Pod` object as YAML.  This information is
  also available in the `podinfo.json` file in the artifacts directory.

## Artifacts

The "artifacts" link in the job result page leads to a page containing every
file uploaded by that job.  These files can provide more detailed information
when the main job page is insufficient.  The general structure of this directory
is:

{{< highlight bash >}}
.
├── artifacts
│   ├── build-logs
│   │   ├── …
│   │   └── src.log
│   ├── build-resources
│   │   ├── builds.json
│   │   ├── events.json
│   │   ├── imagestreams.json
│   │   ├── pods.json
│   │   └── templateinstances.json
│   ├── test
│   │   ├── artifacts
│   │   │   ├── …
│   │   │   └── junit.xml
│   │   ├── build-log.txt
│   │   ├── finished.json
│   │   └── sidecar-logs.json
│   ├── ci-operator-step-graph.json
│   ├── ci-operator.log
│   ├── junit_operator.xml
│   └── metadata.json
├── build-log.txt
├── clone-log.txt
├── clone-records.json
├── finished.json
├── podinfo.json
├── prowjob.json
├── sidecar-logs.json
└── started.json
{{< / highlight >}}

- `artifacts/`: the `ci-operator` artifacts, described [below]({{< ref
  "#ci-operator-artifacts" >}}).

- `build-log.txt`: the build log as a text file, which also appears in the
  "build log" section of the main page.

- `clone-log.txt`: if the Prow job itself clones the repository under test, this
  file will contain the main `clonerefs` output.  It corresponds to the
  `clonerefs` section at the bottom of the main page.

- `clone-records.json`: same as the previous item, but the raw output in JSON
  format.

- `finished.json`: the file uploaded by the either the `initupload` or `sidecar`
  containers when the test finishes.

- `podinfo.json`: a dump of the `Pod` and `Event` objects associated with the
  test, also found in the "Pod" and "Events" sections of the main page.

- `prowjob.json`: a dump of the `ProwJob` object, also found in the "Prow Job
  YAML" link in the main page.

- `sidecar-logs.json`: output of the `sidecar` container, which is responsible
  for uploading the files in this directory.  It corresponds to the `sidecar`
  section at the bottom of the main page.

- `started.json`: file uploaded by the `initupload` _init_ container when the
  test starts.

### `ci-operator` Artifacts

A test executed by `ci-operator` will also have a directory called `artifacts`
among the files described in the previous section.  This is the first directory
in the previous listing and has the following contents:

{{< highlight bash >}}
.
├── build-logs
│   ├── …
│   └── src.log
├── build-resources
│   ├── builds.json
│   ├── events.json
│   ├── imagestreams.json
│   ├── pods.json
│   └── templateinstances.json
├── test
│   ├── artifacts
│   │   ├── …
│   │   └── junit.xml
│   ├── build-log.txt
│   ├── finished.json
│   └── sidecar-logs.json
├── ci-operator-step-graph.json
├── ci-operator.log
├── junit_operator.xml
└── metadata.json
{{< / highlight >}}

The files immediately under the directory are not commonly useful to test
authors, they are mostly meant for test platform engineers:

- `ci-operator-step-graph.json`: this is a dump of every Kubernetes/OpenShift
  object created by each step.

- `ci-operator.log`: the `ci-operator` debug output.  It is a superset of
  `build-log.txt`, in JSON format.  It can sometimes contain extra information
  useful for understanding the main log.

- `junit_operator.xml`: the source of the JUnit section in the main page.

- `metadata.json`: data file consumed by
  [`testgrid`](https://github.com/kubernetes/test-infra/tree/master/testgrid).

{{< alert title="Info" color="info" >}}
"Step" in this context refers to [`ci-operator` steps]({{< ref
"docs/architecture/ci-operator-internals/steps" >}}), not steps of a
[multi-stage test]({{< ref "docs/architecture/step-registry#step" >}}) &mdash;
the latter being a type of the former.

`ci-operator-step-graph.json` therefore contains image import / build steps,
test steps, etc.  This corresponds to the line which starts with "Running" in
the `ci-operator` output.  `[input:root]`, `src`, and `unit` are the steps in
the example job, which respectively import a base image, build the `src` image,
and execute the `unit` test.
{{< / alert >}}

The directories at the top level contain detailed information for objects
created by the `ci-operator` test:

- `build-logs`: this directory contains one file for each OpenShift build
  created by the test containing the full log of the build.  `ci-operator` will
  include these logs in its output in case of failure, but they are available
  here directly as text files for all builds, even successful ones.

- `build-resources`: this directory contains dumps of objects in the test
  namespace at the time the test finished, as listed below.  Each file is named
  after the type of object dumped.  Note that, since the test namespace can be
  and is commonly [shared by many tests]({{< ref
  "docs/how-tos/interact-with-running-jobs#how-and-where-do-the-tests-run" >}}),
  these dumps may contain objects which the test did not itself create.

  These files are useful to determine if the `Build`, `Pod`, etc. objects were
  created as expected by `ci-operator` based on the image, test, etc. entries in
  the configuration file, as well as verifying that the expected versions of
  images were correctly imported and/or exported.

  - `builds.json`
  - `events.json`
  - `imagestreams.json`
  - `pods.json`
  - `templateinstances.json`

- `test`: the name and contents of this directory varies based on the type of
  test.  For container tests, the name will be simply `test`.  For template and
  multi-stage tests, it will be the name of the test.  This directory is also
  created by a `sidecar` program &mdash; this time attached to the test
  container, not `ci-operator` &mdash; so it resembles the top-level artifacts
  directory.  `build-log.txt`, `finished.json`, and `sidecar-logs.json` have the
  same meaning.

  The `artifacts` directory contains all files written to the `$ARTIFACT_DIR`
  directory by the test program.  For [multi-stage]({{< ref
  "docs/architecture/step-registry" >}}) tests, a separate directory underneath
  this one will exist for each step.

## Practical tips

Here are some problems which can be commonly answered by the files described in
this page.

### Problems cloning repository code

This can happen in two situations: when `ci-operator` itself is executed and
when it creates the `src` image.  In both cases, this is done by the `clonerefs`
program.  For the first, the complete logs can be found in `clone-log.txt` and
`clone-records.json` at the root; for the latter, in
`artifacts/build-logs/src.log`.

### Test pod has not started

The immediate place to look is the "events" section at the bottom of the page,
which has all `Event` objects associated with the test pod.  The "Pod",
"Volumes", and "YAML" adjacent sections and the "Prow Job YAML" also provide
information about the generated pod.

Ultimately, for pull request jobs, the author has admin access to the test
namespace and can inspect all objects in it.  Obviously, at least one test has
to successfully start in order for the test namespace name to be determined.

### Test aborted due to timeout period

For the `ci-operator` pod, see the previous section.  In addition, the
`artifacts/build-resources/pods.json` (or perhaps the other files in the same
directory) has information about the individual test pods created by
`ci-operator`.

### Build not generated as expected

A dump of all `Build` objects created by `ci-operator` are written to
`artifacts/build-resources/builds.json`, and all logs are written to
`artifacts/build-logs`.

### Incorrect credentials / parameters / dependencies

Credentials are mounted using `Secret` mounts, while both parameters and
dependencies are passed to test containers as environment variables, so
`artifacts/build-resources/pods.json` contains exactly which values were
mounted/passed to each container.
