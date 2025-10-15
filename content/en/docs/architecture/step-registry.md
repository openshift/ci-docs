---
title: "Multi-Stage Tests and the Test Step Registry"
description: An overview of how multi-stage tests and the step registry make complex, DRY CI job definitions possible.
---

The multistage test style in the `ci-operator` is a modular test design that allows users to create new tests by combining smaller, individual test steps.
These individual steps can be put into a shared registry that other tests can access. This results in test workflows that are easier to maintain and
upgrade as multiple test workflows can share steps and don’t have to each be updated individually to fix bugs or add new features. It also reduces the
chances of a mistake when copying a feature from one test workflow to another.

The current step registry is available for browsing [here](https://steps.ci.openshift.org/).

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

* [a pipeline image](/docs/architecture/ci-operator/#referencing-images)
* [an external image](/docs/architecture/ci-operator/#configuring-inputs)
* [an image built by `ci-operator`](/docs/architecture/ci-operator/#building-artifacts)
* [an image imported from a release ImageStream](/docs/architecture/ci-operator/#referencing-images)

{{< alert title="Note" color="info" >}}
Static validation for this field is limited because the set of images originating from the release `ImageStream` is only known at runtime.
{{< /alert >}}

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

### Commands

The commands file must contain shell script in a shell language supported by the `shellcheck` program used to validate the commands. However,
regardless of the shell language used for the commands, the web UI will syntax highlight all commands as bash.

Note: the shell script file must follow the [naming convention](#registry-layout-and-naming-convention) described later in this help page.

### Resources

A step accepts resource `requests` and `limits` for its container's configuration.
There is more information about resources [here](https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/).

{{< alert title="Warning" color="warning" >}}
The resources for the pod running a test step might be overwritten by
CI automation based on the historical data of the job and the limited
hardware capability.
{{< /alert >}}

#### Configuring a Custom shm-size

If it is necessary to increase the shared memory size (the default is 64m) of a Multi-Stage test, then the `resources` can be modified to add
the `ci-operator.openshift.io/shm` resource size. Note that this will not be propagated to the container itself,
but will simply resize the `dshm` volume.

{{< highlight yaml >}}
resources:
  requests:
    ci-operator.openshift.io/shm: 2G
  limits:
    ci-operator.openshift.io/shm: 2G
{{< / highlight >}}

{{< alert title="Note" color="info" >}}
The `limits` and `requests` must be set to the *same* amount
{{< /alert >}}

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
|`${ARTIFACT_DIR}`|Directory on the step's filesystem where files should be placed to persist them in the job's artifacts.|Always.|
|`${CLUSTER_PROFILE_DIR}`|Directory on the step's filesystem where credentials and configuration from the cluster profile are stored.|When the test as defined in a `ci-operator` configuration file sets a `cluster_profile.`|
|`${KUBECONFIG}`| Path to `system:admin` credentials for the ephemeral OpenShift cluster under test.|After an ephemeral cluster has been installed.|
|`${KUBEADMIN_PASSWORD_FILE}`| Path to the kubeadmin password file.|After an ephemeral cluster has been installed.|
|`${RELEASE_IMAGE_INITIAL}`|Image pull specification for the initial release payload snapshot when the test began to run.|When the test imports or builds an `initial` release. See the [docs](/docs/architecture/ci-operator/#describing-inclusion-in-an-openshift-release).|
|`${RELEASE_IMAGE_LATEST}`|Image pull specification for the ephemeral release payload used to install the ephemeral OpenShift cluster.|When the test imports or builds a `latest` release. . See the [docs](/docs/architecture/ci-operator/#describing-inclusion-in-an-openshift-release).|
|`${LEASED_RESOURCE}`|The name of the resource leased to grant access to cloud quota. See [below](#leases).|When the test requires a lease.|
|`${IMAGE_FORMAT}`|The registry location from which images built or imported for this test may be pulled.|Always except [claiming a cluster](/docs/architecture/ci-operator/#testing-with-a-cluster-from-a-cluster-pool). Deprecated, use [dependencies](/docs/architecture/ci-operator/#referencing-images) to provide tests with fully resolved pull specifications of images.|

In addition to these variables, commands will also have a number of other environment variables available to them from
`ci-operator` through [leases](#leases), [parameters](#parameters) and [dependencies](/docs/architecture/ci-operator/#referencing-images).
A further set of environment variables are made available by [Prow](https://docs.prow.k8s.io/docs/jobs#job-environment-variables);
if a job is using these variables, however, it may be an indication that some level of encapsulation has been broken and that a more
straightforward approach exists to achieve the same outcome.

#### Sharing Data Between Steps

Steps can communicate between each other by using a shared directory on their filesystems. This directory is available for test processes via
`${SHARED_DIR}`. When the process finishes executing, the contents of that directory will be copied and will be available to following steps.
New data will overwrite previous data, absent files will be removed. The underlying mechanism for this uses Kubernetes concepts; therefore,
the total amount of data that can be shared is capped at 1MB and only a flat file structure is permissible: no sub-directories are supported.
Steps are more commonly expected to communicate between each other by using state in the OpenShift cluster under test. For instance, if a step
installs some components or changes configuration, a later step could check for that as a pre-condition by using `oc` or the API to view the
cluster's configuration.

{{< alert title="Note" color="info" >}}
The `${SHARED_DIR}` may _only_ contain files. No directories or nested structures are supported.
{{< /alert >}}

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

{{< alert title="Warning" color="warning" >}}
Access to read these secrets from the namespace configured must be granted separately from the configuration being added to a step.
By default, only secrets in the `test-credentials` namespace will be available for mounting into test steps. Please follow the secret-management
[documentation](/docs/how-tos/adding-a-new-secret-to-ci/#add-a-new-secret) to set up a custom secret in that namespace.
{{< /alert >}}

#### Injecting the `oc` CLI

Steps can make the `oc` CLI available to their commands by adding the `cli` configuration item to the test step, specifying which OpenShift
release the CLI should be sourced from. The `ci-operator` configuration must use or `releases` to configure which
release payloads the `oc` CLI may be injected from. For example, the following configuration pulls in a CentOS image, configures a custom OCP
release using `releases` and runs a test where the release's CLI is injected to the test step.

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

#### Opting Out of `ServiceAccount` Credentials

By default, the `Pod` in which a step runs will have `ServiceAccount` credentials mounted in order to update the `$SHARED_DIR` and expose the
`$KUBECONFIG`. If your test does not use either of these features, and the presence of in-cluster configuration is not desired, this may be
turned off:

{{< highlight yaml >}}
tests:
  - as: without-serviceaccount
    steps:
      test:
        - as: no-in-cluster-config
          commands: test -f /var/run/secrets/kubernetes.io/serviceaccount/token # will fail
          no_kubeconfig: true # opt out of a service-account and $KUBECONFIG
          from: os
          resources:
            requests:
              cpu: 100m
              memory: 200Mi
{{< /highlight >}}

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
In cases where both the workflow and a `ci-operator` configuration specify the same field, the `ci-operator` configuration's field has
priority (i.e. the value from the `ci-operator` configuration is used).  List and mapping fields have a few special rules, described
in the [hierarchical propagation](#hierarchical-propagation) section.

{{< alert title="Important" color="info" >}}
**Restriction on `pre` and `post` Step Overrides**: By default, tests cannot override `pre` and `post` steps defined in workflows to prevent accidental resource leaks. If you need to override these steps, you must explicitly set `allow_pre_post_step_overrides: true`. See [Overriding pre and post Step Definitions](#overriding-pre-and-post-step-definitions) for more details.
{{< /alert >}}

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

### Overriding `pre` and `post` Step Definitions

By default, `ci-operator` prevents tests from overriding the `pre` and `post` step definitions that are specified in a workflow. This is a safety measure to prevent accidental resource leaks that could occur when setup steps (in `pre`) or cleanup steps (in `post`) are unintentionally modified or removed.

To explicitly allow overriding of `pre` and `post` steps when using a workflow, the `allow_pre_post_step_overrides` field must be set to `true` in the test configuration. Without this flag, attempts to override `pre` or `post` steps will result in a validation error.

{{< alert title="Warning" color="warning" >}}
Overriding `pre` or `post` steps can lead to resource leaks if setup or cleanup operations are not performed correctly. Only override these steps if you fully understand the implications and have verified that all necessary setup and cleanup operations are still performed.
{{< /alert >}}

Example of allowing `pre` and `post` step overrides:

{{< highlight yaml >}}
tests:
- as: e2e-custom-setup
  steps:
    allow_pre_post_step_overrides: true  # explicitly allow overriding pre/post steps
    cluster_profile: aws
    workflow: origin-e2e
    pre:                                  # this overrides the pre steps from the workflow
    - ref: custom-cluster-setup
    post:                                 # this overrides the post steps from the workflow
    - ref: custom-cluster-cleanup
{{< / highlight >}}

Without the `allow_pre_post_step_overrides: true` setting, the above configuration would fail validation. When this flag is set to `true`, the test takes full responsibility for ensuring proper resource management.

#### Examples

**Attempting to override without the flag (this will fail validation):**

{{< highlight yaml >}}
tests:
- as: e2e-bad-example
  steps:
    cluster_profile: aws
    workflow: ipi-aws
    post:                    # ERROR: This will fail validation
    - ref: custom-cleanup    # because allow_pre_post_step_overrides is not set
{{< / highlight >}}

**Correctly overriding with explicit permission:**

{{< highlight yaml >}}
tests:
- as: e2e-good-example
  steps:
    allow_pre_post_step_overrides: true
    cluster_profile: aws
    workflow: ipi-aws
    pre:                     # OK: Overrides pre steps from ipi-aws workflow
    - ref: custom-pre-setup
    - chain: modified-install
    post:                    # OK: Overrides post steps from ipi-aws workflow  
    - ref: gather-custom-artifacts
    - chain: modified-deprovision
{{< / highlight >}}

**Overriding only test steps (no flag needed):**

{{< highlight yaml >}}
tests:
- as: e2e-test-only
  steps:
    cluster_profile: aws
    workflow: ipi-aws
    test:                    # OK: test step overrides don't require the flag
    - ref: custom-e2e-test
{{< / highlight >}}

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

Steps and chains can declare parameters they expect to consume in their `env`
section. These can then be set to different values to generate tests that have
small variations between them. Different tests can be generated by setting
different values, which can make generating simple variations easier. More
complex combinations are encouraged to use separate steps instead.

{{< alert title="Note" color="info" >}}
Parameters are meant to be used to create different test variations. If a simple
environment variable that is uniform across all tests is all that is required,
it can be declared directly in the test script.
{{< /alert >}}

In the context of the step registry, parameters are used in two distinct
scenarios, described in the following sections: declared by the test step author
as inputs, or set by the test author.

### Declaring step parameters

Each parameter declaration in the `env` section consists of the following
fields:

* `name`: environment variable name
* `default` (optional): the value assigned if none is provided
* `documentation` (optional): a textual description of the parameter. Markdown supported.

Parameters are declared in the `env` section (note that the placement of this
section varies depending on the component type, see [common
mistakes](#common-mistakes)). The simplest form of declaration in a step is:

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
  - name: TEST_SUITE
{{< / highlight >}}

`TEST_SUITE` is declared as an input parameter to the step and will be available
at runtime as an environment variable. Different tests can set the parameter to
different values to create test variations.

Omitting a default value makes `TEST_SUITE` a required parameter.  A test that
wishes to use this step must give the parameter a value in its corresponding
`env` section --- failing to do so will result in a validation error.

{{< highlight yaml >}}
tests:
- as: e2e
  steps:
    test:
    - ref: openshift-e2e-test
    env:
      TEST_SUITE: openshift/conformance/parallel
{{< / highlight >}}

If a parameter has a sensible default value, it can be declared in the step:

{{< highlight yaml >}}
ref:
  as: openshift-e2e-test
  # other fields as before
  env:
  - name: TEST_SUITE
    default: openshift/conformance/parallel
{{< / highlight >}}

Using this step with the default value no longer requires an `env` section in
the test, but one can be used to override it:

{{< highlight yaml >}}
tests:
- as: e2e
  steps:
    test:
    - ref: openshift-e2e-test
- as: e2e-disruptive
  steps:
    test:
    - ref: openshift-e2e-test
    env:
      TEST_SUITE: openshift/disruptive
{{< / highlight >}}

Workflows can similarly set parameter values. The format of their `env` section
is the same as that of a test:

{{< highlight yaml >}}
workflow:
  as: openshift-e2e-serial
  steps:
    env:
      TEST_SUITE: openshift/conformance/serial
{{< / highlight >}}

Tests can then use the workflow instead and dispense the `env` section:

{{< highlight yaml >}}
tests:
- as: e2e
  steps:
    workflow: openshift-e2e-serial
    test:
    - ref: openshift-e2e-test
{{< / highlight >}}

For more advanced uses of parameters and overrides, see the [hierarchical
propagation](#hierarchical-propagation) section.

### Setting parameter values

Once a registry component exists that declares one or more parameters, it can be
used by other components and tests. Components and their parameters can be found
either directly in the step registry directory in
[`openshift/release`](https://github.com/openshift/release/tree/master/ci-operator/step-registry)
or via the [step registry web page](https://steps.ci.openshift.org). The latter
shows what parameters are available for each type (follow the links for
examples):

- [Steps](https://steps.ci.openshift.org/reference/openshift-e2e-test#environment)
  list their input parameters, along with the default values if they exist.
- [Chains](https://steps.ci.openshift.org/chain/ipi-conf-aws#environment) and
  [workflows](https://steps.ci.openshift.org/workflow/openshift-e2e-aws#environment)
  list their parameters as well as all parameters that are declared in their
  child components (other chains and steps).

Assuming a preexisting step declared as:

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
  - name: TEST_SUITE
    default: openshift/conformance/serial
{{< / highlight >}}

{{< alert title="Note" color="info" >}}
These examples are simplified versions for illustrative purposes of the
components present in the registry. See their original definitions for the full
contents and their documentation for intended usage.
{{< /alert >}}

A test can use this step directly:

{{< highlight yaml >}}
tests:
- as: e2e
  steps:
    test:
    - ref: openshift-e2e-test
{{< / highlight >}}

The default value declared in the step will be used for the `TEST_SUITE`
parameter. If desired, it can be overridden with an `env` section in the test
declaration:

{{< highlight yaml >}}
tests:
- as: e2e-disruptive
  steps:
    test:
    - ref: openshift-e2e-test
    env:
      TEST_SUITE: openshift/disruptive
{{< / highlight >}}

For more advanced uses of parameters and overrides, see the [hierarchical
propagation](#hierarchical-propagation) section.

### Common mistakes

#### Step/chain/workflow/test does not accept `env` field

Verify that the `env` field is placed correctly. Note that it is a top-level
field in steps and chains, alongside the `as` field, while it is placed in the
`steps` field in tests and workflows. The strict YAML validation used to parse
these files will generate an error, but this is still a common source of
confusion.

{{< highlight yaml >}}
ref:
  as: openshift-e2e-test
  # …
  env:
  - name: TEST_SUITE
{{< / highlight >}}

{{< highlight yaml >}}
tests:
- as: e2e
  steps:
    # …
    env:
      TEST_SUITE: openshift/disruptive
{{< / highlight >}}

#### Parameter is not set

Parameters must be declared in the `env` section of every step that requires
them. Setting values in parent components is not sufficient. Basic compliance
with this rule is enforced and simple cases of unused values will result in
validation errors, but not all can be detected, resulting in parameter values
not being set.

{{< highlight yaml >}}
ref:
  as: openshift-e2e-test
  # …
  env:
  - name: TEST_SUITE
{{< / highlight >}}

{{< highlight yaml >}}
ref:
  as: step-with-no-parameters
  # …
  # No parameters declared
  # env: {}
{{< / highlight >}}

{{< highlight yaml >}}
tests:
- as: e2e
  steps:
    test:
    - ref: openshift-e2e-test
    - ref: step-with-no-parameters
    env:
      TEST_SUITE: openshift/disruptive
{{< / highlight >}}

In this case, `TEST_SUITE` will be set in `openshift-e2e-test` since it is
declared in its `env` section, but _will not_ be set in
`step-with-no-parameters`. If that is desired, a similar `env` section should be
added to that step as well. Note that this case evades the unused parameter
validation since at least one step declares that it uses the relevant parameter.

## Leases

Tests can acquire leases for cloud quota (described in
[this page](/docs/architecture/quota-and-leases)) in two different ways:

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
      # overridden by the parent section
      - resource_type: aws-quota-slice
        env: AWS_LEASED_RESOURCE
      # added to the parent section
      - resource_type: gcp-quota-slice
        env: GCP_LEASED_RESOURCE
      # …
{{< / highlight >}}

## Hierarchical Propagation

Some fields of individual steps can be changed by the chains, workflows, and
test definitions that include them. Those are: [parameters](#parameters),
[dependencies](/docs/architecture/ci-operator#referring-to-images-in-tests), and
[leases](#leases).

Values set in parent elements will be propagated down the hierarchy. That is: a
variable in the `env` section of a chain will propagate to all of its sub-chains
and sub-steps, a variable in the `env` section of a workflow or test will
propagate to all of its stages. The same applies for dependencies and leases.

{{< alert title="Warning" color="warning" >}}
As described in their individual sections, parameters and dependencies must be
declared in all steps that use them: setting values in parent components is not
sufficient. Basic compliance with this rule is enforced and simple cases of
unused values will result in validation errors, but not all can be detected,
resulting in parameter values not being set.
{{< /alert >}}

One special rule applies to list and mapping fields that are specified both in a
test and its workflow.  Instead of completely overriding the workflow value, as
is the case for scalar values, the two sections are merged according to the
following rules:

- Parameters and dependencies declared in the test override those in the
  workflow if they target the same environment variable. Otherwise, the
  resulting parameter list is the combination of both sections.
- Leases declared in the test must not target an environment variable already
  present in the workflow. Otherwise, the resulting lease list is the
  combination of both sections.

### Examples

This section contains more exotic examples not present in
[Parameters](#parameters) or elsewhere.

#### Tests and workflows

Starting from a step that declares a parameter:

{{< highlight yaml >}}
ref:
  as: openshift-e2e-test
  # …
  env:
  - name: TEST_SUITE
    default: openshift/conformance/parallel
{{< / highlight >}}

As has already been described, a test or workflow can include the step. Without
any additional `env` sections, the default value declared in the step --- the
lowest level of the hierarchy, but the highest that declares a value --- will be
used.

{{< highlight yaml >}}
workflow:
  as: openshift-e2e
  steps:
    test:
    - ref: openshift-e2e-test
{{< / highlight >}}

{{< highlight yaml >}}
tests:
- as: e2e
  steps:
    test:
    - ref: openshift-e2e-test
- as: e2e-with-workflow
  steps:
    workflow: openshift-e2e
{{< / highlight >}}

In all these examples, the `TEST_SUITE` parameter will be set to the default
value declared in the step.

#### Test/workflow override

If a value different from the parameter's default is desired, it can be declared
in either the workflow or the test.

{{< highlight yaml >}}
tests:
- as: e2e-disruptive
  steps:
    workflow: openshift-e2e
    env:
      TEST_SUITE: openshift/disruptive
{{< / highlight >}}

Here, the previously declared workflow is used and the value is set in the test.
Alternatively, it could be set in the workflow.

{{< highlight yaml >}}
workflow:
  as: openshift-e2e-disruptive
  steps:
    test:
    - ref: openshift-e2e-test
    env:
      TEST_SUITE: openshift/disruptive
{{< / highlight >}}

{{< highlight yaml >}}
tests:
- as: e2e-disruptive
  steps:
    workflow: openshift-e2e
{{< / highlight >}}

Including a step and giving its parameters values are independent actions, so
yet another option would be:

{{< highlight yaml >}}
workflow:
  as: openshift-e2e
  steps:
    test:
    - ref: openshift-e2e-test
{{< / highlight >}}

{{< highlight yaml >}}
tests:
- as: e2e-disruptive
  steps:
    workflow: openshift-e2e
    env:
      TEST_SUITE: openshift/disruptive
{{< / highlight >}}

#### Test overrides workflow

Following the propagation rules described previously in this section, even if a
workflow defines a parameter value, the test can still choose to override it.
The value in the test's `env` section will be used, as it is at a higher level
in the hierarchy.

{{< highlight yaml >}}
workflow:
  as: openshift-e2e-disruptive
  steps:
    test:
    - ref: openshift-e2e-test
    env:
      TEST_SUITE: openshift/disruptive
{{< / highlight >}}

{{< highlight yaml >}}
tests:
- as: e2e-serial
  steps:
    workflow: openshift-e2e-disruptive
  env:
    TEST_SUITE: serial # overrides the value set in the workflow
{{< / highlight >}}

This would be safe even if the workflow declared more variables: the two
sections are merged as expected.

{{< highlight yaml >}}
workflow:
  as: openshift-e2e-disruptive
  steps:
    # …
    env:
      TEST_SUITE: openshift/disruptive
      EXTRA_PARAMETER: value
{{< / highlight >}}

{{< highlight yaml >}}
tests:
- as: e2e-serial
  steps:
    workflow: openshift-e2e-disruptive
  env:
    TEST_SUITE: serial
    # EXTRA_PARAMETER will retain its value
{{< / highlight >}}

#### Chains

Chains introduce additional levels of propagation. They can also declare
parameters, dependencies, and leases, which override those declared in their
steps. Because they can be arbitrarily nested, more complex overriding patterns
can be constructed.

The examples in [test/workflow override](#testworkflow-override) could be
rewritten using chains.

{{< highlight yaml >}}
chain:
  as: openshift-e2e-tests
  steps:
  - ref: openshift-e2e-test
  env:
  - name: TEST_SUITE
    default: openshift/disruptive
{{< / highlight >}}

{{< highlight yaml >}}
workflow:
  as: openshift-e2e-disruptive
  steps:
    test:
    - chain: openshift-e2e-tests
{{< / highlight >}}

{{< highlight yaml >}}
tests:
- as: e2e-disruptive
  steps:
    test:
    - chain: openshift-e2e-tests
- as: e2e-with-workflow
  steps:
    workflow: openshift-e2e-disruptive
{{< / highlight >}}

## VPN connection

For platforms that need access to restricted environments, `ci-operator`
supports adding a dedicated VPN connection to each test step.  Since this is a
requirement of specific platforms, it is enabled when a
[cluster profile]({{< ref "docs/how-tos/adding-a-cluster-profile" >}})
for one of those platforms is used.  This process is transparent to the test
command: when a VPN connection is requested at the test level, it is set up
automatically by the test platform, which ensures the connection is available
throughout the execution of each step.  No changes are required to individual
tests.

More details about the interaction between the test steps and the VPN client can
be found in the cluster profile
[documentation]({{< ref "docs/how-tos/adding-a-cluster-profile#vpn-connection" >}}).
