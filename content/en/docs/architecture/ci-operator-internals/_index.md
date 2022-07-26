---
title: "CI Operator Internals"
description: A detailed view of some aspects of the ci-operator implementation, intended for developers working on its source code.
---

This section describes in detail some aspects of the implementation of
`ci-operator` and associated programs, with the intent of serving as an
auxiliary guide for developers working with the
[`openshift/ci-tools`](https://github.com/openshift/ci-tools.git) repository.

`ci-operator` has a number of foundational principles:

- don't do work twice
- do the least amount of work needed
- hide complexity from the end user

To achieve this, `ci-operator` requires configuration to understand the build
process for each component as well as every output container image.  This
document overviews the workflow that `ci-operator` uses to build components and
structure tests.

Every invocation of `ci-operator` creates a workspace to isolate test execution,
seed it with build inputs and the published component images from the OpenShift
release if the component under test is a part of one, then schedule test
workflows as Kubernetes and OpenShift objects.

# Execution graph

`ci-operator` is at its core a task scheduling program. The input configuration
is processed and used to build a task graph, which is then executed until
completion, failure, or interruption. Thus, the execution flow of `ci-operator`
can be divided in these major phases:

1. input processing
2. task graph creation
3. task graph execution
4. cleanup

In the code base, these phases correspond to the following modules in the
[`pkg`](https://github.com/openshift/ci-tools/tree/master/pkg) directory:

- [`api`](https://github.com/openshift/ci-tools/tree/master/pkg/api):
  Go types used by all phases
- [`load`](https://github.com/openshift/ci-tools/tree/master/pkg/load):
  I/O operations for types
- [`registry`](https://github.com/openshift/ci-tools/tree/master/pkg/registry):
  configuration resolution using the step registry
- [`config`](https://github.com/openshift/ci-tools/tree/master/pkg/config):
  input configuration processing
- [`validation`](https://github.com/openshift/ci-tools/tree/master/pkg/validation):
  input configuration validation
- [`defaults`](https://github.com/openshift/ci-tools/tree/master/pkg/defaults):
  mapping from inputs to tasks
- [`steps`](https://github.com/openshift/ci-tools/tree/master/pkg/steps):
  definitions for each task type, task execution

# Input Resolution

To avoid repeating work, `ci-operator` needs to determine when work can be
re-used.  The tool identifies a build of any specific job with a hash of:

 - job metadata (refs to test, clone configuration)
 - configuration (YAML configuration for refs under test)
 - other inputs (levels of input tagged images)

With such an identifier, `ci-operator` can determine if two builds are using the
same configuration on the same inputs and can therefore re-use common work.
This identifier is used to create the Kubernetes `Namespace` in which the test
workloads will run and is furthermore available to tests via the `NAMESPACE`
environment variable.

Input resolution can be identified in the `ci-operator` output by all of the
steps that precede the creation of the test `Namespace`:

```
INFO[2022-07-11T17:03:22Z] ci-operator version v20220708-ca6de370c
INFO[2022-07-11T17:03:22Z] Loading configuration from https://config.ci.openshift.org for openshift/ci-tools@master
INFO[2022-07-11T17:03:22Z] Resolved source https://github.com/openshift/ci-tools to master@ca6de370, merging: #2883 3530bc01 @smg247
INFO[2022-07-11T17:03:23Z] Using namespace https://console-openshift-console.apps.build04.34d2.p2.openshiftapps.com/k8s/cluster/projects/ci-op-022dqmlr
```

Most log messages during input resolution have debug priority, so the log file
is more informative in this case:

```
{"level":"info","msg":"ci-operator version v20220708-ca6de370c","time":"2022-07-11T17:03:22Z"}
{"level":"info","msg":"Loading configuration from https://config.ci.openshift.org for openshift/ci-tools@master","time":"2022-07-11T17:03:22Z"}
{"level":"debug","msg":"performing request method GET url https://config.ci.openshift.org/config?branch=master&org=openshift&repo=ci-tools","time":"2022-07-11T17:03:22Z"}
{"level":"info","msg":"Resolved source https://github.com/openshift/ci-tools to master@ca6de370, merging: #2883 3530bc01 @smg247","time":"2022-07-11T17:03:22Z"}
{"level":"debug","msg":"Determining if build cache build-cache/openshift-ci-tools:master can be used in place of root ci/ci-tools-build-root:1.18","time":"2022-07-11T17:03:22Z"}
{"level":"debug","msg":"Resolved build cache build-cache/openshift-ci-tools:master to sha256:de666c2027b84ff2b1ca1a4cafb08959aadcd5e8ba9e6a40c2767bbda87d1599","time":"2022-07-11T17:03:22Z"}
{"level":"debug","msg":"Build cache build-cache/openshift-ci-tools:master is based on root image at sha256:f8c36a557d17e88976fea1349279a656e546b299d034e985b4ae43309003153d","time":"2022-07-11T17:03:22Z"}
{"level":"debug","msg":"Resolved root image ci/ci-tools-build-root:1.18 to sha256:f8c36a557d17e88976fea1349279a656e546b299d034e985b4ae43309003153d","time":"2022-07-11T17:03:22Z"}
{"level":"debug","msg":"Using build cache build-cache/openshift-ci-tools:master as root image.","time":"2022-07-11T17:03:22Z"}
{"level":"debug","msg":"Resolved build-cache/openshift-ci-tools:master (root) to sha256:de666c2027b84ff2b1ca1a4cafb08959aadcd5e8ba9e6a40c2767bbda87d1599.","time":"2022-07-11T17:03:22Z"}
{"level":"debug","msg":"Resolved origin/centos:stream8 (base_image: os) to sha256:ad7d81f622a590e73c34ec20b4ae6a0ff162b1e7306d121d3d634949bfae6b45.","time":"2022-07-11T17:03:22Z"}
{"level":"debug","msg":"Resolved ocp/4.10:cli (base_image: cli) to sha256:954f2ea4c53cfdc6b439ba691180b6a3fcba64cc7d71d49bf81f269066fe4af6.","time":"2022-07-11T17:03:22Z"}
{"level":"debug","msg":"Resolved ci/golangci-lint:v1.45.2 (base_image: golangci-lint) to sha256:50d12acf8ef7c41545ae8e1fe14cfc22e690baca7d2bb41d40da8feb8a78cabe.","time":"2022-07-11T17:03:23Z"}
{"level":"trace","msg":"Using binary as hash: /usr/bin/ci-operator 1657322166 69194954","time":"2022-07-11T17:03:23Z"}
{"level":"info","msg":"Using namespace https://console-openshift-console.apps.build04.34d2.p2.openshiftapps.com/k8s/cluster/projects/ci-op-022dqmlr","time":"2022-07-11T17:03:23Z"}
```

# Namespace Initialization

The hash created from input resolution is used to create a `Namespace` as an
isolated workspace for the test; the `Namespace` is subsequently initialized for
use by the test workloads.

All input images for the tests that are described in the configuration YAML are
tagged in, as are all images that form the larger release that the test is a
part of.  Images that are used for the build graph, like those identified with
the `base_images`, `base_rpm_images`, and `build_root` stanzas, have
`ImageStreamTag`s created for them in the `pipeline` `ImageStream` in the test
`Namespace`.  Images that are part of the release that the test exists within,
as specified with the optional `releases` stanza, are mirrored to
`ImageStreamTag`s in the `stable` `ImageStream` within the test `Namespace`.

In order to ensure that resources from tests do not leak on the cluster the
tests are executed on, both hard and soft TTLs are set on the `Namespace` and
the [`ci-ns-ttl-controller`](https://github.com/openshift/ci-ns-ttl-controller)
is used to enforce the TTLs and reap namespaces when TTLs have expired.  Both a
hard and a soft TTL are set on the namespaces; the hard TTL ([`cleanupDuration`,
currently 12 hours][cleanupDuration]) describes how much time can pass after
the creation of the `Namespace` before it is reaped, the soft TTL
([`idleCleanupDuration`, currently 1 hour][idleCleanupDuration]) describes how
much time can pass without any active `Pod`s in the `Namespace` before it is
reaped.  Whichever TTL is reached first triggers reaping.

# Build Graph Traversal

A configuration file for `ci-operator` defines build steps, test targets and
output images for a component `git` repository.  A graph of build dependencies
is built from this configuration in order to determine what concrete actions
need to occur for any specific target.  Each invocation of `ci-operator`
specifies one or more `--target`s to execute; for each target, the build graph
is traversed to execute dependent steps first.

The `ci-operator` configuration file creates some implicit build steps:

| Output `ImageStreamTag` | Action |
| ----------------------- | ------ |
| `pipeline:src`          | clones the refs under test |
| `pipeline:bin`          | runs the `binary_build_commands` |
| `pipeline:test-bin`     | runs the `test_binary_build_commands` |
| `pipeline:rpms`         | runs the `rpm_build_commands` |

Container image builds -- whether from the implicit `pipeline` steps above or
from explicit image build configurations in the `images` stanza, are executed
using OpenShift `Build`s.  Test targets in the `tests` stanza are executed using
Kubernetes `Pod`s.  As all of the test workflow execution objects are created in
a `Namespace` shared for all jobs with the same input, re-use is achieved by
deterministic naming.  For instance, the `src` `Build` that creates the
`pipeline:src` `ImageStreamTag` will be created only once in a given
`Namespace`; other builds of jobs that require this build step will see the
`Build` running and wait for it to complete or see the `ImageStreamTag` existing
and consider the build step finished.

[cleanupDuration]: https://github.com/openshift/ci-tools/blame/5e86bf61fc54d27f2dc58a50367a5fe2a05ab369/cmd/ci-operator/main.go#L421
[idleCleanupDuration]: https://github.com/openshift/ci-tools/blame/5e86bf61fc54d27f2dc58a50367a5fe2a05ab369/cmd/ci-operator/main.go#L420
