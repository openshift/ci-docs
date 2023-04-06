---
title: "CI Operator"
description: An overview of the architecture of ci-operator, the OpenShift CI workflow engine.
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
`ci-operator` requires this image to include a `git` executable in $PATH and it has write permission in the folder `/go`.
Most repositories will want to use an image
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
compile artifacts are configured with `binary_build_commands` and are run in the root of the cloned repository. A
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

### Using the Build Cache

For repositories where `git` history is large or the amount of compilation time used to create the `bin` image is large,
it may be beneficial to opt into using the build cache. This cache contains the resulting image from the `bin` build,
which contains both all of the `git` data created during the `src` build as well as the Go build cache. `ci-operator` will
publish this cache by default, no configuration is needed to ensure the cache exists. Jobs that use the build cache will
therefore only need to do incremental cloning and building, which can significantly speed up execution time. In order to
opt into using the build cache, set `use_build_cache: true` in your build root configuration:

{{< highlight yaml >}}
build_root: # declares that the release:golang-1.13 image has the build-time dependencies
  use_build_cache: true # opts into using the build cache
  image_stream_tag:
    name: "release"
    namespace: "openshift"
    tag: "golang-1.13"
{{< / highlight >}}

In the above example, the root image is `openshift/release:golang-1.13` and the cached image will be the previously-
published `bin` image for the specific branch of the repository under test. The build cache will _only_ be used if it
was built off of the same build root image as would otherwise be imported. That is to say, if the underlying root image
(here `openshift/release:golang-1.13`) changes, the build cache will be invalid and will not be used.

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
FROM registry.ci.openshift.org/ocp/builder:golang-1.13 AS builder
# the repository's source code will be available under $GOPATH of /go
WORKDIR /go/src/github.com/myorg/myrepo
# this COPY bring the repository's source code from the build context into an image layer
COPY . .
# this matches the binary_build_commands but runs against the build cache
RUN go build ./cmd/...

# this is the production output image base and matches the "base" build_root
FROM registry.ci.openshift.org/openshift/origin-v4.5:base
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
      - "registry.ci.openshift.org/ocp/builder:golang-1.13"
  to: "mycomponent" # names the output container image "mycomponent"
- dockerfile_path: "tests/Dockerfile"
  from: "test-bin" # base the build off of the built test binaries
  inputs:
    cli:
      paths:
      - destination_dir: "."
        source_path: "/go/bin/oc" # inject the OpenShift clients into the build context directory
  to: "mytests" # names the output container image "mytests"
- dockerfile_literal: |- # Trivial dockerfiles can just be inlined
    FROM base
    RUN yum install -y python2
  from: "test-bin"
  to: test-bin-with-python2
{{< / highlight >}}

By making use of the previously compiled artifacts in the intermediate `pipeline:bin` image, this repository is able to
cache the Go build. If multiple output `images` exist that rely on a previously built artifact, this caching effect can
reduce build times dramatically.

## Build inputs
[Building Container Images](#building-container-images  ) paragraph has shown how it is possible to leverage build inputs `.inputs[]` to speed the building process up. We are going to analyze this feature in a greater detail now.
### `as:` substitutions
It is a list of image names that directly maps to [`.spec.source.images[].as`](https://docs.openshift.com/container-platform/4.12/rest_api/workloads_apis/build-build-openshift-io-v1.html#spec-source-images-2) of an [Openshift Build](https://docs.openshift.com/container-platform/4.12/rest_api/workloads_apis/build-build-openshift-io-v1.html#specification), therefore it preserves the semantic.  
When the aforementioned stanza exists, a build searches for every source images that matches one of the `.as` names and it performs a substitution with the image specified in `.inputs[]`.  

Images substitution can happen in one of the following ways:  
- in a `--from=` argument:
```yaml
images:
- dockerfile_literal: |
    # ...
    COPY --from=nginx:latest /tmp/dummy /tmp/dummy
  inputs:
    bin:
      as:
      - nginx:latest
```
`nginx:latest` is going to be replaced with `pipeline:bin`  

- in a `FROM` directive:
```yaml
images:
- dockerfile_literal: |
    FROM nginx:latest AS builder 
    # ...
    COPY --from=builder /tmp/dummy /tmp/dummy
  inputs:
    bin:
      as:
      - nginx:latest
```
`nginx:latest` is going to be replaced with `pipeline:bin`  

## Build Arguments
The `build_args` option in `ci-operator` configuration specifies a list of [build arguments](https://docs.openshift.com/container-platform/4.7/cicd/builds/build-strategies.html#builds-strategy-docker-build-arguments_build-strategies). The values of those arguments are passed to the build at the build time to override their default values from Dockerfile. The value of a build argument is taken from the field `value` in the configuration.

```yaml
images:
- build_args:
    - name: product
      value: okd
  dockerfile_literal: |-
    FROM centos:8
    ARG product=ocp
  from: os
  to: test-image
```

## Publishing Container Images

Once `ci-operator` has built output container `images` for a repository, it can publish them to an integration `ImageStream`
or `Namespace` so that other repositories can consume them. Publication to an integration `ImageStream` is appropriate when
there is a requirement to quickly identify all images that belong to a version; tags will take the form of `version:component`.
Publication to a `Namespace` creates tags in the form of `component:version` and may be more familiar to users.

Images are published for each `component` specified in `images[].to` unless explicitly excluded (see examples below).

Images published in this manner are produced when the source repository branch is updated (e.g.
when a PR merges or the branch is manually updated), not when the images are built as in an
in-flight PR.

### Publishing to an Integration Stream

Every image that makes up the OpenShift release payload is incrementally updated in an integration `ImageStream`. This
allows release payloads to be created incorporating the latest tested version of every component. In order to publish
`images` to an integration `ImageStream`, add the following `promotion` stanza to `ci-operator` configuration.

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

### Publishing to an Integration Namespace

For projects that do not need to refer to all images belonging to a specific version can publish their images to separate
`ImageStreams` in one `Namespace`.  In order to publish `images` to many integration `ImageStreams`, in one `Namespace`,
add the following `promotion` stanza to `ci-operator` configuration.

* the `pipeline:src` tag, published as `ocp/repo-scripts:4.5` containing the latest version of the repository
* the `stable:component` tag, published as `ocp/mycomponent:4.5` containing the output component itself

`ci-operator` configuration:

{{< highlight yaml >}}
promotion:
  additional_images:
    repo-scripts: "src"    # promotes "src" as "repo-scripts"
  excluded_images:
  - "mytests" # does not promote the test image
  namespace: "ocp"
  tag: "4.5"
{{< / highlight >}}

### Publishing Images Tagged By Commit

For projects that wish to make their components available at every version produced, as well as with a floating version
that tracks the `latest` or most recent release, add `tag_by_commit: true` to the promotion configuration. This will
 publish `images` to many integration `ImageStreams`, in one `Namespace`, with more than one tag being updated per push.

 The following `promotion` stanza in the `ci-operator` configuration will publish:

* the `pipeline:src` tag, published as `ocp/repo-scripts:4.5` and `ocp/repo-scripts:<commit-hash>` containing the latest version of the repository
* the `stable:component` tag, published as `ocp/mycomponent:4.5`  and `ocp/mycomponent:<commit-hash>` containing the output component itself

`ci-operator` configuration:

{{< highlight yaml >}}
promotion:
  additional_images:
    repo-scripts: "src"    # promotes "src" as "repo-scripts"
  excluded_images:
  - "mytests" # does not promote the test image
  namespace: "ocp"
  tag: "4.5"
  tag_by_commit: true # publish tags based on the git commit being built
{{< / highlight >}}

## Describing OpenShift Releases Involved in Tests {#describing-inclusion-in-an-openshift-release}

`ci-operator` gives first-class support to repositories which need to run end-to-end tests in the context of an OpenShift
cluster. `ci-operator` supports two mechanisms for testing in the context of an OpenShift release. First, it is possible
to use the container `images` built as part of the test to build an ephemeral release payload, allowing repositories that
build parts of OpenShift to test versions that include components under test. Second, it is possible to reference
existing release payloads that have already been created, in order to validate those releases or for repositories to
test their functionality against published versions of OpenShift.

### Should I Use an Ephemeral or Published Release?

The main factor in deciding which kind of release to use is whether the tested component is a part of OpenShift itself
or not (i.e., if you want to test _"OpenShift itself"_ or _"something on OpenShift"_). Additionally, the decision should
take into account what expectations you have on the OpenShift cluster reliability.

You should use an [ephemeral release](#testing-with-an-ephemeral-openshift-release) and ensure that the images you build are included in the release if the component you are testing is
part of OpenShift itself. Ephemeral releases include the tested, CI-built versions of the OpenShift component images
so that the tested components are involved in full end-to-end test workflow, including installation. Using ephemeral
releases satisfies the _"test OpenShift itself"_ use case. Ephemeral releases are also a suitable choice if you need to
test on the most recent merged OpenShift code. These releases contain at least the code present in the latest (even
rejected) CI release, and often even newer.

The usual case for using [existing releases](#testing-with-an-existing-openshift-release) is testing _"something on
OpenShift."_ That means testing software that is not part of OpenShift itself: optional operators, layered products and
others. You should use existing releases when your testing does not depend that much on the precise version of the
OpenShift cluster installed. Existing releases have clearer stability expectations because you control what  kind
of release will be used: from the latest CI candidate to stable versions already released to customers.

Alternatively, a job can [claim a pre-installed cluster](#testing-with-a-cluster-from-a-cluster-pool) from a cluster pool. These clusters are available to jobs for testing much faster because their installation is not a part of the job itself. Available cluster configurations (cloud platform, version, etc.) may vary. They will be installed using an existing, long-lived release such as publicly available OCP versions. Because the clusters are pre-installed, they cannot be customized. They will not contain any content derived from the pull request which triggers the job. Hence, these clusters are only suitable for jobs that want to test on top of OpenShift, not for jobs that test OCP itself.

### Testing With an Ephemeral OpenShift Release

The `releases` configuration option allows specification of a version of OpenShift that a component will be
tested on. In order to request an ephemeral release to be created at run-time, the `releases["name"].integration` option
must be used to specify the `images` that will be used to create an ephemeral OpenShift release payload for testing. If
the images built in the test are to be bundled into the release payload being tested, the `include_built_images` option
should be set. Most commonly, the same integration `ImageStream` is specified for ephemeral release snapshots as is for `promotion`.

`ci-operator` configuration:

{{< highlight yaml >}}
releases:
  # this release will snapshot the current state of the integration stream, useful as an 
  # upgrade source
  initial: 
    integration:
      namespace: "ocp"
      name: "4.5"
  # this release will add built images to the snapshot, allowing tests to verify changes 
  # to OCP components
  latest: 
    integration:
      namespace: "ocp"
      name: "4.5"
      include_built_images: true
{{< / highlight >}}

In the above example, `ci-operator` will snapshot the current state of the integration `ImageStream`,
import all tags into the test `Namespace` and make it available as a release named `initial` and exposed by default
to test code under `${RELEASE_IMAGE_INITIAL}`. A similar snapshot begins to populate the images used to create the
`latest` release. Any output image tags built from the repository under test overwrite those that are imported from
the integration `ImageStream`. An ephemeral release payload is built from the resulting `ImageStream`, containing the
latest published versions of all components and the proposed version of the component under test. The ephemeral release
is named `latest` and exposed to test code under `${RELEASE_IMAGE_LATEST}`.

### Testing With an Existing OpenShift Release

The `releases` configuration option allows specification of a version of OpenShift that a component will be
tested on. Three types of existing releases may be referenced: candidate release payloads from a release controller, pre-release
payloads that have yet to be published to Cincinnati, and official releases as customers would see them.

Releases may be named, with two names holding special meaning. In ordinary end-to-end tests, the latest release
describes the version that will be installed before tests are run. For upgrade end-to-end tests, the initial release
describes the version of OpenShift which is initially installed, after which an upgrade is executed to the latest
release, after which tests are run. The full pull specification for a release payload is provided to test steps with the
`${RELEASE_IMAGE_<name>}` environment variable. The following example exposes the following release payloads to tests:

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
    release:          # references a version from Red Hat's Cincinnati update service https://api.openshift.com/api/upgrades_info/v1/graph
      channel: stable # configures the release channel to search.  The major.minor from version will be appended automatically, so the Cincinnati request for this will use 'stable-4.4'.
      version: "4.4"  # selects the largest Semantic Version in the configured channel.  https://semver.org/spec/v2.0.0.html#spec-item-11
  firstz:
    release:           # same as the 'latest' example above
      channel: stable  # same as the 'latest' example above
      version: "4.4.3" # selects the 4.4.3 release.  This is probably only useful for tip-to-first-z rollback tests.  Most folks will want to use the 'latest' example above
  previous:
    candidate:
      product: ocp
      architecture: amd64
      stream: nightly     # specifies a candidate release stream
      version: "4.5"
      relative: 1         # resolves to the Nth latest payload in this stream
  custom:
    prerelease:       # references a version known to a release controller
      product: ocp
      version_bounds: # bounds the version for the release chosen
        lower: "4.4.0"
        upper: "4.5.0-0"
  ec:
    prerelease:       # references a version known to a release controller
      product: ocp
      version_bounds: # bounds the version for the release chosen
        stream: 4-dev-preview
        lower: "4.1.0"
        upper: "4.999.0"
{{< / highlight >}}

### Testing with a Cluster from a Cluster Pool
The `cluster_claim` below claims an OCP 4.7 cluster in AWS from a pool owned by `openshift-ci`. If the cluster is successfully claimed from the pool, `ci-operator` executes the specified multi-stage test and provides it the credentials to access the cluster via two environmental variables:

-  `${KUBECONFIG}`: Path to `system:admin` credentials.
-  `${KUBEADMIN_PASSWORD_FILE}`: Path to the `kubeadmin` password file.


```yaml
- as: e2e
  cluster_claim:
    # architecture, cloud, owner, product, and version are used to determine a cluster pool by matching the labels
    as: custom    # optional; release name to use when importing cluster claim release; defaults to `latest`
    architecture: amd64
    cloud: aws
    owner: openshift-ci
    product: ocp
    timeout: 1h0m0s
    version: "4.7"
    labels:       # optional; more labels to match besides architecture, cloud, owner, product, and version defined above
      size: "6"
  steps:
    test:
    - as: claim
      commands: |
        printenv KUBECONFIG
        printenv KUBEADMIN_PASSWORD_FILE
        oc get node
        oc config view
        oc whoami
      from: stable-custom:cli # refer to cli tag from cluster claim release named in `as` under `cluster_claim`. It works for other tags as well.
      resources:
        requests:
          cpu: 100m
          memory: 200Mi
    workflow: generic-claim # expose images, gather logs (https://steps.ci.openshift.org/workflow/generic-claim)
```

The claim will be fulfilled immediately if a cluster is available in the cluster pool. If there is no cluster available at the moment, `ci-operator` will wait until new one is provisioned, up to the time limit specified in the `timeout` field. If no cluster is made available until the `timeout`, the `ci-operator` execution will fail. From our experience with clusters in AWS-backed cluster pools, the jobs can expect the following:

- almost no time to claim a running cluster in the pool;
- 3 - 6 minutes to wake up a [hibernating](https://github.com/openshift/hive/blob/master/docs/hibernating-clusters.md) cluster. A cluster is hibernating after it has not been claimed for sometime after beining provisioned;
- 40 to 60 minutes to create a new cluster if all the pre-installed clusters in the pool are taken by other jobs.

The system is designed to allow teams to set up custom cluster pools backed by cloud platform accounts they own, and then use these pools to provide clusters to their jobs. See the [Creating a Cluster Pool](/docs/how-tos/cluster-claim/) document for more details and check out [the existing cluster pools](/docs/how-tos/cluster-claim/#existing-cluster-pools). By default, OpenShift CI provides the pools backed by DPP-owned accounts.


Note that `cluster_claim` and `cluster_profile` are mutually exclusive because [the latter](/docs/architecture/step-registry/#implicit-lease-configuration-with-cluster_profile) indicates installing a cluster on demand, instead of claiming a pre-installed cluster in a pool.

If you are using `cluster_claim` to replace a workflow such as [ipi-aws](https://steps.ci.openshift.org/workflow/ipi-aws), you may have also removed important steps such as exposing images (pre) and gathering logs (post).
You can reinstate these steps by introducing a workflow such as [generic-claim](https://steps.ci.openshift.org/workflow/generic-claim).

The pull secret `${CLUSTER_PROFILE_DIR}/pull-secret` does not exist if a test claims a cluster. The same content can be accessed by [adding the `ci-pull-credentials` secret in the `test-credentials` namespace to your test](https://docs.ci.openshift.org/docs/architecture/step-registry/#injecting-custom-credentials): the key in the secret is `.dockerconfigjson`.

For any test using `cluster_claim`, `ci-operator` creates a release whose name is specified by `cluster_claim.as` which is `latest` by default.
The payload of the release is the one used to install the ephemeral cluster for the test.
That means if there is a release in the `releases` stanza with the same name, it is overridden throughout the test.
To avoid the release overriding, `cluster_claim.as` can be given as a value which does not appear in the `releases` stanza.

The version of the claimed cluster is determined by the reference to a `ClusterImageSet` of the cluster pool
which defines the image that contains the payload to use when installing a cluster.
The _released_ `4.Y` versions of `ClusterImageSet` [manifests](https://github.com/openshift/release/tree/master/clusters/hive/pools) are maintained by
a tool which ensures that they points to the latest version.
It is currently not supported that a test claims by `cluster_claim` a cluster with the version which has not been released yet.

### Testing with a Cluster from HyperShift
[HyperShift](https://hypershift-docs.netlify.app/) is another alternative to create OpenShift clusters in CI. It is suitable to run e2e tests for an OpenShift component except [web console](https://docs.openshift.com/container-platform/4.12/web_console/web-console-overview.html) and [monitoring](https://docs.openshift.com/container-platform/4.12/welcome/index.html) or an optional operator, or an application running on the cluster.

The [hypershift-hostedcluster-workflow](https://steps.ci.openshift.org/workflow/hypershift-hostedcluster-workflow) can be used to claim a hosted cluster from HyperShift deployed in the management cluster (checkout [FAQ]( {{< ref "docs/how-tos/migrating-to-hypershift" >}} )).

Below is an example on how to use `hypershift-hostedcluster-workflow`:

```yaml
...
- as: e2e-hypershift
  steps:
    cluster_profile: aws-2
    env:
      HYPERSHIFT_BASE_DOMAIN: hypershift.aws-2.ci.openshift.org
      HYPERSHIFT_HC_RELEASE_IMAGE: quay.io/openshift-release-dev/ocp-release@sha256:9ffb17b909a4fdef5324ba45ec6dd282985dd49d25b933ea401873183ef20bf8
    workflow: hypershift-hostedcluster-workflow
```

For user using your own cluster profile, a Route53 public zone [needs](https://hypershift-docs.netlify.app/getting-started/) to be created.

```shell
BASE_DOMAIN=www.example.com
aws route53 create-hosted-zone --name $BASE_DOMAIN --caller-reference $(whoami)-$(date --rfc-3339=date)
```

This workflow requires the following environment variables:
- `HYPERSHIFT_BASE_DOMAIN`: The base domain for the hosted OpenShift installation.
- `HYPERSHIFT_HC_RELEASE_IMAGE`: The release image for the hosted OpenShift installation. Release images can be located in [quay.io](https://quay.io/repository/openshift-release-dev/ocp-release?tab=tags&tag=latest). Alternatively, this environment variable can be skipped to use `release:latest`.

A full list of environment variables consumed by this workflow can be found in [step-registry](https://steps.ci.openshift.org/workflow/hypershift-hostedcluster-workflow).

This workflow exports following files:
- `${SHARED_DIR}/nested_kubeconfig`: `kubeconfig` file for the `system:admin` account.
- `${SHARED_DIR}/kubeadmin-password`: File contains `kubeadmin` user's password.

This workflow also sets the following environment variables:
- `${KUBECONFIG}`: Path to `system:admin` credentials.

The workflow will create necessary VPC and other resources in the specified `cluster profile` account, then provision a hosted cluster from our HyperShift deployment. The worker nodes are created in the AWS account from specified `cluster profile`, and the control plane of the cluster will be maintained by us.


## Declaring Tests

Tests as executed by `ci-operator` run a set of commands inside of a container; this is implemented by scheduling a `Pod`
under the hood. `ci-operator` can be configured to run one of two types of tests: simple, single-stage container tests and
longer, multi-stage container tests. A single-stage test will schedule one `Pod` and execute the commands specified. Note
that the default working directory for any container image is in the root of the cloned
repository under test. The following example uses this approach to run static verification of source code:

`ci-operator` configuration:

{{< highlight yaml >}}
tests:
- as: "vet"                 # names this test "vet"
  commands: "go vet ./..."  # declares which commands to run
  container:
    from: "src"             # runs the commands in "pipeline:src"
    clone: false            # if the repo should be cloned, true for base_images, false otherwise (but images in the "pipeline" stream already clone the repo in the "src" step)
{{< / highlight >}}

The second approach to describing tests allows for multiple containers to be chained together and describes a more
complicated execution flow between them. While this multi-stage test approach is best suited for end-to-end test suites that
require full OpenShift test clusters to be brought up and torn down, it can be used to run even simple tests. Multi-stage
tests have more features like parameters, dependencies or automated writable `$HOME` setup, so when your simple test needs
some of these, it may be useful to specify it as a multi-stage test that contains just a single step:

{{< highlight yaml >}}
tests:
- as: "vet"                     # names this test "vet"
  steps:                        # makes this a multi-stage-test
    test:                       # specifies `test` phase of the multi-stage job
    - as: "test"                # names the step in the multi-stage test
      commands: "go vet ./..."  # declares which commands to run
      from: "src"               # runs the commands in "pipeline:src"
      resources:                # sets resource quotas for the step
        requests:
          cpu: 100m
          memory: 200Mi
{{< / highlight >}}

Learn more about multi-stage tests at the [overview.](/docs/architecture/step-registry/)

## Types of Tests

### Pre-submit Tests

By default, any entry declared in the `tests` stanza of a `ci-operator` configuration file will be a pre-submit test: these
tests run before code is submitted (merged) into the target repository. Pre-submit tests are useful to give feedback to
a developer on the content of their pull request and to gate merges to the central repository. These tests will fire
when a pull request is opened, when the contents of a pull request are changed, or on demand when a user requests them.

There are few extra fields that can be configured to control if or when the test should be executed.

* `run_if_changed` Set a regex to make the job trigger only when a pull request changes a certain path in the repository (see the [upstream doc](https://docs.prow.k8s.io/docs/jobs#triggering-jobs-based-on-changes)).
* `skip_if_only_changed` Set a regex to skip triggering the job when all the changes in the pull request match (see the documentation link above).
* `always_run` Set to `false` to disable automatic triggering on every PR. This deaults to `true` (run on every PR) unless `run_if_changed` or `skip_if_only_changed` is set.
* `optional` Set to `true` to make the job not block merges.

**Note:** `run_if_changed`, `skip_if_only_changed`, and `always_run: true` are mutually exclusive.

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

**Note:** `run_if_changed` and `skip_if_only_changed` can be used the same way as in Pre-submit tests, but not `optional`.


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
|`pipeline`|  Input `images` described with `base_images` and `build_root`, images holding built artifacts (such as `src` or `bin`), output `images` as defined in `images`, and several internal images used by `ci-operator`.|
|`release`|Tags of this ImageStreams hold OpenShift release payload `images` for installing and upgrading ephemeral OpenShift clusters for testing; a tag will be present for every named release configured in releases.|
|`stable-<name>`|Images composing the `release:name` release payload, present when `<name>` is configured in `releases`.|
|`stable`|Same as above, but for the release:latest release payload. Appropriate tags are overridden using the container `images` built during the test.|

Note that the `pipeline` `ImageStream` is a namespace shared between the
configuration and `ci-operator` itself. Name conflicts can occur if the
configuration uses reserved or duplicated names. Static validation is performed
when the configuration is loaded and it will be rejected in that case.

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
