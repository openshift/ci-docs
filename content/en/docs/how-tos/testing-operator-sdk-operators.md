---
title: "Testing Operators Built With The Operator SDK and Deployed Through OLM"
description: How to configure tests for a component that is deployed as an operator through OLM.
---

`ci-operator` supports building, deploying, and testing operator bundles, whether the operator repository uses the
Operator SDK or not. This document outlines how to configure `ci-operator` to build bundle `images` and use those
in end-to-end tests.

Consult the `ci-operator` [overview](/docs/architecture/ci-operator/) and the step environment
[reference](/docs/architecture/step-registry/) for detailed descriptions of the broader test infrastructure that an
operator test is defined in.

# Building Artifacts for OLM Operators

Multiple different `images` are involved in installing and testing candidate versions of OLM-delivered operators: operand,
operator, bundle, and index `images`. Operand and operator `images` are built normally using the `images` stanza in
[`ci-operator` configuration](/docs/architecture/ci-operator/#building-container-images). The desired version of an operator
is installed by [the operator-sdk cli](https://sdk.operatorframework.io/docs/cli/) via the "bundle images".
`ci-operator` can build ephemeral versions of these `images` suitable for installation and testing, but not for production.

## Building Operator Bundles

Configuring `ci-operator` to build operator bundles from a repository is as simple as adding a new operator stanza,
specifying the bundles built from the repository, and what sorts of container image pull specification substitutions are
necessary during bundle build time. Substitutions allow for the operator manifests to refer to `images` that were built
from the repository during the test or imported from other sources. The following example builds an operator and then a
bundle. While building the bundle, the operator's pull specification in manifests are replaced with the operator version
built during the test:

`ci-operator` configuration:

{{< highlight yaml >}}
base_images:
  ubi:               # imports the UBI base image for building
    namespace: "ocp"
    name: "ubi"
    tag: "8"
  operand:           # imports the latest operand image
    namespace: "ocp"
    name: "operand"
    tag: "latest"
  operator-index:    # imports the base index for the bundle
    namespace: "ci"
    name: "redhat-operator-index"
    tag: "v4.7"
images:
- from: "ubi"
  to: "tested-operator"
operator:
  bundles: # entries create bundle images from Dockerfiles and an index containing all bundles
  - as: my-bundle
    context_dir: "path/"                  # default to .
    dockerfile_path: "to/Dockerfile"      # default to `bundle.Dockerfile`, relative to `context_dir`
    skip_building_index: false            # default to false
    base_index: "operator-index"          # deprecated
    update_graph: "replaces"              # deprecated
  substitutions:
  # replace references to the operand with the imported version (`base_images` stanza)
  - pullspec: "quay.io/openshift/operand:1.3"
    with: "pipeline:operand"
  # replace references to the operator with the built version (`images` stanza)
  - pullspec: "quay.io/openshift/tested-operator:1.3"
    with: "pipeline:tested-operator"
{{< / highlight >}}

When configuring a bundle build, five options are available:

* `as`: the image name for the built bundle. Specifying a name for the bundle image allows a multistage workflow
  directly access the bundle by name. The empty string is allowed only for backward compatibility.
* `context_dir`: base directory for the bundle image build, defaulting to the root of the source tree
* `dockerfile_path`: a path (relative to `context_dir`) to the `Dockerfile` that builds the bundle image,
  defaulting to `bundle.Dockerfile`
* `skip_building_index`: skip building the index image for this bundle. Default to false. It works only for named bundles, i.e., "as" is not empty.
* `base_index`: the base index to add the bundle to. If set, image must be specified in `base_images` or `images`. It is
used only in building an index image which is deprecated.
* `update_graph`: the update mode to use when adding the bundle to the `base_index`. Can be: `semver`, `semver-skippatch`,
  or `replaces` (default: `semver`). Requires `base_index` to be set.  It is
used only in building an index image which is deprecated.

The `operator.bundles` stanza is a list, so it is possible to build multiple bundle `images` from one repository.

## Building an Index: Deprecated

{{< alert title="Warning" color="warning" >}}
Building index images is deprecated and will be removed from ci-operator soon.
It can be skipped by setting `operator.bundles[].skip_building_index` to `true`.
See the [moving-to-file-based-catalog](/docs/how-tos/testing-operator-sdk-operators/#moving-to-file-based-catalog) section below.
{{< /alert >}}

When `ci-operator` builds at least one operator bundle from a repository, it will also automatically build an ephemeral
index image to package those bundles. Test workloads can consume the bundles via this index image. For bundles that do
not have a configured name via the `as` field, the index image is named `ci-index`. Bundles with `as` set have an index
called `ci-index-` appended by the value from `as`. The index can be exposed to test steps via the
[dependencies](/docs/architecture/ci-operator/#referring-to-images-in-tests) feature.

For example - if `operator.bundles` specifies following bundle:

```YAML
operator:
  bundles:
  - as: my-bundle
  ....
```

Then index image built by CI is called `ci-index-my-bundle` and should be specified as `OO_INDEX`.

For bundles without `base_index` configured, the ephemeral index is built from scratch and only the bundles without
`base_index` set and built in the current `ci-operator` run will be added to it, nothing else. The bundles are added to
the index using the `semver` mode, which means that the `spec.version` stanza in the CSV must be a valid semantic version.
Also, if the CSV has a `spec.replaces` stanza, it is ignored, because the index will not contain a bundle with the
replaced version.

## Validating Bundle `Builds`

Similarly to how the job generator automatically creates a `pull-ci-$ORG-$REPO-$BRANCH-images` job to test image builds
when `ci-operator` configuration has an `images` stanza, it will also `make` a separate job that builds the configured bundle
and index `images`. This job, named `pull-ci-$ORG-$REPO-$BRANCH-ci-index` for bundles without configuring `as`, or jobs named `pull-ci-$ORG-$REPO-$BRANCH-ci-index-$BUNDLE` otherwise for each bundle where `$BUNDLE` is resolved by `operator.bundles[].as`, are created only when an `operator` stanza is present. If `operator.bundles[].skip_building_index` is `true`, the job is named `pull-ci-$ORG-$REPO-$BRANCH-ci-bundle-$BUNDLE`.

# Running Tests

## Simple Operator Installation

Once `ci-operator` builds the operator bundle, they are available to be used
by the [`operator-sdk run bundle`](https://sdk.operatorframework.io/docs/cli/operator-sdk_run_bundle/) command for
deploying and testing the operator. In the following example, the bundle image is named `my-bundle` after the `operator.bundles.as` field
and can be exposed to multi-stage test workloads via the [dependencies feature](/docs/architecture/ci-operator/#referring-to-images-in-tests):

Test configuration example:
{{< highlight yaml >}}
base_images:
  operator-sdk:
    name: "4.13"
    namespace: origin
    tag: operator-sdk
...
tests:
- as: e2e-in-cluster-build
  cluster_claim:
    architecture: amd64
    cloud: aws
    owner: openshift-ci
    product: ocp
    timeout: 1h0m0s
    version: "4.12"
  steps:
    test:
    - as: install
      cli: latest
      commands: |
        oc create namespace my-namespace
        operator-sdk run bundle -n my-namespace "$OO_BUNDLE" # install my-operator
        oc wait --for condition=Available -n my-namespace deployment my-operator # wait until my-operator is ready
      dependencies:
      - env: OO_BUNDLE # expose env. var. $OO_BUNDLE to the test
        name: my-bundle # the value of $OO_BUNDLE is resolved by the pull spec of the bundle image
      from: operator-sdk # the image operator-sdk defined above in base_images
      resources:
        ...
    - as: run-test
      cli: latest
      commands: run-e2e.sh
      from: src
      resources:
        ...
    workflow: generic-claim
{{< / highlight >}}

The `OO_BUNDLE` environmental variable set for the step will contain the pull specification of the bundle image.
Note that the base index can be specified in the [`operator-sdk`](https://sdk.operatorframework.io/docs/cli/operator-sdk_run_bundle/) command.


## Operator Upgrade Testing
{{< highlight yaml >}}
base_images:
  my-bundle-init:
    name: "my-bundle"
    namespace: my-namespace
    tag: init
tests:
- as: e2e-in-cluster-build
  cluster_claim:
    architecture: amd64
    cloud: aws
    owner: openshift-ci
    product: ocp
    timeout: 1h0m0s
    version: "4.12"
  steps:
    test:
    - as: install
      cli: latest
      commands: |
        oc create namespace my-namespace
        operator-sdk run bundle -n my-namespace "$OO_BUNDLE_INIT" # install my-operator with the version before upgrading
        oc wait --for condition=Available -n my-namespace deployment my-operator # wait until my-operator is ready
      dependencies:
      - env: OO_BUNDLE_INIT
        name: my-bundle-init
    - as: upgrade
      cli: latest
      commands: |
        oc create namespace my-namespace
        operator-sdk run bundle-upgrade -n my-namespace "$OO_BUNDLE" # upgrade my-operator
        wait_until_upgrade_is_complete.sh # wait until the new version of my-operator is ready
      dependencies:
      - env: OO_BUNDLE
        name: my-bundle
      from: operator-sdk
      resources:
        ...
    workflow: generic-claim
{{< / highlight >}}

The `$OO_BUNDLE_INIT` image in the above example is resolved by [dependency](/docs/architecture/ci-operator/#referring-to-images-in-tests) of the test which is declared as a base image.
It is usually a production image released by the operator in an external registry and then [imported into the CI registry](/docs/how-tos/external-images/).
Alternatively, the pull specification from the external registry can be directly referred in the `operator-sdk` command.

# Launching Clusters with Operator built from PR via Cluster Bot

The Cluster Bot supports launching clusters and installing optional operators built from PRs onto the clusters, allowing
developers to test and interact with operator built from PRs that haven't merged yet. In order to do so, the ci-operator
configuration for the repo must contain a multistage test with a step in the `test` section called `install` that
contains a dependency on the `OO_BUNDLE` image. The example provided in the [previous
section](#simple-operator-installation) would work for Cluster Bot. If a launch command with a PR to an
optional-operator repo is made, the Cluster Bot will install a cluster as it normally would and then use the `install`
step from the ci-operator config to install the built operator.  Here is an example of a command to the Cluster Bot that
builds PR 12 from `myOrg/myRepo`:

```launch myOrg/myOperator#12```

# Building a Catalog for an Operator built from PR via Cluster Bot

In addition to being able to launch clusters with optional operators built from PRs, the Cluster Bot can also build catalogs
that can be added to existing clusters to install the operator there. This can be useful for testing an operator across many
different variants of openshift clusters without having to wait for the operator to build for each individual variant. To
build a catalog, you would use the `catalog build` command:

```catalog build myOrg/myRepo#12 myBundleName```

Note that the command requires that the bundle name is specified after the PR reference. This command will build the
operator, bundle, and catalog in the ci-operator namespace that the job runs in. The namespace can be determined by
clicking the job link that the Cluster Bot provides. The page will provide the build logs for the job and a link to the
build cluster's namespace will be among the first few lines of the log. The catalog will be tagged as `pipeline:catalog`
and the bundle will be under the `ci-chat-bot` update channel for the application. The image will be available for 7
days after the job is started.

The credentials needed to pull the catalog and other built images from the build cluster to use in another cluster are
in the `registry-pull-credentials` secret in the build namespace. For instruction on adding the credentials to a
cluster, see the openshift documentation here:
https://docs.openshift.com/container-platform/4.13/operators/admin/olm-managing-custom-catalogs.html#olm-accessing-images-private-registries_olm-managing-custom-catalogs.

# Step Registry Content for Operators

The workflows involving operators such as
the `optional-operators-ci-operator-sdk-$CLOUD` ([aws](https://steps.ci.openshift.org/workflow/optional-operators-ci-operator-sdk-aws) ,
[gcp](https://steps.ci.openshift.org/workflow/optional-operators-ci-operator-sdk-gcp),
[azure](https://steps.ci.openshift.org/workflow/optional-operators-ci-operator-sdk-azure)) family in the step registry
are alternatives to the workflow `generic-claim` in the above examples to install and test operational operators
with `operator-sdk`. Note that the step [optional-operators-operator-sdk](https://steps.ci.openshift.org/reference/optional-operators-operator-sdk)
in the `pre` chain of those workflows invokes `operator-sdk`, similarly to what the `install` step does in the `test` chain above.
Examples of these workflows can be found in [the release repo](https://github.com/openshift/release/tree/master/ci-operator/config).

Currently, the workflows such as
the `optional-operators-ci-$CLOUD` ([aws](https://steps.ci.openshift.org/workflow/optional-operators-ci-aws),
[gcp](https://steps.ci.openshift.org/workflow/optional-operators-ci-gcp),
[azure](https://steps.ci.openshift.org/workflow/optional-operators-ci-azure)) family and
the `optional-operators-ci-$CLOUD-upgrade` ([aws](https://steps.ci.openshift.org/workflow/optional-operators-ci-aws-upgrade),
[gcp](https://steps.ci.openshift.org/workflow/optional-operators-ci-gcp-upgrade),
[azure](https://steps.ci.openshift.org/workflow/optional-operators-ci-azure-upgrade)) family
still use the index image to install the operator.
The index image built by `ci-operator` is deprecated.
See the [moving-to-file-based-catalog](/docs/how-tos/testing-operator-sdk-operators/#moving-to-file-based-catalog) section below.
Those workflows are still useful when the index image is **not** built by the process described in
the [Building an Index: Deprecated](/docs/how-tos/testing-operator-sdk-operators/#building-an-index-deprecated) section above.
We encourage the test owners to migration from those workflows to the ones with "operator-sdk" for all other use cases.


# Moving to File-Based Catalog

Starting with `4.11`, the index image such as `registry.redhat.io/redhat/redhat-operator-index:v4.11` is [file-based](https://olm.operatorframework.io/docs/reference/file-based-catalogs/) which deprecates the db-based index image.
However, the method of building an index image used in `ci-opeartor` does not work with file-based index images.
As a result, `ci-operator` has to skip the process of building the index image if
it detects that the base index is file-based.
This changes the expected way of consuming the bundles built in the workload from
the index image which is used as a `CatalogSource` by OLM to the bundle image
which is used in [the `operator-sdk run bundle` command](https://sdk.operatorframework.io/docs/cli/operator-sdk_run_bundle/). The command works with the index images of both formats.

In order to run e2e tests with an index image with `4.11+`, the owners of the steps using `OO_INDEX` needs to switch to `OO_BUNDLE`.
Once all steps are migrated to `OO_BUNDLE`, `ci-operator` will remove the process of building index images.
