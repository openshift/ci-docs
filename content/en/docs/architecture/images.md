---
title: "OCP Builder Images"
draft: false
description: An overview of the building process of CI images and productized images.
---

Many components of OpenShift Container Platform 4 are tested and released as container images. When a pull request for a component repository is created, a CI job builds any container images for the component using the code in the PR. We call these images _CI images_. When OCP is released as a product, component container images are built by the ART team using OSBS. We call these images _productized images_. In order to ensure that tests for pull requests give high fidelity signal for the final product, we ensure that the build process of the _CI images_ closely mirrors that of the _productized images_. This document overviews the build processes of _CI_ and _productized_ images.

## CI Images

CI images are built [as configured on the repository for `ci-operator`](/docs/architecture/ci-operator/#building-container-images). Take `cluster-etcd-operator` (branch `release-4.6`) for an example:

```yaml
base_images:
  base:
    name: "4.6"
    namespace: ocp
    tag: base
  ocp_builder_rhel-8-golang-1.15-openshift-4.6:
    name: builder
    namespace: ocp
    tag: rhel-8-golang-1.15-openshift-4.6
images:
- dockerfile_path: Dockerfile.rhel7
  from: base
  inputs:
    ocp_builder_rhel-8-golang-1.15-openshift-4.6:
      as:
      - registry.ci.openshift.org/ocp/builder:rhel-8-golang-1.15-openshift-4.6
  to: cluster-etcd-operator
```

This build uses a build manifest at `Dockerfile.rhel7` in the repository, which looks like:

```Dockerfile
FROM registry.ci.openshift.org/ocp/builder:rhel-8-golang-1.15-openshift-4.6 AS builder
#skip other instructions
RUN make build --warn-undefined-variables

FROM registry.ci.openshift.org/ocp/4.6:base
COPY --from=builder /go/src/github.com/openshift/cluster-etcd-operator/bindata/bootkube/bootstrap-manifests /usr/share/bootkube/manifests/bootstrap-manifests/
#skip other instructions
```

When the CI image is built, the images in `FROM` directives of `Dockerfile.rhel7` are replaced according to the `ci-operator` configuration above. Entries in `images.inputs` declare a mapping of image name to pull specification for replacement. In this example:

* `registry.ci.openshift.org/ocp/builder:rhel-8-golang-1.15-openshift-4.6` is replaced by the image named `ocp_builder_rhel-8-golang-1.15-openshift-4.6`, which is imported in `base_images` from `registry.ci.openshift.org/ocp/builder:rhel-8-golang-1.15-openshift-4.6`. This is colloquially known as _the builder image_.
* `registry.ci.openshift.org/ocp/4.6:base` is replaced by the image named `base`, which is imported in `base_images` from `registry.ci.openshift.org/ocp/4.6:base`. This is colloquially known as _the base image_.

## Productized Images

Build configurations for productized images are stored in the [`ocp-build-data` repository](https://github.com/openshift/ocp-build-data). For example, [`images/cluster-etcd-operator.yml`](https://github.com/openshift/ocp-build-data/blob/openshift-4.6/images/cluster-etcd-operator.yml) in the `openshift-4.6` branch defines the build of the productized image for the 4.6 `cluster-etcd-operator`. 


```yaml
content:
  source:
    dockerfile: Dockerfile.rhel7
    git:
      branch:
        target: release-{MAJOR}.{MINOR}
      url: git@github.com:openshift-priv/cluster-etcd-operator.git
from:
  builder:
  - stream: golang
  member: openshift-enterprise-base
```

{{< alert title="Info" color="info" >}}
Productized images are built by ART from repositories in the `openshift-priv` GitHub organization. This organization holds mirrors of public repositories in the `openshift` organization while allowing for private patches for embargoed CVEs. The `openshift-priv` organization can be treated as equivalent to `openshift`. [More details](/docs/architecture/private-repositories/#openshift-priv-organization) are out of the scope of this page.
{{< /alert >}}

The above snippet defines
* where to get the build manifest: `Dockerfile.rhel7` in the `release-{MAJOR}.{MINOR}` branch of the `git@github.com:openshift-priv/cluster-etcd-operator.git` repository. Note: the variables in the branch name (`release-{MAJOR}.{MINOR}`) are resolved by [group.yml](https://github.com/openshift/ocp-build-data/blob/eadfec1553e8b8880a3b637c8ea54143431d0bcd/group.yml#L3-L5) in the same branch of `images/cluster-etcd-operator.yml`. In the example, it is `release-4.6`.
* how to replace the images in `FROM` directives of the build manifest: `registry.ci.openshift.org/ocp/builder:rhel-8-golang-1.15-openshift-4.6` is replaced by `golang` and `registry.ci.openshift.org/ocp/4.6:base` is by `openshift-enterprise-base`. `golang` is configured in [streams.yml](https://github.com/openshift/ocp-build-data/blob/eadfec1553e8b8880a3b637c8ea54143431d0bcd/streams.yml#L75) (see the following snippet) and `openshift-enterprise-base` is built out of [openshift-enterprise-base.yml](https://github.com/openshift/ocp-build-data/blob/openshift-4.6/images/openshift-enterprise-base.yml).

  ```yaml
  golang:
    image: openshift/golang-builder:rhel_8_golang_1.15
    upstream_image: registry.ci.openshift.org/ocp/builder:rhel-8-golang-1.15-openshift-{MAJOR}.{MINOR}

  golang-1.14:
    image: openshift/golang-builder:rhel_8_golang_1.14
    upstream_image: registry.ci.openshift.org/ocp/builder:rhel-8-golang-openshift-{MAJOR}.{MINOR}

  rhel:
    image: openshift/ose-base:rhel8.2.els.rhel
    upstream_image: registry.ci.openshift.org/ocp/builder:rhel-8-base-openshift-{MAJOR}.{MINOR}
  ```

  The ART team mirrors all images, such as `golang`, `golang-1.14`, and `rhel` defined in `streams.yml`, to `registry.ci.openshift.org`. The `upstream_image` field defines the reference of the mirrored image. Those images are colloquially known as _the ART equivalent images_ to ensure CI images are built from the exact same images as productized images.

## Ensuring Identical Image Builds
While the CI and productized image builds are configured in two separate places, a number of automatic processes exist to ensure that the container images built in both environments are identical. Automation enforces that the same build manifest (Dockerfile) is used to define the image in both systems. Furthermore, automation also ensures that the builder images and base images that are used in CI are identical to those used by ART when building productized container images in OSBS. Therefore, with identical container build manifests and input container images, identical builds run in CI and the productized environment.

Moreover, a developer can build the same container image locally as well if the image build tool such as `docker` or `podman` has [permission to pull the images](/docs/how-tos/use-registries-in-build-farm/#how-do-i-log-in-to-pull-images-that-require-authentication) used in the build manifest. The images in `ocp` namespace are open to all authenticated users.

## Determining Go Versions
In the above example, the build of `cluster-etcd-operator` uses Go 1.15 to build the image, as configured in `streams.yml`. When the version of Go used to build OCP changes, the ART team will modify the version configured in `ocp-build-data` centrally for the whole product at once. Then, automation will create pull requests to update `Dockerfile`s in component repositories and their CI configuration.

First, a pull request is filed to the component repository, where it modifies the `FROM` directive in `Dockerfile`. CI jobs on this pull request will reflect the use of the new Go version and repository administrators are expected to monitor the change, merging it if appropriate or landing changes as necessary to merge the change themselves. After code freeze in the release, any un-updated `FROM` entries become blocker bugs for the release. If an OCP component cannot migrate to the new toolchain version, the owner has to get the approval from the architecture team and then communicate with the ART team. In this case, the ART team will modify the builder image of the component in `ocp-build-data` and the created PR to the component repository can be closed. For example, `cluster-etcd-operator` has to use `golang-1.14`. `images/cluster-etcd-operator.yml` will has the following stanza:

  ```yaml
  from:
    builder:
    - stream: golang-1.14
  ```

Second, a pull request is filed to the `openshift/release` repository, where it modifies the CI configuration to allow builds with the new Go version to be as efficient as possible. This PR is merged automatically.

{{< alert title="Info" color="info" >}}
To avoid triggering a thundering herd of CI jobs when the Go toolchain changes centrally for OCP, pull requests to component repositories that change `FROM` entries are made slowly. It may take up to a day to complete this process for all repositories.
{{< /alert >}}

The productized images are always built with the builder images defined in ocp-build-data, no matter whether component authors merge pull requests that change `FROM` entries.

As two pull requests are created to reflect changes in the Go toolchain, it is possible for them to merge in either order. The CI system will be self-consistent and correct in either case. When only one of the changes (to `FROM` entries in the component repository and to `ci-operator` configuration in `openshift/release`) has merged, container image builds in CI will use the correct Go toolchain (defined by the builder image defined in `Dockerfile`), but will simply be less efficient than they would be when both pull requests merge. This intermediate state will have an inconsistency between the `base_images` entry in `ci-operator` configuration and the `FROM` entries in the repository but this may be ignored.

## Best Practice

* Merge the PR to the component repo as soon as possible to use the new version of Go toolchain.
* Do not manually override the replacement rules of the builder and base images in CI configuration and let automation do its job.
* Determine which base and builder images your component builds with in the `ocp-build-data` repository.

## Controlling Go Versions In Component Repositories

In general, it is strongly suggested that a repository should use the same version of Golang to build components as the centrally-controlled ART builder image uses. For users who *need* some non-standard version of Go or who must change the version of Go in the component repository while also changing other content in the repository, there is a mechanism for configuring the `build_root` in a file stored at the root of the repository. A valid `.ci-operator.yaml` file must exist in the repository and the `ci-operator` configuration must set `build_root.from_repository: true` as per [the documentation](/docs/architecture/ci-operator/#build-root-image). When transitioning a repository from central control of the Go version to in-repo control, changes must also happen to the `ocp-build-data` repository and the transition must be approved by ART.