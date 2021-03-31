---
title: "Testing Operators Built With The Operator SDK and Deployed Through OLM"
description: How to configure tests for a component that is deployed as an operator through OLM.
---

`ci-operator` supports building, deploying, and testing operator bundles, whether the operator repository uses the
Operator SDK or not. This document outlines how to configure `ci-operator` to build bundle and index `images` and use those
in end-to-end tests.

Consult the `ci-operator` [overview](/docs/architecture/ci-operator/) and the step environment
[reference](/docs/architecture/step-registry/) for detailed descriptions of the broader test infrastructure that an
operator test is defined in.

# Building Artifacts for OLM Operators

Multiple different `images` are involved in installing and testing candidate versions of OLM-delivered operators: operand,
operator, bundle, and index `images`. Operand and operator `images` are built normally using the `images` stanza in
[`ci-operator` configuration](/docs/architecture/ci-operator/#building-container-images). OLM uses bundle and index `images`
to install the desired version of an operator. `ci-operator` can build ephemeral versions of these `images` suitable for
installation and testing, but not for production.

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
  - as: my-bundle                         # optional
    dockerfile_path: "path/to/Dockerfile" # defaults to `bundle.Dockerfile`
    context_dir: "path/"                  # defaults to .
    base_index: "operator-index"          # optional
    update_graph: "replaces"              # defaults to `semver`
  substitutions:
  # replace references to the operand with the imported version (`base_images` stanza)
  - pullspec: "quay.io/openshift/operand:1.3"
    with: "stable:operand"
  # replace references to the operator with the built version (`images` stanza)
  - pullspec: "quay.io/openshift/tested-operator:1.3"
    with: "pipeline:tested-operator"
{{< / highlight >}}

When configuring a bundle build, five options are available:

* `as`: the image name for the built bundle. Specifying a name for the bundle image allows a multistage workflow
  directly access the bundle by name. If not provided, a dynamically generated name will be created for the bundle
  and the bundle will only be accessible via the default index image (`ci-index`).
* `dockerfile_path`: a path to the `Dockerfile` that builds the bundle image, defaulting to `bundle.Dockerfile`
* `context_dir`: base directory for the bundle image build, defaulting to the root of the source tree
* `base_index`: the base index to add the bundle to. If set, image must be specified in `base_images` or `images`.
  If unspecified, the bundle will be added to an empty index. Requires `as` to be set.
* `update_graph`: the update mode to use when adding the bundle to the `base_index`. Can be: `semver`, `semver-skippatch`,
  or `replaces` (default: `semver`). Requires `base_index` to be set.

The `operator.bundles` stanza is a list, so it is possible to build multiple bundle `images` from one repository.

## Building an Index

When `ci-operator` builds at least one operator bundle from a repository, it will also automatically build an ephemeral
index image to package those bundles. Test workloads should consume the bundles via this index image. For bundles that do
not have a configured name via the `as` field, the index image is named `ci-index`. Bundles with `as` set have an index
called `ci-index-` appended by the value from `as`. The index can be exposed to test steps via the
[dependencies](/docs/architecture/ci-operator/#referring-to-images-in-tests) feature.

For bundles without `base_index` configured, the ephemeral index is built from scratch and only the bundles without
`base_index` set and built in the current `ci-operator` run will be added to it, nothing else. The bundles are added to
the index using the `semver` mode, which means that the `spec.version` stanza in the CSV must be a valid semantic version.
Also, if the CSV has a `spec.replaces` stanza, it is ignored, because the index will not contain a bundle with the
replaced version.

## Validating Bundle and Index `Builds`

Similarly to how the job generator automatically creates a `pull-ci-$ORG-$REPO-$BRANCH-images` job to test image builds
when `ci-operator` configuration has an `images` stanza, it will also `make` a separate job that builds the configured bundle
and index `images`. This job, named `pull-ci-$ORG-$REPO-$BRANCH-ci-index`, is created only when an `operator` stanza is
present.

# Running Tests

Once `ci-operator` builds the operator bundle and index, they are available to be used as a `CatalogSource` by OLM for
deploying and testing the operator. The default index image is called `ci-index` and can be exposed to multi-stage test
workloads via the [dependencies feature](/docs/architecture/ci-operator/#referring-to-images-in-tests):

Step configuration example:
{{< highlight yaml >}}
ref:
  as: "step-consuming-ci-index"
  from: "cli"
  commands: "step-consuming-ci-index.sh"
  dependencies:
  - env: "OO_INDEX"
    name: "ci-index"
  documentation: ...
{{< / highlight >}}

Any test workflow involving such step will require `ci-operator` to build the index image before it executes the workflow.
The `OO_INDEX` environmental variable set for the step will contain the pull specification of the index image. For tests with
a named bundle, the correct index image can be configured via the `dependencies` field in the test's ci-operator config. See
the [Simple Operator Installation](/docs/how-tos/testing-operator-sdk-operators#simple-operator-installation) section below.

# Step Registry Content for Operators

The step registry contains several generic steps and workflows that implement the common operations involving operators.
We encourage operator repositories to consider using (and possibly improving) these shared steps and workflows over
implementing their own from scratch.

## Simple Operator Installation

The `optional-operators-ci-$CLOUD` ([aws](https://steps.ci.openshift.org/workflow/optional-operators-ci-aws) ,
[gcp](https://steps.ci.openshift.org/workflow/optional-operators-ci-gcp),
[azure](https://steps.ci.openshift.org/workflow/optional-operators-ci-azure)) family of workflows take the following
steps to set up the test environment:

* Deploy an ephemeral OpenShift cluster to test against
* Create a `Namespace` to install into
* Create an `OperatorGroup` and `CatalogSource` (referring to built index) to configure OLM
* Create a `Subscription` for the operator under test
* Wait for the operator under test to install and deploy

These workflows enhance the general installation workflows (like
[ipi-aws](https://steps.ci.openshift.org/workflow/ipi-aws)) with an additional
[optional-operators-ci-subscribe](https://steps.ci.openshift.org/reference/optional-operators-ci-subscribe) step. Tests
using these workflows need to provide the following parameters:

|Parameter|Description|
|:---|:---|
|`OO_PACKAGE`|The name of the operator package to be installed.|
|`OO_CHANNEL`|The name of the operator channel to track.|
|`OO_INSTALL_NAMESPACE`|The namespace into which the operator and catalog will be installed. Special, default value `!create` means that a new namespace will be created.|
|`OO_TARGET_NAMESPACES`|A comma-separated list of namespaces the operator will target. Special, default value `!all` means that all namespaces will be targeted. If no `OperatorGroup` exists in `$OO_INSTALL_NAMESPACE`, a new one will be created with its target namespaces set to `$OO_TARGET_NAMESPACES`. Otherwise, the `existing OperatorGroup`'s target namespace set will be replaced. The special value `!install` will set the target namespace to the operator's installation namespace.|


The combination of `OO_INSTALL_NAMESPACE` and `OO_TARGET_NAMESPACES `values determines the `InstallMode` when installing the
operator. The default `InstallMode` is `AllNamespaces` (the operator will be installed into a newly created namespace of a
random name, targeting all namespaces). For named bundles, the index dependency can also be configured in the test's config.

A user-provided test can expect to have `${KUBECONFIG}` set, with administrative privileges, and for the operator under
test to be fully deployed at the time that the test begins. The following example runs a test in this manner

`ci-operator` configuration:
{{< highlight yaml >}}
tests:
- as: "operator-e2e"
  steps:
    workflow: "optional-operators-ci-aws"
    cluster_profile: "aws"
    env:
      OO_CHANNEL: "alpha"
      OO_INSTALL_NAMESPACE: "myoperator-test-namespace"
      OO_PACKAGE: "myoperator"
      OO_TARGET_NAMESPACES: '!install'
    dependencies:
      OO_INDEX: "ci-index-my-bundle" # if the bundle being tested is named, update the dependency to match
    test:
    - as: "e2e"
      from: "src"               # the end-to-end tests run in the source repository
      commands: "make test-e2e" # the commands to run end-to-end tests
      resources:
        requests:
          cpu: 100m
          memory: 200Mi
{{< / highlight >}}

## Operator Upgrade Testing

The `optional-operators-ci-$CLOUD-upgrade` ([aws](https://steps.ci.openshift.org/workflow/optional-operators-ci-aws-upgrade) ,
[gcp](https://steps.ci.openshift.org/workflow/optional-operators-ci-gcp-upgrade),
[azure](https://steps.ci.openshift.org/workflow/optional-operators-ci-azure-upgrade)) family of workflows take the same steps as
the simple operator installation described above, but specify a different operator to install initially and then perform an upgrade
from the initial operator/bundle to the newly built operator/bundle.

These workflows enhance the simple operator installation workflows (like
[optional-operators-ci-aws](https://steps.ci.openshift.org/workflow/optional-operators-ci-aws)) with an additional
[optional-operators-ci-upgrade](https://steps.ci.openshift.org/reference/optional-operators-ci-upgrade) step. Tests
using these workflows need to provide the parameters specified for the simple operator installation tests plus the following:

|Parameter|Description|
|:---|:---|
|`OO_INITIAL_CSV`|The name of initial version of the operator CSV to install.|
|`OO_INITIAL_CHANNEL`|The name of the channel the initial CSV is in.|
|`OO_LATEST_CSV`|The name of the CSV being upgraded to.|

The following example runs a test that installs an initial version of an operator and then upgrades before performing a functional tests.

`ci-operator` configuration:
{{< highlight yaml >}}
tests:
- as: "operator-e2e-upgrade"
  steps:
    workflow: "optional-operators-ci-aws-upgrade"
    cluster_profile: "aws"
    env:
      OO_CHANNEL: "alpha"
      OO_INSTALL_NAMESPACE: "myoperator-test-namespace"
      OO_PACKAGE: "myoperator"
      OO_TARGET_NAMESPACES: '!install'
      OO_INITIAL_CSV: "myoperator.v1.1.2"
      OO_INITIAL_CHANNEL: "v1.1"
      OO_LATEST_CSV: "myoperator.v1.2.0"
    dependencies:
      OO_INDEX: "ci-index-my-bundle" # operator upgrade tests require bundles with a base_index, and thus must be named
    test:
    - as: "e2e"
      from: "src"               # the end-to-end tests run in the source repository
      commands: "make test-e2e" # the commands to run end-to-end tests
      resources:
        requests:
          cpu: 100m
          memory: 200Mi
{{< / highlight >}}
