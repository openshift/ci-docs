---
title: "Testing"
description: Executing `ci-operator` outside of CI jobs.
---

This document is primarily intended as a guide for developers of `ci-operator`.
It describes the requirements for local execution, which makes experimentation
and validation much simpler and faster when making changes to the code.  General
familiarity with the concepts described in the [introduction][index] is assumed,
but it is also possible to follow the steps here while consulting the other
reference pages as necessary.  Readers may also find the many
[presentations][presentations] done on this topic useful.

Before that, the question in everyone's mind should be answered: why is it
called `ci-operator`?  This is mostly for historical reasons: it is not actually
a [Kubernetes operator][kubernetes_operators] that acts as controllers of a
custom resource but a regular program that is executed inside a `Pod` and
terminates as soon as it is done processing a single CI job.  There is a
long-term goal of making it honor its name (see [DPTP-32][DPTP-32] --- double
digits!).

## First encounter

The first step is to obtain a copy of the `ci-operator` binary.  The easiest and
quickest method is via the container image
`registry.ci.openshift.org/ci/ci-operator`, used by CI jobs.  It is available
publicly, so no authentication is required (see [this
section][registry_authentication_errors] if you are not able to pull it).
Chances are it will be usable even outside the image, since it is a regular,
statically-linked Go binary:

{{< highlight bash >}}
$ podman run --rm --entrypoint cat registry.ci.openshift.org/ci/ci-operator /usr/bin/ci-operator > ci-operator
$ file ci-operator
ci-operator: ELF 64-bit LSB executable, x86-64, version 1 (SYSV), statically linked, Go BuildID=…, not stripped
{{< / highlight >}}

For developers wanting to make changes to the code, the alternative is to build
it from source.  Development happens in the [`openshift/ci-tools`
repository][ci_tools].  It contains instructions on how to build it, but a
simple `go build ./cmd/ci-operator` should do it.

Once that is done, verify that you can execute the binary (it doesn't need to be
in `$PATH` as shown here):

{{< highlight bash >}}
$ ci-operator --help |& head -n 5
INFO[2022-03-09T16:21:18Z] unset version 0
Orchestrate multi-stage image-based builds

The ci-operator reads a declarative configuration YAML file and executes a set of build
steps on an OpenShift cluster for image-based components. By default, all steps are run,
{{< / highlight >}}

Attempting to execute it without the appropriate setup leads to a failure:

{{< highlight bash >}}
$ ci-operator
INFO[2022-03-09T16:23:09Z] unset version 0
ERRO[2022-03-09T16:23:09Z] Failed to load arguments.                     error=failed to determine job spec: no --git-ref passed and failed to resolve job spec from env: malformed $JOB_SPEC: $JOB_SPEC unset
{{< / highlight >}}

To understand why, a description of the usual environment in which `ci-operator`
is executed is necessary.

{{< alert title="Info" color="info" >}}
Even though it might seem tedious and long-winded, readers are encouraged to
follow this guide sequentially before attempting to execute builds/tests.
`ci-operator`'s interface is optimized for its use in CI jobs and generally
assumes the user knows what he is doing, so jumping ahead and executing commands
can result in surprising and unintended behavior.
{{< / alert >}}

## Prow

`ci-operator`'s natural habitat is the [Prow][prow] job.  That is almost
exclusively the environment where it is executed, and the default interface is
optimized for that usage.  A discussion of the architecture of Prow is outside
the scope of this document; for more information about the topics briefly
discussed in the next sections, see the following upstream documents:

- [ProwJobs][prowjobs]
- [Life of a Prow Job][life_of_a_prow_job]

For our purposes, it is enough to understand that `ci-operator` needs to
determine what source code will be used as the primary input for its execution.
This ultimately takes the form of a `git` repository and one or more
<i>ref</i>s/revisions (see [`gitglossary(7)`][gitglossary] and
[`gitrevisions(7)`][gitrevisions] for the definition of these terms).  In the
context of a CI job, this information is supplied by Prow via the `JOB_SPEC`
variable (as described in [this section][job_env_variables] of the document
linked above).

Two options are available to execute `ci-operator` directly, outside of Prow.
The `--git-ref` argument can be used to pass a string in the format
`org/repo@ref`, which instructs `ci-operator` to [`ls-remote`][git_ls_remote]
the repository to determine the revisions.  It then builds its own `JOB_SPEC`
internally based on that information:

{{< highlight bash >}}
$ ci-operator --git-ref openshift/ci-tools@master |& head -n 2
INFO[2022-03-09T17:01:38Z] unset version 0
INFO[2022-03-09T17:01:39Z] Resolved openshift/ci-tools@master to commit ef415037c6f8942784ee8a15635d5f0ce8a9cfcc
{{< / highlight >}}

The second option is to manufacture a `JOB_SPEC` conforming to the format
dictated by Prow to fit the desired test scenario.  This saves some time when
multiple tests are performed in succession and can also be useful when testing
the processing of this variable or alternative configurations.  `JOB_SPEC` is a
JSON object which can be easily written manually.  For now, even a minimal
definition suffices.  However, code in Prow and `ci-tools` generally assumes a
well-formed definition, so it is best to use real values unless something very
specific is being tested (see the ["artifacts"][artifacts] documentation).  The
following examples assume a definition similar to what the `--git-ref` argument
shown above generates:

{{< highlight bash >}}
export JOB_SPEC='{
  "type": "postsubmit",
  "refs": {
    "org": "openshift",
    "repo": "ci-tools",
    "base_ref": "master",
    "base_sha": "ef415037c6f8942784ee8a15635d5f0ce8a9cfcc"
  },
  "decoration_config": {
    "gcs_configuration": {
      "bucket": "origin-ci-test",
      "path_strategy": "single",
      "default_org": "openshift",
      "default_repo": "origin",
      "mediaTypes": {"log": "text/plain"}
    },
    "utility_images": {
      "clonerefs": "registry.ci.openshift.org/ci/clonerefs:latest",
      "initupload": "registry.ci.openshift.org/ci/initupload:latest",
      "entrypoint": "registry.ci.openshift.org/ci/entrypoint:latest",
      "sidecar": "registry.ci.openshift.org/ci/sidecar:latest"
    }
  }
}'
{{< / highlight >}}

## `ci-operator-configresolver`

In a pattern that will soon become recurrent, attempting to execute
`ci-operator` with this new definition still results in an error, but a
different one:

{{< highlight bash >}}
$ ci-operator
INFO[2022-03-09T17:13:31Z] unset version 0
INFO[2022-03-09T17:13:31Z] Loading configuration from https://config.ci.openshift.org for openshift/ci-tools@master
INFO[2022-03-09T17:13:31Z] Resolved source https://github.com/openshift/ci-tools to master@ef415037
ERRO[2022-03-09T17:13:31Z] Failed to load arguments.                     error=failed to load cluster config: unable to load in-cluster configuration, KUBERNETES_SERVICE_HOST and KUBERNETES_SERVICE_PORT must be defined
{{< / highlight >}}

We will leave it be until a [later section]({{< relref "#test-namespaces" >}})
and focus on the other log line that appeared in the output.  There is now a
`JOB_SPEC` from the exported environment variable, so the <i>ref</i>s in it are
used directly and simply echoed back in a slightly different manner, but the
second line is completely new.

One of the other major `ci-operator` input values is its configuration file.
Since no other information was given, it is derived from the repository
configuration that is now being provided.  This is done with assistance from the
`ci-operator-configresolver` service at `config.ci.openshift.org`, which has its
own [documentation page][configresolver].  For our purposes, it is enough to
know that this is an easy way (both for CI jobs and for users) to obtain the
latest configuration file for a given input in a format that is directly usable
by `ci-operator`.  We will assume that the configuration will come from a local
file instead and will now detail its format.

Before leaving the resolver, we will note that it has secondary responsibilities
beyond serving configuration files.  It also serves
https://steps.ci.openshift.org and, in particular, a [complete
reference][ci_operator_reference] of the fields of the configuration file.
Refer to it as we examine the files in the next sections.

## Initial configuration file

We can start our experimentation with the simplest possible configuration file:

{{< highlight bash >}}
$ ci-operator --config /dev/null
INFO[2022-03-09T17:58:38Z] unset version 0
ERRO[2022-03-09T17:58:38Z] Failed to load arguments.                     error=configuration has 2 errors:

  * you must define at least one test or image build in 'tests' or 'images'
  * 'resources' should be specified to provide resource requests

{{< / highlight >}}

We are told very sternly that what we are doing is nonsense.  A configuration
file that does nothing is not useful, so there are a few required fields that
must be present.  We are eager at this point to see a test running after all
this endless verbiage, so let's try writing a simple test definition using the
format described in the reference:

{{< highlight yaml >}}
# test.yaml
tests:
- as: test
  commands: echo test
  container:
    from: quay.io/fedora/fedora
{{< / highlight >}}

{{< highlight bash >}}
$ ci-operator --config test.yaml
INFO[2022-03-09T18:06:34Z] unset version 0
ERRO[2022-03-09T18:06:34Z] Failed to load arguments.                     error=invalid configuration: 'resources' should be specified to provide resource requests
{{< / highlight >}}

The CI build clusters are heavily used, so it is best to provide resource
definitions to guide the scheduling of test processes, which is done using the
(required) `resources` field.  It is a mapping field whose key is a name and
whose value is a definition of resources required by the test `Pod`, as
[specified by Kubernetes][kubernetes_resources].  A unique entry for the test
can be added under the `test` key (the name of the test), or a generic one can
be added using the special `*` key, which defines a default.

{{< highlight yaml >}}
# test.yaml
tests:
  # as before
resources:
  "*":
    requests:
      cpu: 100m
      memory: 8M # ought to be enough for anybody
{{< / highlight >}}

{{< highlight bash >}}
$ ci-operator --config test.yaml
INFO[2022-03-09T18:15:32Z] unset version 0
ERRO[2022-03-09T18:15:32Z] Failed to load arguments.                     error=tests[test].from: unknown image "quay.io/fedora/fedora"
{{< / highlight >}}

The image declaration (`from`) for the container test will not work as defined.
This is because, in order to determine the state of all the inputs listed in the
configuration file, `ci-operator` requires that all resources be local to the
cluster.  For this reason, direct references to external images (e.g. from Quay)
such as the one we are attempting are not allowed.  The process for [configuring
image inputs][image_inputs] and [using external images][external_images] is
detailed elsewhere.  For now, we can use an image that is known to already exist
in our clusters.  Declaring cluster images which will be used in the
configuration is done using `base_images`:

{{< highlight yaml >}}
base_images:
  fedora:
    namespace: ci
    name: fedora
    tag: latest
tests:
- as: test
  commands: echo test
  container:
    from: fedora
    clone: false
resources:
  # as before
{{< / highlight >}}

`clone: false` was added since by default tests which use one of the
`base_images` have the source code of the repository automatically cloned.  Our
configuration file is finally valid and ready to guide the execution of the test
it defines, but a few topics need to be covered before we can see the result.

## Test namespaces

Even though `ci-operator` is being executed directly on our machine, that is not
where most of the actual work is done.  Image builds, test executions, etc. must
happen inside an Openshift cluster, and `ci-operator` expects to be executed in
an environment where it has access to one.  This is why this final error message
mentions "in-cluster configuration" and missing Kuberentes host/port
information.  As mentioned before, the default environment is assumed to be a
Prow job, which is executed inside a Kubernetes `Pod`.  There, those environment
variables are provided automatically by Kubernetes (see the [service
documentation][services_networking]).

Outside of a Kubernetes cluster, the connection information can be passed using
the standard `KUBECONFIG` environment variable, which should point to a file
just as `kubectl` and/or `oc` would expect.  Note that the current context will
be used, so make sure it points to the correct cluster.

{{< highlight bash >}}
$ oc whoami
error: Missing or incomplete configuration info.  Please point to an existing, complete config file:


  1. Via the command-line flag --kubeconfig
  2. Via the KUBECONFIG environment variable
  3. In your home directory as ~/.kube/config

To view or setup config directly use the 'config' command.
$ export KUBECONFIG=…
$ oc whoami --show-context
bbguimaraes/api-build01-ci-devcluster-openshift-com:6443/bbarcaro
{{< / highlight >}}

Our `ci-operator` is finally ready to execute its test, but one last adjustment
will make it a more pleasant experience.  In Kubernetes, isolation between
workloads is achieved using [_namespaces_][namespaces].  Openshift wraps
upstream namespaces into its own resource, the [_project_][project].  For most
purposes, the distinction is irrelevant and both names are used interchangeably.
`ci-operator` uses an ephemeral namespace to guarantee no interference between
unrelated tests, which is referred to as the _test namespace_.  The process by
which this namespace is set up will be discussed later; of relevance here is
that this setup is inconvenient for manual testing, for various reasons.

We can create our own test namespace in advance and simply ask `ci-operator` to
use it instead of attempting to create one.  The build clusters are shared
production infrastructure, so make sure to use a unique name that makes the
owner and the purpose clear.

{{< highlight bash >}}
$ oc new-project bbguimaraes
Now using project "bbguimaraes" on server "https://api.build01.ci.devcluster.openshift.com:6443".

You can add applications to this project with the 'new-app' command. For example, try:

    oc new-app rails-postgresql-example

to build a new example application in Ruby. Or use kubectl to deploy a simple Kubernetes application:

    kubectl create deployment hello-node --image=k8s.gcr.io/serve_hostname

{{< / highlight >}}

When that is done, the test can finally be executed successfully:

{{< highlight bash >}}
$ ci-operator --namespace bbguimaraes --config test.yaml --target test
INFO[2022-03-10T14:41:33Z] unset version 0
INFO[2022-03-10T14:41:33Z] Resolved source https://github.com/openshift/ci-tools to master@ef415037
INFO[2022-03-10T14:41:35Z] Using namespace https://console.build01.ci.openshift.org/k8s/cluster/projects/bbguimaraes
INFO[2022-03-10T14:41:35Z] Running [input:fedora], test
INFO[2022-03-10T14:41:37Z] Tagging ci/fedora:latest into pipeline:fedora.
INFO[2022-03-10T14:41:37Z] Executing test test
INFO[2022-03-10T14:41:49Z] Ran for 16s
{{< / highlight >}}

## Target

The last command execution included a few new concepts.  Starting with the
command line, there is now a new argument: `--target`.  It limits the execution
to just our test; we will come back to it once the rest of the output is
analyzed.  Right after the familiar line about the `JOB_SPEC`, we see our test
namespace was successfully selected.  This line is useful to verify that the
correct namespace is used, but even more so in CI jobs, where the name of the
test namespace is automatically generated and not known until the execution of
the job begins.

The next line is the sequence of execution steps that will be performed.  It is
a comma-separated list of names, each of which corresponds to one task performed
by `ci-operator` for a given test (these are called "steps" internally and are
described in [this page][steps]).  Here, it shows the input image declared in
`base_images` and the test, which are discrete steps in the execution (an
[`InputImageTagStep`]({{< relref "steps#inputimagetagstep" >}}) and a
[`TestStep`]({{< relref "steps#teststep" >}}), respectively).

In reality, steps are organized into an execution _graph_, as described in the
[introduction][index], where some depend on others for their own execution.  In
the current example, the test cannot be scheduled before the image is imported:
the test is _dependent_ on the image import.  One useful property of the list in
the output is that it is a _topological ordering_ of the graph, i.e. dependents
always come before the steps they depend on.  As a one-dimensional projection of
a partial order, it is of limited usefulness in more complicated graphs with
multiple dependencies between nodes, but it gives a general idea of the order of
execution.

Each of the next two lines is the output of their respective step when it is
executed.  The image import describes its input and output (the meaning of
`pipeline` will be explained in a [later section]({{< relref "#pipeline" >}}))
and the test simply notifies that it is being executed.  Finally, the total
execution time is displayed right at the end of the execution of `ci-operator`.

Why was the `--target` argument necessary?  Remember that `ci-operator`'s
defaults are optimized for its use in CI jobs.  As such, it implicitly includes
common job tasks in the execution graph:

{{< highlight bash >}}
$ ci-operator --namespace bbguimaraes --config test.yaml |& grep Running
INFO[2022-12-16T13:47:39Z] Running [input:root], [output-images], [images], src, test
{{< / highlight >}}

Here we can see other steps which were pruned from the graph by the `--target`
argument.  See the [step description page][steps] for their
meaning.

## Pipeline

Many `ci-operator` operations involve container images, either as input or
output.  In order to store and manipulate them, one or more `ImageStream`s are
created in the temporary namespace.  One of them, which is always present, is
the `pipeline` stream.  In it are placed the fundamental images which are part
of most CI configurations.  One use of this stream is as the target for images
imported from other namespaces, as seen when a base image was imported to it in
the ["test namespaces"]({{< relref "#test-namespaces" >}}) section.

More information on the various uses of this stream can be found in the
following pages:

- [Build Graph Traversal]({{< relref "_index.md#build-graph-traversal" >}})
- [Image Pipeline]({{< relref "_index.md#image-pipeline" >}})
- [Steps][steps]

[DPTP-32]: https://issues.redhat.com/browse/DPTP-32
[artifacts]: {{< ref "/docs/internals/artifacts#testing" >}}
[ci_operator_reference]: https://steps.ci.openshift.org/ci-operator-reference
[ci_tools]: https://github.com/openshift/ci-tools.git
[configresolver]: {{< relref "configresolver" >}}
[external_images]: {{< relref "/docs/how-tos/external-images" >}}
[git_ls_remote]: https://git-scm.com/docs/git-ls-remote.html
[gitglossary]: https://www.man7.org/linux/man-pages/man7/gitglossary.7.html
[gitrevisions]: https://www.man7.org/linux/man-pages/man7/gitrevisions.7.html
[image_inputs]: {{< relref "/docs/architecture/ci-operator#configuring-inputs" >}}
[index]: {{< relref "_index.md" >}}
[job_env_variables]: https://docs.prow.k8s.io/docs/jobs#job-environment-variables
[kubernetes_operators]: https://kubernetes.io/docs/concepts/extend-kubernetes/operator#operators-in-kubernetes
[kubernetes_resources]: https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/
[life_of_a_prow_job]: https://docs.prow.k8s.io/docs/life-of-a-prow-job/
[namespaces]: https://kubernetes.io/docs/concepts/overview/working-with-objects/namespaces/
[presentations]: {{< ref "/docs/getting-started/useful-links#presentations" >}}
[project]: https://docs.openshift.com/container-platform/4.9/rest_api/project_apis/projectrequest-project-openshift-io-v1.html
[prow]: https://github.com/kubernetes/test-infra/tree/master/prow
[prowjobs]: https://docs.prow.k8s.io/docs/jobs/
[registry_authentication_errors]: {{< ref "/docs/how-tos/use-registries-in-build-farm#why-i-am-getting-an-authentication-error" >}}
[services_networking]: https://kubernetes.io/docs/tasks/run-application/access-api-from-pod/#directly-accessing-the-rest-api
[steps]: {{< relref "steps.md" >}}
