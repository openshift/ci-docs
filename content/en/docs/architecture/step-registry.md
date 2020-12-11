---
title: "What are Multistage Tests and the Test Step Registry?"
date: 2020-10-05T10:49:33-04:00
draft: false
---

The multistage test style in the `ci-operator` is a modular test design that allows users to create new tests by combining smaller, individual test steps.
These individual steps can be put into a shared registry that other tests can access. This results in test workflows that are easier to maintain and
upgrade as multiple test workflows can share steps and don’t have to each be updated individually to fix bugs or add new features. It also reduces the
chances of a mistake when copying a feature from one test workflow to another.

To understand how the multistage tests and registry work, we must first talk about the three components of the test registry and how to use those
components to create a test:

* [Step](#step): A step is the lowest level component in the test step registry. It describes an individual test step.
* [Chain](#chain): A chain is a registry component that specifies multiple steps to be run. Any item of the chain can be either a step or another chain.
* [Workflow](#workflow): A workflow is the highest level component of the step registry. It contains three chains: pre, test, post.

## Step

A step is the lowest level component in the test registry. A step defines a base container image, the filename of the shell script to run inside the
container, the resource requests and limits for the container, and documentation for the step. Example of a step:

{{< highlight yaml >}}
ref:
  as: ipi-conf                   # name of the step
  from: base                     # image to run the commands in
  commands: ipi-conf-commands.sh # script file containing the command(s) to be run
  resources:
    requests:
      cpu: 1000m
      memory: 100Mi
  documentation: |-
    The IPI configure step generates the install-config.yaml file based on the cluster profile and optional input files.
{{< / highlight >}}

A step may be referred to in chains, workflows, and `ci-operator` configs.

### Configuring the Container Image For a Step

The container image used to run a test step can be configured in one of two ways: by referencing an image tag otherwise present
in the configuration or by explicitly referencing an image tag present on the build farm.

#### Referencing Another Configured Image

A step may execute in a container image already present in the `ci-operator` configuration file by identifying the tag with the from
configuration field. Steps should use this mechanism to determine the container image they run in when that image will vary with the
code under test. For example, the container image could have contents from the code under test (like src); similarly, the image may
need to contain a component matching the version of OpenShift used in the test (like installer). When using this configuration option,
ensure that the tag is already present in one of the following places:

* [a pipeline image](https://github.com/openshift/ci-tools/blob/master/ARCHITECTURE.md#build-graph-traversal)
* [an external image](https://github.com/openshift/ci-tools/blob/master/CONFIGURATION.md#base_images)
* [an image built by `ci-operator`](https://github.com/openshift/ci-tools/blob/master/CONFIGURATION.md#images)
* [an image imported from a release ImageStream]()

Note that static validation for this field is limited because the set of images originating from the release `ImageStream` is only known at runtime.

#### Referencing a Literal Image

A step may also be configured to use an available `ImageStreamTag` on the build farm where the test is executed by specifying the details for the tag
with the `from_image` configuration field. A step should use this option when the version of the container image to be used does not vary with the
code under test or the version of OpenShift being tested. Using the `from_image` field is synonymous with importing the image as a `base_image` and
referencing the tag with the `from` field, but allows the step definition to be entirely self-contained. The following example of a step configuration
uses this option:

{{< highlight yaml >}}
ref:
  as: ipi-conf
  from_image: # literal image tag to run the commands in
    namespace: my-namespace
    name: test-image
    tag: latest
  commands: ipi-conf-commands.sh
  resources:
    requests:
      cpu: 1000m
      memory: 100Mi
  documentation: |-
    The IPI configure step generates the install-config.yaml file based on the cluster profile and optional input files.
{{< / highlight >}}

##### Commands

The commands file must contain shell script in a shell language supported by the `shellcheck` program used to validate the commands. However,
regardless of the shell language used for the commands, the web UI will syntax highlight all commands as bash.

Note: the shell script file must follow the [naming convention](#registry-layout-and-naming-convention) described later in this help page.

### Step Execution Environment

While a step simply defines a set of commands to run in a container image, by virtue of executing within a `ci-operator` workflow, the commands
have a number of special considerations for their execution environment. The commands can expect a set of environment variables to exist that
inform them of the context in which they run. Commands in steps can communicate to other steps via a shared directory in their filesystem.


#### Available Environment Variables

The following environment variables will be available to commands in a step:

|Variable|Definition|When is it Present?|
|:---|:---|:---|
|`${OPENSHIFT_CI}`|Set to `"true"`, should be used to detect that a script is running in a `ci-operator` environment. | Always. |
|`${SHARED_DIR}`|Directory on the step's filesystem where files shared between steps can be read and written.|Always.|
|`${ARTIFACT_DIR}`|`Directory on the step's filesystem where files should be placed to persist them in the job's artifacts.`|Always.|
|`${CLUSTER_PROFILE_DIR}`|Directory on the step's filesystem where credentials and configuration from the cluster profile are stored.|When the test as defined in a `ci-operator` configuration file sets a `cluster_profile.`|
|`${KUBECONFIG}`| Path to `system:admin` credentials for the ephemeral OpenShift cluster under test.|After an ephemeral cluster has been installed.|
|`${KUBEADMIN_PASSWORD_FILE}`| Path to the kubeadmin password file.|After an ephemeral cluster has been installed.|
|`${RELEASE_IMAGE_INITIAL}`|Image pull specification for the initial release payload snapshot when the test began to run.|Always.|
|`${RELEASE_IMAGE_LATEST}`|Image pull specification for the ephemeral release payload used to install the ephemeral OpenShift cluster.|Always.|
|`${LEASED_RESOURCE}`|The name of the resource leased to grant access to cloud quota. See the [documentation.](/architecture/leases)|When the test requires a lease.|

In addition to these variables, commands will also have a number of other environment variables available to them from
[Prow](https://github.com/kubernetes/test-infra/blob/master/prow/jobs.md#job-environment-variables) as well as from
[`ci-operator`](https://github.com/openshift/ci-tools/blob/master/TEMPLATES.md#parameters-available-to-templates).
If a job is using these variables, however, it may be an indication that some level of encapsulation has been broken and that a more
straightforward approach exists to achieve the same outcome.

[Parameters](#parameters) declared by steps and set by tests will also be available as environment variables.

#### Sharing Data Between Steps

Steps can communicate between each other by using a shared directory on their filesystems. This directory is available for test processes via
`${SHARED_DIR}`. When the process finishes executing, the contents of that directory will be copied and will be available to following steps.
New data will overwrite previous data, absent files will be removed. The underlying mechanism for this uses Kubernetes concepts; therefore,
the total amount of data that can be shared is capped at 1MB and only a flat file structure is permissible: no sub-directories are supported.
Steps are more commonly expected to communicate between each other by using state in the OpenShift cluster under test. For instance, if a step
installs some components or changes configuration, a later step could check for that as a pre-condition by using `oc` or the API to view the
cluster's configuration.

The mechanism that makes this data sharing possible incurs a non-trivial
overhead, directly reflected in the execution time of the test.  Simple steps
that only require a read-only, private view of the shared directory that is not
modified can be configured with the `readonly_shared_dir` field set to `true`.
Doing so will likely result in tests with a significantly shorter and more
consistent execution time.

#### A Note on `$KUBECONFIG`

In the default execution environment, commands run in steps will be given the `$KUBECONFIG` environment variable to allow them to interact with
the ephemeral cluster that was created for testing. It is required that any steps which execute a cluster installation publish the resulting
configuration file to `$SHARED_DIR/kubeconfig` to allow the `ci-operator` to correctly propagate this configuration to subsequent steps.

#### Exposing Artifacts

Steps can commit artifacts to the output of a job by placing files at the `${ARTIFACT_DIR}`. These artifacts will be available for a
job under `artifacts/job-name/step-name/`. The logs of each container in a step will also be present at that location.

#### Injecting Custom Credentials

Steps can inject custom credentials by adding configuration that identifies which secrets hold the credentials and where the data should be mounted
in the step. For instance, to mount the my-data secret into the step's filesystem at `/var/run/my-data`, a step could be configured in a literal
`ci-operator` configuration, or in the step's configuration in the registry in the following manner:

Registry step configuration:

{{< highlight yaml >}}
ref:
  as: step
  from: base
  commands: step-commands.sh
  resources:
    requests:
      cpu: 1000m
      memory: 100Mi
  credentials:
  - namespace: test-credentials # this entry injects the custom credential
    name: my-data
    mount_path: /var/run/my-data
  documentation: |-
    The step runs with custom credentials injected.
{{< / highlight >}}

**Note that access to read these secrets from the namespace configured must be granted separately from the configuration being added to a step.
By default, only secrets in the `test-credentials` namespace will be available for mounting into test steps. Please follow the secret-mirroring
[documentation](https://github.com/openshift/release/blob/master/core-services/secret-mirroring/README.md) to set up a custom secret in that namespace**

#### Injecting the `oc` CLI

Steps can make the `oc` CLI available to their commands by adding the `cli` configuration item to the test step, specifying which OpenShift
release the CLI should be sourced from. For example, the following configuration pulls in a CentOS image, a custom OCP release and runs a test
where the release's CLI is injected to the test step.

{{< highlight yaml >}}
base_images:
  os: # import an image and call it "os"
    name: centos
    namespace: openshift
    tag: '7'
releases:
  custom: # import a release and call it "custom"
    candidate:
      product: okd
      version: "4.3"
tests:
  - as: with-cli
    steps:
      test:
        - as: use-cli
          commands: oc adm policy add-role-to-user --help
          from: os    # use the "os" image for running the test
          cli: custom # allow the CLI from the "custom" release to be available
          resources:
            requests:
              cpu: 100m
              memory: 200Mi
{{< /highlight >}}

If a test configuration uses `tag_specification` to import an OCP release, the `"initial"` and `"latest"` releases will be available for
sourcing the CLI.

## Chain

A chain is a registry component that specifies multiple registry components to be run. Components are run in the order that they are written.
Components specified by a chain can be either steps and other chains. Example of a chain:

{{< highlight yaml >}}
chain:
  as: ipi-deprovision                # name of this chain
  steps:
  - chain: gather                    # a chain being used as a step in another chain
  - ref: ipi-deprovision-deprovision # a step being used as a step in a chain
  documentation: |-
    The IPI deprovision step chain contains all the individual steps necessary to deprovision an OpenShift cluster.
{{< / highlight >}}

## Workflow

A workflow is the highest level component of the step registry. It is almost identical to the syntax of the `ci-operator` configuration for
multistage tests and defines an entire test from start to finish. It has four basic components: a `cluster_profile` string
(eg: `aws`, `azure4`, `gcp`), and three chains: `pre`, `test`, and `post`. The `pre` chain is intended to be used to set up a testing environment
(such as creating a test cluster), the `test` chain is intended to contain all tests that a job wants to run, and the `post` chain is intended
to be used to clean up any resources created/used by the test. If a step in `pre` or `test` fails, all pending `pre` and `test` steps are skipped
and all `post` steps are run to ensure that resources are properly cleaned up. This is an example of a workflow configuration

{{< highlight yaml  >}}
workflow:
  as: origin-e2e             # name of workflow
  steps:
    pre:                     # "pre" chain used to set up test environment
    - ref: ipi-conf
    - chain: ipi-install
    test:                    # "test" chain containing actual tests to be run
    - ref: origin-e2e-test
    post:                    # "post" chain containing cleanup steps
    - chain: ipi-deprovision
  documentation: |-
    The Origin E2E workflow executes the common end-to-end test suite.
{{< / highlight >}}

## `ci-operator` Test Configuration

The `ci-operator` test configuration syntax for multistage tests is very similar to the registry workflow syntax. The main differences are that
the `ci-operator` configuration does not have a documentation field, and the ci-operator configuration can specify a workflow to use. Also,
the `cluster_profile`, `pre`, `test`, and `post` fields are under a steps field instead of workflow. Here is an example of the `tests`
section of a `ci-operator` configuration using the multistage test design:

{{< highlight yaml >}}
tests:
- as: e2e-steps # test name
  steps:
    cluster_profile: aws
    workflow: origin-e2e
{{< / highlight >}}

In this example, the `ci-operator` configuration simply specifies the desired cluster profile and the `origin-e2e` workflow shown in the
example for the [`Workflow`](#workflow) section above.

Since the `ci-operator` configuration and workflows share the same fields, it is possible to override fields specified in a workflow.
In cases where both the workflow and a `ci-operator` configuration specify the same field, the `ci-operator` configuration’s field has
priority (i.e. the value from the `ci-operator` configuration is used).

Example of a `ci-operator` configuration that overrides a workflow field:

{{< highlight yaml >}}
tests:
- as: e2e-steps # test name
  steps:
    cluster_profile: aws
    workflow: origin-e2e
    test:                     # this chain will be run for "test" instead of the one in the origin-e2e workflow
    - ref: origin-e2e-minimal
{{< / highlight >}}

The configuration can also override a workflow field with a [full literal step](#step) (not only a reference to a shared step):

{{< highlight yaml >}}
tests:
- as: e2e-steps # test name
  steps:
    cluster_profile: aws
    workflow: origin-e2e
    test:                     # this chain will be run for "test" instead of the one in the origin-e2e workflow
    - as: e2e-test
      commands: make e2e
      from: src
      resources:
        requests:
          cpu: 100m
          memory: 200Mi
{{< / highlight >}}

## Options to Change Control Flow

### Skipping `post` Steps On Success

`ci-operator` can be configured to skip some or all `post` steps when all `test` steps pass. Skipping a `post` step when all tests have
passed may be useful to skip gathering artifacts and save some time at the end of the multistage test. In order to allow steps to be
skipped in a test, the `allow_skip_on_success` field must be set in the `steps` configuration. Individual `post` steps opt into being
skipped by setting the `optional_on_success` field. This is an example:

{{< highlight yaml >}}
tests:
- as: e2e-steps # test name
  steps:
    allow_skip_on_success: true      # allows steps to be skipped in this test
    test:
    - as: successful-test-step
      commands: echo Success
      from: os
      resources:
        requests:
          cpu: 100m
          memory: 200Mi
    post:
    - as: gather-must-gather         # this step will be skipped as the successful-test-step passes
      optional_on_success: true
      from: cli
      commands: gather-must-gather-commands.sh
      resources:
        requests:
          cpu: 300m
          memory: 300Mi
{{< / highlight >}}

### Marking `post` Steps Best-Effort

`ci-operator` can be configured to run `post` steps in best-effort mode, meaning that failures in these steps will not cause the overall
test to fail. Running a `post`-step in best-effort mode may be useful when the step is used to gather debugging information or otherwise
is useful but should not cause the job to fail if it does not complete correctly. In order to run `post` steps in best-effort mode, the
`best_effort` field must be set to `true` in the configuration for an individual step and the `allow_best_effort_post_steps` setting must
be set at the workflow or job level. For example:

{{< highlight yaml >}}
tests:
- as: e2e-steps # test name
  steps:
  allow_best_effort_post_steps: true      # allows steps to be run best-effort in this test
    test:
    - as: successful-test-step
      commands: echo Success
      from: os
      resources:
        requests:
          cpu: 100m
          memory: 200Mi
    post:
    - as: gather-must-gather         # this step will be ignored if it fails
      best_effort: true
      from: cli
      commands: gather-must-gather-commands.sh
      resources:
        requests:
          cpu: 300m
          memory: 300Mi
{{< / highlight >}}

## Registry Layout and Naming Convention

To prevent naming collisions between all the registry components, the step registry has a very strict naming scheme and directory layout.
First, all components have a prefix determined by the directory structure, similar to how the `ci-operator` configs do. The prefix is
the relative directory path with all `/` characters changed to `-`. For example, a file under the `ipi/install/conf` directory would have
as prefix of `ipi-install-conf`. If there is a `workflow`, `chain`, or `step` in that directory, the as field for that component
would need to be the same as the prefix. Further, only one of `step`, `chain`, or workflow can be in a subdirectory
(otherwise there would be a name conflict).

After the prefix, we apply a suffix based on what the file is defining. These are the suffixes for the four file types that exist in
the registry:

* Step: `-ref.yaml`
* Step command script: `-commands.sh`
* Chain: `-chain.yaml`
* Workflow: `-workflow.yaml`

Continuing the example above, a step in the `ipi/install/conf` subdirectory would have a filename of `ipi-install-conf-ref.yaml` and the
command would be `ipi-install-conf-commands.sh`.

Other files that are allowed in the step registry but are not used for testing are `OWNERS` files and files that end in `.md`.

## Parameters

Steps, chains, and workflows can declare parameters in their `env` section. These can then be set to different values to generate tests
that have small variations between them. For example:

{{< highlight yaml >}}
ref:
  as: openshift-e2e-test
  from: tests
  commands: openshift-e2e-test-commands.sh
  resources:
    requests:
      cpu: "3"
      memory: 600Mi
    limits:
      memory: 4Gi
  env:
  - name: OPENSHIFT_TEST_SUITE
{{< / highlight >}}

A test that utilzes this step must give a value to the `OPENSHIFT_TEST_SUITE` parameter, which will be available as an environment
variable when it is executed. Different tests can be generated by setting different values, which can make generating simple
variations easier. More complex combinations are encouraged to use separate steps instead.

Each item in the `env` section consists of the following fields:

* `name`: environment variable name
* `default` (optional): the value assigned if no other node in the hierarchy provides one (described below)
* `documentation` (optional): a textual description of the parameter

### Hierarchical Propagation

Environment variables can be added to chains and workflows in the registry. These variables will be propagated down the hierarchy.
That is: a variable in the env section of a chain will propagate to all of its sub-chains and sub-steps, a variable in the env
section of a workflow will propagate to all of its stages.

{{< highlight yaml >}}
chain:
  as: some-chain
  steps:
  - ref: some-step # TEST_VARIABLE will propagate to this step
  - chain: other-chain # TEST_VARIABLE will propagate to all elements in this chain
  env:
  - name: TEST_VARIABLE
    default: test value
{{< / highlight >}}

### Required Parameters

Any variable that is not assigned a default value is considered required and must be set at a higher level of the hierarchy. When
the configuration is resolved, tests that do not satisfy this requirement will generate a validation failure.

Step definition:

{{< highlight yaml >}}
ref:
  as: some-ref
  # …
  env:
  - name: REQUIRED_VARIABLE # automatically considered required
{{< / highlight >}}

`ci-operator` configuration:

{{< highlight yaml >}}
tests:
- as: valid
  steps:
    env:
      REQUIRED_VARIABLE: value
    test:
    - some-ref
- as: invalid
  steps:
    test:
    - some-ref
{{< / highlight >}}

## Leases

Tests can acquire leases for cloud quota (described in
[this page](./quota-and-leases)) in two different ways:

### Implicit Lease Configuration with `cluster_profile`

A test that declares a `cluster_profile` implicitly adds a requirement for a
lease.  The type of lease is pre-configured and determined automatically based
on the cluster profile.

{{< highlight yaml >}}
tests:
- as: implicit-lease
  steps:
    cluster_profile: aws
    test:
    - # …
{{< / highlight >}}

### Explicit Lease Configuration

Tests that have more complex requirements can configure lease acquisition
explicitly with a `leases` section.  Each entry should have the following
fields:

- `resource_type`: one of the resource types declared in the `boskos`
  configuration.
- `env` name of the environment variable through which the name of the leased
  resource will be exposed to the test.  If a `count` is specified, the
  variable will contain multiple names separated by spaces.
- `count`: an optional number of resources of the specified type to lease.
  Defaults to `1`.

{{< highlight yaml >}}
tests:
- as: explicit-leases
  steps:
    leases:
    - resource_type: aws-quota-slice
      env: AWS_LEASED_RESOURCE
    - resource_type: gcp-quota-slice
      env: GCP_LEASED_RESOURCES
      count: 3
    # …
{{< / highlight >}}

Every step in the test will have access to the `AWS_LEASED_RESOURCE` and
`GCP_LEASED_RESOURCES` environment variables, which will contain the name of the
resource(s) acquired.  `AWS_LEASED_RESOURCE` will contain a single resource
name, while `GCP_LEASED_RESOURCES` will contain the name of the three resources
separated by space, as described above.

Leases can be configured in references and chains.  Contrary to parameters,
lease configuration applies to the test as a whole: all declared leases will be
acquired before the execution of the steps, and are held throughout its
entirety.  The environment variable name in each lease configuration entry must
be unique for the entire test.

{{< highlight yaml >}}
tests:
- as: lease-hierarchy
  steps:
    leases:
    - resource_type: aws-quota-slice
      env: AWS_LEASED_RESOURCE
    test:
    - as: test
      leases:
      # overriden by the parent section
      - resource_type: aws-quota-slice
        env: AWS_LEASED_RESOURCE
      # added to the parent section
      - resource_type: gcp-quota-slice
        env: GCP_LEASED_RESOURCE
      # …
{{< / highlight >}}
