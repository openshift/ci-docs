---
title: "Migrating CI Jobs from Templates to Multi-stage Tests"
date: 2020-10-30T21:49:06+02:00
draft: false
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

### Notable Cluster Differences

Certain cluster properties may be different between testing clusters installed by
template-based jobs and the ones provisioned by multi-stage workflows.

- AWS clusters have default-sized workers (`m4.large`) in clusters installed by
  multi-stage workflows. Templates previously hardcoded a worker size `m4.xlarge`
  override, so AWS clusters in multi-stage jobs are less powerful and may be
  insufficient for some test workloads. The issue is tracked in
  [DPTP-1740](https://issues.redhat.com/browse/DPTP-1740). Jobs that need more
  powerful clusters may use templates instead of multi-stage workflows for now.

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
- [`openshift-upgrade-$PLATFORM`](https://steps.ci.openshift.org/workflow/openshift-upgrade-aws): basic upgrade test workflow
- [`openshift-upgrade-$PLATFORM-loki`](https://steps.ci.openshift.org/workflow/openshift-upgrade-aws-loki): upgrade test workflow with logs collected via Loki (**recommended**)
- [`openshift-upgrade-$PLATFORM-hosted-loki`](https://steps.ci.openshift.org/workflow/openshift-upgrade-aws-hosted-loki): upgrade test workflow with logs collected via Loki hosted on Observatorium.

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
