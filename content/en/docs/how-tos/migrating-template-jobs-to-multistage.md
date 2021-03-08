---
title: "Migrating CI Jobs from Templates to Multi-stage Tests"
date: 2020-10-30T21:49:06+02:00
draft: false
description: How to self-service migrate jobs from using the deprecated Template approach to the multi-stage system.
---

OpenShift CI offers two mechanisms for setting up end-to-end tests: older
template-based tests and newer [multi-stage test workflows](/docs/architecture/step-registry/).
Template-based tests cause problems for both DPTP and OpenShift CI users:
 - they need intensive support
 - backing implementation is buggy and notoriously difficult to maintain
 - jobs using templates are hard to extend, modify, and troubleshoot

These concerns were addressed in designing the multi-stage workflows, which
supersede template-based tests. DPTP wants to migrate all existing template-based
jobs to multi-stage workflows in the medium term. We expect this to cause no
service disruption.

## Migrating Handcrafted Jobs

Some template-based jobs are not generated from `ci-operator` configuration but
were written manually, usually to overcome some limitation of generated jobs
or because some one-off customization was necessary. Multi-stage tests features
remove most reasons to handcraft a job, so migrating jobs from templates to
multi-stage involves also migrating them from handcrafted to generated.

The high-level procedure for migrating a job looks like this:

1. Determine what the current job is doing: what tests does it run, what image
   does it use, are there any additional parameters, etc.
2. Determine if there is a multi-stage workflow doing the same thing, or at least
   if there are existing building blocks (individual steps) to use.
3. Add an item to the list of tests in the corresponding ci-operator configuration
   file, and regenerate jobs.
4. If done right, the generator will "adopt" the previously handcrafted job
   and will just update its definition, keeping the existing customizations as
   if it were a generated job from the start.
5. Test the newly generated job using rehearsals to see if it gives a correct
   signal.

For an example of a handcrafted template job migrated to a generated multi-stage
one, see [this PR](https://github.com/openshift/release/pull/16476).

### Determine what the current job is doing

Find the definition of the job under `ci-operator/jobs`:
```
$ git grep periodic-ci-kubernetes-conformance-k8s ci-operator/jobs/
ci-operator/jobs/openshift/kubernetes/openshift-kubernetes-master-periodics.yaml:  name: periodic-ci-kubernetes-conformance-k8s
```

The job always uses one of the templates by mounting the respective ConfigMap.
The volume is usually called `job-definition` and the ConfigMap always has a
`prow-job-cluster-launch-installer-` prefix:

```yaml
volumes:
- configMap:
    name: prow-job-cluster-launch-installer-src
  name: job-definition
```

The name of the config map usually contains a cloud platform and also hints what the
template does: `e2e` templates run common OpenShift tests, `src` templates run
a custom command in the context of the `src` image and `custom-test-image` run
a custom command in the context of another, specified image.

Additionally, some jobs specify a `CLUSTER_VARIANT` environmental variable that
further affects how the job will install a testing cluster:

```yaml
spec:
  containers:
  - ...
    env:
    - name: CLUSTER_VARIANT
      value: fips
```

This configuration together should give you an idea about what kind of test
the job implements. Usually, it will be some combination of test (shared e2e or
custom command), cloud platform (GCP, AWS, etc.) and an optional variant (FIPS,
compact etc.). 

### Determine what workflow and/or steps to use as a replacement

Inspect the [step registry](https://steps.ci.openshift.org/) and figure out if
there is an existing content that implements the testing procedure you discovered
in the previous step. Knowing how [multi-stage tests](https://docs.ci.openshift.org/docs/architecture/step-registry/)
work in general helps a lot in this step.

For shared end-to-end tests, most of the existing platform/variant combinations
are already covered by an existing `openshift-e2e-$PLATFORM-$VARIANT` workflow,
such as `openshift-e2e-aws-ovn`.

Jobs running tests in a custom test image or `src` image are expressed as
workflow-using tests with overriden `test` section, so search for an appropriate
install/teardown workflow, such as `ipi-aws`.

### Add a test to ci-operator config

The following example shows how to express a job that was using `prow-job-cluster-launch-installer-src`
template to run a custom command in the `src` image. The `...-custom-test-image`
template-based job would differ only in its `from:` stanza:

```yaml
tests:
- as: e2e-test
  steps:
    cluster_profile: aws     # needs to match the workflow
    test:                    # override the `test` section of the workflow
    - as: test               # name of the step
      commands: make test    # execute `make test`...
      from: src              # ...inside the src image
      resources:             # explicitly specify resources for the step
        requests:
          cpu: 100m
    workflow: ipi-aws        # `ipi-$PLATFORM` workflows implement the "usual" OpenShift installation
```

The e2e workflows usually need even less configuration:

```yaml
- as: e2e-vsphere
  steps:
    cluster_profile: vsphere
    env:
      TEST_SUITE: openshift/conformance/parallel
    workflow: openshift-e2e-vsphere-upi

```
Note that the behavior of the `openshift-tests` binary is controlled by parameters
of the [`openshift-e2e-test`](https://steps.ci.openshift.org/reference/openshift-e2e-test)
step, not by overriding the actual executed command like it was in the template job.

### Make the generated job "adopt" the previous handcrafted job

Handcrafted jobs often have custom modifications that e.g. control when they are
triggered. In order for the generated job to keep this behavior, rename the original
job to the name it will be given by the generator (`{periodic-ci-,pull-ci-}$ORG-$REPO-$BRANCH-$TEST`)
before running the generator. This will make the generator "adopt" the job and overwrite
just the necessary parts of it, keeping the customization.

Alternatively, you can just generate the new job and delete the old one, too. Doing
this will not keep the customizations on the old job, though.

### Test the generated job

All generated jobs are rehearsable by default, so a PR with the change will receive
a [rehearsal run](https://docs.ci.openshift.org/docs/how-tos/contributing-openshift-release/#rehearsals)
of the new job which you can inspect to see if the new job gives the expected
signal.

## Migrating Jobs Generated from `ci-operator` Configurations

Most template-based jobs are generated from `ci-operator` configuration stanzas.
Migrating these jobs is easier and can be done almost mechanically. Soon, DPTP
will migrate all existing `ci-operator` configurations to multi-stage workflows
automatically.

### `openshift_installer`

The tests using the `openshift_installer` stanza install OpenShift using a
generic IPI installation workflow and then execute the shared OpenShift E2E tests
provided by the `openshift-tests` binary in `tests` image.

#### Before (template-based)
```yaml
tests:
- as: e2e-test
  openshift_installer:
    cluster_profile: aws
```

#### After (multi-stage)
```yaml
tests:
- as: e2e-test
  steps:
    cluster_profile: aws     # needs to match the workflow
    workflow: openshift-e2e-aws # workflow implements the "usual" e2e test workflow
```

### `openshift_installer`: upgrades

The `openshift_installer` stanzas had a special `upgrade: true` member, which,
when set, made the CI job install a baseline version of OpenShift and then
triggered an observed upgrade to the candidate version (the meaning of "baseline"
and "candidate" can differ depending on context, but on PR jobs "baseline" usually
means "HEADs of branches" and "candidate" means "baseline+component candidate").

```yaml
tests:
- as: e2e-test
  openshift_installer:
    cluster_profile: aws
    upgrade: true
```

#### After (multi-stage)
```yaml
tests:
- as: e2e-test
  steps:
    cluster_profile: aws     # needs to match the workflow
    workflow: openshift-upgrade-aws-loki # workflow implements the "usual" upgrade workflow
```

There are multiple different workflows that implement the upgrade test:
- [`openshift-upgrade-$PLATFORM`](https://steps.ci.openshift.org/workflow/openshift-upgrade-aws): upgrade test workflow with logs collected via Loki (**recommended**)

### `openshift_installer_src`

The tests using the `openshift_installer_src` stanza install OpenShift using a
generic IPI installation workflow, execute a provided command in the context of
the `src` image (which contains a git clone of the tested repository), and
tear down the cluster. The template provides tests a writable `$HOME` and injects
the `oc` binary from the `cli` image.

These jobs can be migrated to multi-stage using an `ipi-$PLATFORM` workflow
(like [`ipi-aws`](https://steps.ci.openshift.org/workflow/ipi-aws)) and replacing
its `test` stage with matching inline steps. The resulting configuration is
more verbose. This is a consequence of multi-stage tests being more flexible,
allowing configuration of the elements that in templates were hardcoded.

#### Before (template-based)

```yaml
tests:
- as: e2e-test
  commands: make test
  openshift_installer_src:
    cluster_profile: aws
```

#### After (multi-stage)
```yaml
tests:
- as: e2e-test
  steps:
    cluster_profile: aws     # needs to match the workflow
    test:                    # override the `test` section of the workflow
    - as: test               # name of the step
      cli: latest            # inject the `oc` binary from specified release into image used by the step
      commands: make test    # execute `make test`...
      from: src              # ...inside the src image
      resources:             # explicitly specify resources for the step
        requests:
          cpu: 100m
    workflow: ipi-aws        # `ipi-$PLATFORM` workflows implement the "usual" OpenShift installation
```

#### Gotchas

These are the possible problems you may encounter when porting an `openshift_installer_src`
test to a multi-stage workflow.

##### Hardcoded kubeadmin password location

Tests that use the file containing the kubeadmin password and hardcode its
location (`/tmp/artifacts/installer/auth/kubeadmin-password`) provided by
the template will not find the file at that location anymore.

**Resolution:** Port the test to use [`$KUBEADMIN_PASSWORD_FILE`](/docs/architecture/step-registry/#available-environment-variables) environmental variable instead.

### `openshift_installer_custom_test_image`

The tests using the `openshift_installer_custom_test_image` stanza install
OpenShift using a generic IPI installation workflow, execute a provided command
in the context of the specified image, and tear down the cluster. The template
provides tests a writable `$HOME` and injects the `oc` binary from the `cli`
image.

These jobs can be migrated to multi-stage in an almost identical way to
the [`openshift_installer_src`](#openshift_installer_src) ones by using an
`ipi-$PLATFORM` workflow (like [`ipi-aws`](https://steps.ci.openshift.org/workflow/ipi-aws))
and replacing its `test` stage with a matching inline step. The only difference
is that the specified image will be different.

```yaml
tests:
- as: e2e-test
  commands: make test
  openshift_installer_custom_test_image:
    cluster_profile: aws
    from: stable:aws-ebs-csi-driver-operator-test
```

#### After (multi-stage)
```yaml
tests:
- as: e2e-test
  steps:
    cluster_profile: aws                             # needs to match the workflow
    test:                                            # override the `test` section
    - as: test                                       # name of the step
      cli: latest                                    # inject the `oc` binary
      commands: make test                            # execute `make test`...
      from: stable:aws-ebs-csi-driver-operator-test  # ...inside the specified image
      resources:
        requests:
          cpu: 100m
    workflow: ipi-aws        # `ipi-$PLATFORM` workflows implement the "usual" OpenShift installation
```

#### Gotchas

These are the possible problems you may encounter when porting an
`openshift_installer_custom_test_image` test to a multi-stage workflow.

##### Tests rely on injected `openshift-tests` binary

The `openshift_installer_custom_test_image` template silently injected
`openshift-tests` binary to the specified image. This was a hack and will not
be implicitly supported in multi-stage workflows.

**Resolution:** Jobs that want to execute common OpenShift tests as well as
some custom ones can do so in two separate steps. The first step would use the
`ocp/4.x:tests` image to run `openshift-tests`. The second step would use the
custom image to execute a custom test. This method should be sufficient for most
users. Alternatively, it is possible to build a custom image using the `images`
stanza by explicitly injecting `openshift-tests` into the desired image and use
the resulting image to run the tests.

## User-facing Differences Between Template and Multi-Stage Tests

Template-based tests used mostly hardcoded sequences of containers (usually
called `setup`, `test` and `teardown`). Multi-stage tests usually consist of a
higher number (usually, around ten) of `Pods` that each execute a separated
test step, so the output change accordingly. The higher number of executed
`Pods` may also slightly increase total job runtime; executing each Pod has an
overhead which accumulates over the whole workflow.

You can examine what exact steps an individual job will resolve to
on the [Job Search](https://steps.ci.openshift.org/search) page.

### Collected Artifacts

Template-based tests put all artifacts into a single directory together, no
matter if the artifacts came from setup, test or teardown phase. Multi-stage
workflows' artifacts are separated in a separate directory for each step
executed. Most of the artifacts captured from the cluster after tests were
executed are collected by the `gather-must-gather` step (surprisingly, runs
`must-gather`) and `gather-extra` (gathers even more artifacts that
`must-gather` does not) steps.

#### Content of `artifacts/$TEST-NAME/` (template-based)

All captured artifacts are together:

```
container-logs/
installer/
junit/
metrics/
network/
nodes/
pods/
apiservices.json
audit-logs.tar
...
<more JSON dumps>
```

#### Content of `artifacts/$TEST-NAME/` (multi-stage)

Separate directories per step:

```
gather-audit-logs/
gather-extra/
gather-must-gather/
ipi-conf-gcp/
ipi-conf/
ipi-deprovision-deprovision/
ipi-install-install/
ipi-install-rbac/
test/
```
