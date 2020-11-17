---
title: "Ci Operator"
date: 2020-10-05T11:14:39-04:00
draft: false
---

# What is `ci-operator` and how does it work?

`ci-operator` is a highly opinionated test workflow execution engine that knows about how OpenShift is built, released and
installed. `ci-operator` hides the complexity of assembling an ephemeral OpenShift 4.x release payload, thereby allowing authors
of end-to-end test suites to focus on the content of their tests and not the infrastructure required for cluster setup and
installation.

`ci-operator` allows for components that make up an OpenShift release to be tested together by allowing each component repository
to test with the latest published versions of all other components. An integration stream of container `images` is maintained with
the latest tested versions of every component. A test for any one component snapshots that stream, replaces any `images` that are
being tested with newer versions, and creates an ephemeral release payload to support installing an OpenShift cluster to run
end-to-end tests.

In addition to giving first-class support for testing OpenShift components, `ci-operator` expects to run in an OpenShift cluster
and uses OpenShift features like `Builds` and `ImageStreams` extensively, thereby exemplifying a complex OpenShift user
workflow and making use of the platform itself. Each test with a unique set of inputs will have a `Namespace` provisioned
to hold the OpenShift objects that implement the test workflow.

`ci-operator` needs to understand a few important characteristics of any repository it runs tests for. This document will begin
by walking through those characteristics and how they are exposed in the configuration. With an understanding of those building
blocks, then, the internal workflow of `ci-operator` will be presented.

# Configuring `ci-operator`: Defining A Repository

At a high level, when a repository author writes a `ci-operator` configuration file, they are describing how a repository
produces output artifacts, how those artifacts fit into the larger OpenShift release and how those artifacts should be tested.
The following examples will describe the configuration file as well as walk through how `ci-operator` creates OpenShift objects
to fulfill their intent.

## Configuring Inputs

When `ci-operator` runs tests to verify proposed changes in a pull request to a component repository, it must first build the
output artifacts from the repository. In order to generate these builds, `ci-operator` needs to know the inputs from which they
will be created. A number of inputs can be configured; the following example provides both:

* `base_images`: provides a mapping of named `ImageStreamTags` which will be available for use in container image builds
* `build_root`: defines the `ImageStreamTag` in which dependencies exist for building executables and non-image artifacts

`ci-operator` configuration:

{{< highlight yaml >}}
base_images:
  base: # provides the OpenShift universal base image for other builds to use when they reference "base"
    name: "4.5"
    namespace: "ocp"
    tag: "base"
  cli: # provides an image with the OpenShift CLI for other builds to use when they reference "cli"
    name: "4.5"
    namespace: "ocp"
    tag: "cli"
build_root: # declares that the release:golang-1.13 image has the build-time dependencies
  image_stream_tag:
    name: "release"
    namespace: "openshift"
    tag: "golang-1.13"
{{< / highlight >}}

As `ci-operator` is an OpenShift-native tool, all image references take the form of an `ImageStreamTag` on the build farm cluster,
not just a valid pull-spec for an image. `ci-operator` will import these `ImageStreamTags` into the `Namespace` created for the test
workflow; snapshotting the current state of inputs to allow for reproducible builds.

If an image that is required for building is not yet present on the cluster, either:

* The correct `ImageStream` should be declared and committed to the openshift/release repository here.
* The image referenced in `base_images` has to be accessible. The simplest RBAC rule to achieve this is to allow the
  system:authenticated role to get imagestreams/layers in the namespace that contains the `ImageStream`.

## Build Root Image

The build root image must contain all dependencies for building executables and non-image artifacts. Additionally,
`ci-operator` requires this image to include a `git` executable in $PATH. Most repositories will want to use an image
already present in the cluster, using the `image_stream_tag` stanza like described in [Configuring Inputs](#configuring-inputs).

Alternatively, a project can be configured to build a build root image using a `Dockerfile` in the repository:

{{< highlight yaml >}}
build_root:
  project_image:
    dockerfile_path: images/build-root/Dockerfile # Dockerfile for building the build root image
{{< / highlight >}}

In this case, the `Dockerfile` will always be obtained from current HEAD of the given branch, even if `ci-operator` runs in
the context of a PR that updates that `Dockerfile`.

A third option is to configure the `build_root` in your repo alongside the code instead of inside the `ci-operator` config.
The main advantage of this is that it allows to atomically change both code and the `build_root`. To do so, set the
`from_repository: true` in your `ci-operator` config:

{{< highlight yaml >}}
build_root:
  from_repository: true
{{< / highlight >}}

Afterwards, create a file named `.ci-operator.yaml` in your repository that contains the imagestream you want to use for
your `build_root`:

{{< highlight yaml >}}
build_root_image:
  namespace: openshift
  name: release
  tag: golang-1.15
{{< / highlight >}}

## Building Artifacts

Starting `FROM` the image described as the `build_root`, `ci-operator` will clone the repository under test and compile
artifacts, committing them as image layers that may be referenced in derivative builds. The commands which are run to
compile artifacts are configured with `binary_build_commands` and are run in the root of the cloned repository. A a
separate set of commands, `test_binary_build_commands`, can be configured for building artifacts to support test
execution. The following `ImageStreamTags` are created in the test's `Namespace`

* `pipeline:root`: imports or builds the `build_root` image
* `pipeline:src`: clones the code under test `FROM pipeline:root`
* `pipeline:bin`: runs commands in the cloned repository to build artifacts `FROM pipeline:src`
* `pipeline:test-bin`: runs a separate set of commands in the cloned repository to build test artifacts `FROM pipeline:src`

`ci-operator` configuration:

{{< highlight yaml >}}
binary_build_commands: "go build ./cmd/..."         # these commands are run to build "pipeline:bin"
test_binary_build_commands: "go test -c -o mytests" # these commands are run to build "pipeline:test-bin"
{{< / highlight >}}

The content created with these OpenShift `Builds` is addressable in the `ci-operator` configuration simply with the tag. For
instance, the `pipeline:bin` image can be referenced as `bin` when the content in that image is needed in derivative `Builds`.

## Building Container Images

Once container `images` exist with output artifacts for a repository, additional output container `images` may be built that
make use of those artifacts. Commonly, the desired output container image will contain only the executables for a
component and not any of the build-time dependencies. Furthermore, most teams will need to publish their output
container `images` through the automated release pipeline, which requires that the `images` are built in Red Hat's
production image build system, OSBS. In order to create an output container image without build-time dependencies in a
manner which is compatible with OSBS, the simplest approach is a multi-stage `Dockerfile` build.

The standard pattern for a multi-stage `Dockerfile` is to run a compilation in a builder image and copy the resulting
artifacts into a separate output image base. For instance, a repository could add this `Dockerfile` to their source:

`Dockerfile`:

{{< highlight yaml >}}
# this image is replaced by the build system to provide repository source code
FROM registry.svc.ci.openshift.org/ocp/builder:golang-1.13 AS builder
# the repository's source code will be available under $GOPATH of /go
WORKDIR /go/src/github.com/myorg/myrepo
# this COPY bring the repository's source code from the build context into an image layer
COPY . .
# this matches the binary_build_commands but runs against the build cache
RUN go build ./cmd/...

# this is the production output image base and matches the "base" build_root
FROM registry.svc.ci.openshift.org/openshift/origin-v4.5:base
# inject the built artifact into the output
COPY --from=builder /go/src/github.com/myorg/myrepo/mybinary /usr/bin/
{{< / highlight >}}

While such a `Dockerfile` could simply be built by `ci-operator`, a number of optimizations can be configured to speed up
the process -- especially if multiple output `images` share artifacts. An output container image build is configured for
`ci-operator` with the `images` stanza in the configuration. Any entry in the `images` stanza can be configured with native
OpenShift `Builds` options; the full list can be viewed
[here](https://godoc.org/github.com/openshift/ci-tools/pkg/api#ProjectDirectoryImageBuildInputs). In the following
example, an output container image is built where the builder image is replaced with the image layers containing built
artifacts in `pipeline:bin` and the output image base is replaced with the appropriate entry from `base_images`.

`ci-operator` configuration:

{{< highlight yaml >}}
images:
- dockerfile_path: "Dockerfile" # this is a relative path from the root of the repository to the multi-stage Dockerfile
  from: "base" # a reference to the named base_image, used to replace the output FROM in the Dockerfile
  inputs:
    bin: # declares that the "bin" tag is used as the builder image when overwriting that FROM instruction
      as:
      - "registry.svc.ci.openshift.org/ocp/builder:golang-1.13"
  to: "mycomponent" # names the output container image "mycomponent"
- dockerfile_path: "tests/Dockerfile"
  from: "test-bin" # base the build off of the built test binaries
  inputs:
    cli:
      paths:
      - destination_dir: "."
        source_path: "/go/bin/oc" # inject the OpenShift clients into the build context directory
  to: "mytests" # names the output container image "mytests"
{{< / highlight >}}

By making use of the previously compiled artifacts in the intermediate `pipeline:bin` image, this repository is able to
cache the Go build. If multiple output `images` exist that rely on a previously built artifact, this caching effect can
reduce build times dramatically.

## Publishing Container Images

Once `ci-operator` has built output container `images` for a repository, it can publish them to an integration `ImageStream`
so that other repositories can consume them. For instance, every image that makes up the OpenShift release payload is
incrementally updated in an integration `ImageStream`. This allows release payloads to be created incorporating the latest
tested version of every component. In order to publish `images` to an integration `ImageStream`, add the `promotion` stanza to
`ci-operator` configuration.

* the `pipeline:src` tag, published as `ocp/4.5:repo-scripts` containing the latest version of the repository
* the `stable:component` tag, published as `ocp/4.5:mycomponent` containing the output component itself

`ci-operator` configuration:

{{< highlight yaml >}}
promotion:
  additional_images:
    repo-scripts: "src"    # promotes "src" as "repo-scripts"
  excluded_images:
  - "mytests" # does not promote the test image
  namespace: "ocp"
  name: "4.5"
{{< / highlight >}}

## Describing Inclusion in an OpenShift Release

`ci-operator` gives first-class support to repositories which need to run end-to-end tests in the context of an OpenShift
cluster. `ci-operator` supports two mechanisms for testing in the context of an OpenShift release. First, it is possible
to use the container `images` built as part of the test to build an ephemeral release payload, allowing repositories that
build parts of OpenShift to test versions that include components under test. Second, it is possible to reference
existing release payloads that have already been created, in order to validate those releases or for repositories to
test their functionality against published versions of OpenShift.

### Testing With an Ephemeral OpenShift Release

The `tag_specification` configuration option enables a repository to declare which version of OpenShift it is a part of by
specifying the `images` that will be used to create an ephemeral OpenShift release payload for testing. Most commonly, the
same integration `ImageStream` is specified for `tag_specification` as is for `promotion`.

`ci-operator` configuration:

{{< highlight yaml >}}
tag_specification:
  namespace: "ocp"
  name: "4.5"
{{< / highlight >}}

When `ci-operator` begins to test a repository, it will snapshot the current state of the integration `ImageStream`,
importing all tags into the test `Namespace`. Any output image tags built from the repository under test overwrite those
that are imported from the integration `ImageStream`. An ephemeral release payload is built from the resulting
`ImageStream`, containing the latest published versions of all components and the proposed version of the component under
test.

### Testing With an Existing OpenShift Release

The `releases` configuration option allows specification of an existing version of OpenShift that a component will be
tested on. Three types of releases may be referenced: candidate release payloads from a release controller, pre-release
payloads that have yet to be published to Cincinnati, and official releases as customers would see them.

Releases may be named, with two names holding special meaning. In ordinary end-to-end tests, the latest release
describes the version that will be installed before tests are run. For upgrade end-to-end tests, the initial release
describes the version of OpenShift which is initially installed, after which an upgrade is executed to the latest
release, after which tests are run. The full pull specification for a release payload is provided to test steps with the
`${RELEASE_IMAGE_<name>}` environment variable. The following example exposes a the following release payload to tests:

* the `release:initial` tag, holding a release candidate for OKD 4.3, exposed as `${RELEASE_IMAGE_INITIAL}`
* the `release:latest` tag, holding an officially-released payload for OCP 4.4, exposed as `${RELEASE_IMAGE_LATEST}`
* the `release:previous` tag, holding a previous release candidate for OCP 4.5, exposed as `${RELEASE_IMAGE_PREVIOUS}`
* the `release:custom` tag, holding the latest pre-release payload for OCP 4.4, exposed as ``${RELEASE_IMAGE_CUSTOM}``

`ci-operator` configuration:

{{< highlight yaml >}}
releases:
  initial:           # describes the 'initial' release
    candidate:       # references a candidate release payload
      product: okd
      version: "4.3"
  latest:
    release:          # references a version released to customers
      channel: stable # configures the release channel to search
      version: "4.4"
  previous:
    candidate:
      product: ocp
      architecture: amd64
      stream: nightly     # specifies a candidate release stream
      version: "4.5"
      relative: 1         # resolves to the Nth latest payload in this stream
  custom:
    prerelease:       # references a version that may be published to customers, but is not yet
      product: ocp
      version_bounds: # bounds the version for the release chosen
        lower: "4.4.0"
        upper: "4.5.0-0"
{{< / highlight >}}

## Declaring Tests

Tests as executed by `ci-operator` run a set of commands inside of a container; this is implemented by scheduling a `Pod`
under the hood. `ci-operator` can be configured to run one of two types of tests: simple, single-stage container tests and
longer, multi-stage container tests. A single-stage test will schedule one `Pod` and execute the commands specified. Note
that the default working directory for any container image in the `pipeline` `ImageStream` is the root of the cloned
repository under test. The following example uses this approach to run static verification of source code:

`ci-operator` configuration:

{{< highlight yaml >}}
tests:
- as: "vet"                 # names this test "vet"
  commands: "go vet ./..."  # declares which commands to run
  container:
    from: "src"             # runs the commands in "pipeline:src"
{{< / highlight >}}

The second approach to describing tests allows for multiple containers to be chained together and describes a more
complicated execution flow between them. This multi-stage test approach is best suited for end-to-end test suites that
require full OpenShift test clusters to be brought up and torn down. Learn more about this type of test at the
[overview.](/docs/architecture/step-registry/)

## Types of Tests

### Pre-submit Tests

By default, any entry declared in the `tests` stanza of a `ci-operator` configuration file will be a pre-submit test: these
tests run before code is submitted (merged) into the target repository. Pre-submit tests are useful to give feedback to
a developer on the content of their pull request and to gate merges to the central repository. These tests will fire
when a pull request is opened, when the contents of a pull request are changed, or on demand when a user requests them.

### Post-submit Tests

When a repository configures `ci-operator` to build `images` and publish them (by declaring container image builds with
`images` and the destination for them to be published with `promotion`), a post-submit test will exist. A post-submit test
executes after code is merged to the target repository; this sort of test type is a good fit for publication of new
artifacts after changes to source code.

Adding a custom `postsubmit` to a repository via the `ci-operator` config is supported. To do so, add the `postsubmit` field
to a `ci-operator` test config and set it to `true`. The following example configures a `ci-operator` test to run as a
`postsubmit`:

`ci-operator` configuration:

{{< highlight yaml >}}
tests:
- as: "upload-results"               # names this test "upload-results"
  commands: "make upload-results"    # declares which commands to run
  container:
    from: "bin"                      # runs the commands in "pipeline:bin"
  postsubmit: true
{{< / highlight >}}

One important thing to note is that, unlike `presubmit` jobs, the `postsubmit` tests are configured to not be rehearsable.
This means that when the test is being added or modified by a PR in the `openshift/release` repo, the job will not be
automatically run against the change in the PR. This is done to prevent accidental publication of artifacts by
rehearsals.

### Periodic Tests

A repository may be interested in validating the health of the latest source code, but not at every moment that the code
changes. In these cases, a periodic test may be configured to run on the latest source code on a schedule. The following
example sets the `cron` field on an entry in the `tests` list to configure that test to run on a schedule, instead of as a
pre-submit:

`ci-operator` configuration:

{{< highlight yaml >}}
tests:
- as: "sanity"               # names this test "sanity"
  commands: "go test ./..."  # declares which commands to run
  container:
    from: "src"              # runs the commands in "pipeline:src"
  cron: "0 */6 * * *"          # schedule a run on the hour, every six hours
{{< / highlight >}}

Note that the build farms used to execute jobs run on UTC time, so time-of-day based `cron` schedules must be set with
that in mind.

## Referencing Images

As `ci-operator` is OpenShift-native, all `images` used in a test workflow are stored as `ImageStreamTags`. The following
ImageStreams will exist in the `Namespace` executing a test workflow:

|`ImageStream`|Description|
|:---|:---|
|`pipeline`|  Input `images` described with `base_images` and `build_root` as well as `images` holding built artifacts (such as `src` or `bin`) and output `images` as defined in `images`.|
|`release`|Tags of this ImageStreams hold OpenShift release payload `images` for installing and upgrading ephemeral OpenShift clusters for testing; a tag will be present for every named release configured in releases. If a `tag_specification` is provided, two tags will be present, `:initial` and `:latest`.|
|`stable-<name>`|Images composing the `release:name` release payload, present when `<name>` is configured in `releases`.|
|`stable`|Same as above, but for the release:latest release payload. Appropriate tags are overridden using the container `images` built during the test.|

### Referring to Images in `ci-operator` Configuration

Inside of any `ci-operator` configuration file all `images` must be referenced as an `ImageStreamTag` (`stream:tag`), but may be
referenced simply with the tag name. When an image is referenced with a tag name, the tag will be resolved on the
pipeline `ImageStream`, if possible, falling back to the stable `ImageStream` if not. For example, an image referenced as
installer will use pipeline:installer if that tag is present, falling back to stable:installer if not. The following
configuration fields use this defaulting mechanism:

* `images[*].from`: configuring the base `FROM` which an image builds
* `promotion.additional_images`: configuring which `images` are published
* `promotion.excluded_images`: configuring which `images` are not published
* `tests[*].container.from`: configuring the container image in which a single-stage test runs
* `tests[*].steps.{pre,test,post}[*].from`: configuring the container image which some part of a multi-stage test runs

### Referring to Images in Tests

`ci-operator` will run every part of a test as soon as possible, including imports of external releases, builds of
container `images` and test workflow steps. If a workflow step runs in a container image that's imported or built in an
earlier part of a test, `ci-operator` will wait to schedule that test step until the image is present. In some cases,
however, it is necessary for a test command to refer to an image that was built during the test workflow but not run
inside of that container image itself. In this case, the default scheduling algorithm needs to know that the step
requires a valid reference to exist before running.

Test workloads can declare that they require fully resolved pull specification as a digest for any image from the
pipeline, `stable-<name>` or `release` ImageStreams. Multi-stage tests may opt into having these environment variables
present by declaring `dependencies` in the `ci-operator` configuration for the test. For instance, the example test below
will be able to access the following environment variables:

* `${MACHINE_CONFIG_OPERATOR}`: exposing the pull specification of the stable:machine-config-operator `ImageStreamTag`
* `${BINARIES}`: exposing the pull specification of the `pipeline:bin` `ImageStreamTag`
* `${LATEST_RELEASE}`: exposing the pull specification of the release:latest payload `ImageStreamTag`

`ci-operator` configuration:

{{< highlight yaml >}}
tests:
- as: "vet"
  steps:
    test:
    - as: "vet"
      from: "src"
      commands: "test-script.sh ${BINARIES} ${MACHINE_CONFIG_OPERATOR} ${LATEST_RELEASE}"
      resources:
        requests:
          cpu: 100m
          memory: 100Mi
      dependencies:
      - name: "machine-config-operator"
        env: "MACHINE_CONFIG_OPERATOR"
      - name: "bin"
        env: "BINARIES"
      - name: "release:latest"
        env: "LATEST_RELEASE"
{{< / highlight >}}

### Dependency Overrides

Dependencies can be defined at the workflows and test level in the registry, overwriting the source for the pull
specification that will populate an environment variable in a step. These definitions will be propagated from the
top-level definition to individual steps. The following example overrides the content of the `${DEP}` environment variable
in the test step to point to the pull specification of `pipeline:src` instead of the original `pipeline:bin`.

{{< highlight yaml >}}
tests:
- as: "example"
  steps:
    dependencies:
      DEP: "pipeline:src" # the override for the definition of ${DEP}
    test:
    - as: "test"
      commands: "make test"
      from: "src"
      resources:
        requests:
          cpu: 100m
          memory: 100Mi
      dependencies:
      - name: "pipeline:bin" # the original definition of ${DEP}
        env: "DEP"
{{< / highlight >}}
