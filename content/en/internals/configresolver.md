---
title: "Config Resolver"
description: A description of the `ci-operator-configresolver` service.
---

[`ci-operator-configresolver`](https://github.com/openshift/ci-tools/tree/master/cmd/ci-operator-configresolver)
(abbreviated as `configresolver` in this document) is a web server which
provides configuration files as input for `ci-operator` processes executed by CI
jobs.

It is [currently deployed](https://github.com/openshift/release/tree/master/clusters/app.ci/ci-operator-configresolver)
in the `ci` namespace of the `app.ci` cluster and serves requests based on its
own view of the latest version of files from the following directories in
`openshift/release`:

- [`ci-operator/config`](https://github.com/openshift/release/tree/master/ci-operator/config):
  the configuration files for each repository, specifying image builds, tests,
  etc.
- [`ci-operator/step-registry`](https://github.com/openshift/release/tree/master/ci-operator/step-registry):
  shared test definitions used by the more complex ([multi-stage]({{< ref
  "/architecture/step-registry" >}})) tests.

Its main purpose is so that Prow jobs executing `ci-operator` do not need to
mount the configuration files themselves.  A `ci-operator` process can simply
make a request to the server to get the current test configuration for a given
repository in a form that is readily processable:

{{< highlight bash >}}
$ curl -sS 'https://config.ci.openshift.org/config?org=openshift&repo=ci-tools&branch=master' | head -n 7
{
  "zz_generated_metadata": {
    "org": "openshift",
    "repo": "ci-tools",
    "branch": "master"
  },
  "base_images": {
{{< / highlight >}}

This is the default mode of `ci-operator` if no explicit input is given, as can
be seen in the output log:

{{< highlight bash >}}
$ export JOB_SPEC='…'
$ ci-operator |& head -n 2
INFO[2022-03-08T14:20:18Z] unset version 0
INFO[2022-03-08T14:20:18Z] Loading configuration from https://config.ci.openshift.org for openshift/ci-tools@master
{{< / highlight >}}

The request is based on the information in `JOB_SPEC`, which is a JSON object
containing information about the event that triggered the job (e.g. a pull
request) and is normally supplied by Prow at runtime, as described in the
[documentation](https://docs.prow.k8s.io/jobs#job-environment-variables).
The mapping from the log output to the URL requested is trivial, but also
displayed in the debug log:

{{< highlight bash >}}
2022/03/08 14:20:18 [DEBUG] GET https://config.ci.openshift.org/config?branch=master&org=openshift&repo=ci-tools
{{< / highlight >}}

The configuration file contained in the response is not exactly the same as the
one contained in the `openshift/release` repository.  It goes through a process
called _configuration resolution_ (one of the reasons for the name of the
service), where multi-stage tests are expanded such that the shared definitions
in the step registry are incorporated to form the complete test definition
ultimately used by `ci-operator`.

In addition to `/config`, two other specialized endpoints are provided:

- `/resolve` is used when `ci-operator` receives an unresolved configuration as
  input, either via the `UNRESOLVED_CONFIG` environment variable or the
  `--unresolved-config` parameter.  In this case, the input configuration is
  `POST`ed instead of read from the `configresolver` cache, but configuration
  resolution occurs normally and the resolved configuration is sent back to the
  client.
- `/configWithInjectedTest` is used in the implementation of
  [payload testing]({{< ref "/release-oversight/payload-testing" >}}).  It
  receives as input the names of a target `ci-operator` configuration and a
  source configuration/test pair and returns the target configuration with all
  the modifications required for it to execute the specified test.

## Step registry UI

A secondary function of the `configresolver` program is to serve the web
interface at https://steps.ci.openshift.org, which contains:

- Lists of all registry components with pages detailing each:
  - https://steps.ci.openshift.org#workflows
  - https://steps.ci.openshift.org#chains
  - https://steps.ci.openshift.org#steps
- A list of all jobs and the components which they use:
  - https://steps.ci.openshift.org/search
- A reference of all fields in the `ci-operator` configuration file:
  - https://steps.ci.openshift.org/ci-operator-reference

## Volume

[Currently](https://github.com/openshift/release/tree/master/clusters/app.ci/ci-operator-configresolver),
the contents of the `openshift/release` repository are provided to the
`configresolver` instances via a local `git-sync` container.  The process by
which the content that is served is updated is:

0. A pull request is merged in `openshift/release`.
1. [`git-sync`]({{< ref "/internals/configuration-updates#git-sync" >}})
   performs its update cycle, notices the new revision, and updates the local
   clone and the symlink to it.
1. The `configresolver` [monitors changes](https://github.com/openshift/ci-tools/blob/master/pkg/load/agents/)
   to the volume mount directories using
   [`inotify(7)`](https://www.man7.org/linux/man-pages/man7/inotify.7.html).
2. The change event from the agent triggers a configuration reload, which reads
   the new contents of the files.
3. New requests will now serve the new contents.

Note that, as described, this setup suffers from all the issues identified in
the [configuration updates]({{< relref "configuration-updates" >}}) section.  In
addition, because two independent configuration agents are involved (one for
the `ci-operator` configuration, another for the step registry), the
configuration reload is ultimately not atomic, even though the file system
update is.
