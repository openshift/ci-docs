---
title: "Naming your CI Jobs"
description: How to name your CI job.
---

## Job naming guidelines

Job names should indicate to the reader the purpose of the specific job,
as well as noting where the job deviates from OpenShift defaults for
that release. The guidelines contained in this document are based on the
way the majority of jobs are named today. The general format of a job
name should be as follows:

```
[JOB TYPE]-ci-[GITHUB ORG]-[GITHUB REPO]-[GITHUB BRANCH]-[STREAM]-[RELEASES]-[TEST SUITE]-[PLATFORM]-[CNI]-[OTHER DEVIATIONS]
```

When using multi-stage generated jobs, the first part of the name is
generated for you, and the second part that begins with "releases" is
determined by the job creator.

## Job name fields

### Generated fields

For multi-stage jobs, these fields are generated for you and aren't
needed in the name set in your YAML configuration.

**Job type**:  Will be either "periodic" or "pull". Jobs that begin with
other prefixes like "release" or  "promote" are template-style jobs and
mostly not used any more.

**GitHub org/repo/branch**: The GitHub org, repo and branch the job is
configured for.  Release periodics typically use openshift/release, but
teams may put them under their own control subject to the guidelines
below.

**Stream**: Which release stream is being tested, such as
nightly or ci.

### User selected fields

**Releases**: The X.Y release being used is typically already
in the job name by way of the GitHub branch (i.e. release-4.13). For
minor upgrades, you do need to add the context of the initial release
in the format "X.Y-upgrade-from-stable-4.(Y-1)". Upgrades that test
multiple versions are listed in sequence, i.e.
"4.10-to-4.11-to-4.12-to-4.13-ci". Micro upgrades do not need any
special designation other than the X.Y. All upgrade jobs should specify
"upgrade" under "other deviations."

**Test Suite**: If it is running a test suite from openshift/origin
(openshift-tests binary), this value should be “e2e.”
`openshift/conformance/parallel` is the assumed suite for "e2e" jobs,
unless otherwise specified in "other deviations" (such as "serial"). If
it is running something else such as tests from your own repo, you can
give it a descriptive name of your choice, but do not use the e2e
value. The OpenShift console tests use the value “console" for example.

**Platform**: This should be the cloud platform type. When the kind of
infrastructure (IPI, UPI, Assisted) is specified in the job name, this
must be conjoined with the platform (i.e., aws-upi).  Typically IPI
is assumed and is omitted.

**CNI**: The CNI provider, such as “ovn” or “sdn”

**Other deviations**:  Where the job deviates from OpenShift defaults
for that release, these should be noted in the job name.  Example
deviations include: “rt” (realtime kernel), “proxy”, "ipv6", and
non-amd64 architectures like "arm64".  If an e2e job that is running a
suite other than the parallel conformance suite, this should also be
included here. For example, "serial" or "csi".  Upgrade jobs should
specify "upgrade" at the end of the job name, whether it be a micro or
minor upgrade.

### Multiarch Payload fields

When creating a job that utilizes the multiarch payload, there are many
different architectures and configurations that can be used for deploying
a cluster.  Creating the job name with a specific pattern will help others
understand more about the deployment structure with just a glance. See this
[README](https://github.com/openshift/release/blob/master/ci-operator/config/openshift/multiarch/README.md)
for more information on appropriate formatting.

### Example job names

- periodic-ci-openshift-release-master-nightly-4.13-console-aws
- periodic-ci-openshift-release-master-nightly-4.13-e2e-azure-ovn-etcd-scaling
- periodic-ci-openshift-release-master-nightly-4.13-e2e-metal-ipi-serial-ovn-dualstack
- periodic-ci-openshift-release-master-ci-4.13-e2e-gcp-sdn-techpreview-serial
- periodic-ci-openshift-release-master-ci-4.13-upgrade-from-stable-4.12-e2e-azure-sdn-upgrade

## When defaults change

For a particular release, a default may change.  For example, it's
expected that we will soon move from `runc` to `crun` as the default
container runtime.  Today, there are jobs that contain `crun` in their
name because they deviate from the current default of `runc`.

Once the default changes the process should be to:

- Create a list of all jobs containing `crun` in their name.
- Ensure there is a matching job in the current set of CI jobs not
  specifically running `crun`. For example, if there is a FIPS `crun`
  job, make sure there is such a job using OpenShift defaults.
- Remove the `crun`-specific jobs
- Create `runc` jobs, if needed, to test the older functionality

## Configuration for periodic jobs

In order to work with most tooling (Sippy, Component Readiness, Feature
Gate Analyzer, etc), periodics must be tied to a specific OpenShift
release. That means the job should contain the release (e.g. "4.18") in
the name and have a [`"job-release"`
label](https://github.com/openshift/release/blob/master/ci-operator/jobs/openshift/cluster-control-plane-machine-set-operator/openshift-cluster-control-plane-machine-set-operator-release-4.19-periodics.yaml#L15)
in its configuration.  The `job-release` label is automatically added to a job by
properly setting the [`release` configuration
option](https://docs.ci.openshift.org/docs/architecture/ci-operator/#testing-with-an-existing-openshift-release).
Periodics should not be mixed with presubmits in the same file.
Additionally, because this is a per-file option, that means you would
have one file dedicated to periodics *per release*.

An example of this configuration is available
[here](https://github.com/openshift/release/tree/c1cf20f480b19e010e6581774452d579a60a92ed/ci-operator/config/openshift/cluster-control-plane-machine-set-operator),
where you can see the periodics are stored in the `__periodics.yaml`
files per release branch. This is using the [variants feature of
ci-operator](https://docs.ci.openshift.org/docs/how-tos/contributing-openshift-release/#variants)
to have more than one file per branch.

If your repo does not have release-X.Y branches, you can attach the jobs to
the main branch, while still creating one file per release (e.g.
`__4.18.yaml` suffix). An example of this configuration is available in
this
[PR](https://github.com/openshift/release/pull/59043/files#diff-331a89cddd402bc6ffb7a056557b9eb07b47cd84f5ac62d98b4380361901f764).

Lastly, for these jobs to show up in
[TestGrid](https://testgrid.k8s.io/) and
[Sippy](https://sippy.dptools.openshift.org/), the ci-tools
[configuration needs to be updated
manually](https://github.com/openshift/ci-tools/pull/3261) to allowlist
your repository.

