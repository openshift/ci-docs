---
title: "Configuring capabilities for the job"
description: How to configure capabilities to trigger the job on a specified cluster
---

# Introduction

The Capabilities Feature was introduced to improve the dynamic dispatching of prowjobs in environment where clusters may be enabled, disabled or removed unexpectedly. Instead of relying on manual cluster assignments which can result in jobs running on a not existent cluster. Capabilities Feature allows for a more flexible and reliable dispatching process.

When a job includes a capabilities block, the dispatcher examines the required capabilities and checks the available clusters against these criteria. The required capabilities are defined in the sanitizer configuration file, which maintains a list of cluster and enabled capabilities.

# Configuration

Capabilities are defined within the sanitizer configuration file. Names are designed to be self explanatory. You can view the [sanitizer config](https://github.com/openshift/release/blob/master/core-services/sanitize-prow-jobs/_clusters.yaml) to see configured capabilities.

To use the Capabilities Feature, simply include the required capabilities in the ci-operator job configuration. For instance, if a job requires intranet support, the configuration should be written as follows:

```yaml
capabilities:
  - intranet
```

Example job with configured capabilities:

```yaml
...
- always_run: false
  as: virt-cnv-density
  capabilities:
  - intranet
  restrict_network_access: false
  steps:
    cluster_profile: metal-perscale-cpt
    test:
    - chain: openshift-qe-installer-bm-ping
    - chain: openshift-qe-installer-bm-load-kubeconfig
    - chain: openshift-qe-installer-bm-day2-cnv
    - chain: openshift-qe-virt-density
...
```

This block tells the dispatcher that the job must be executed on a cluster that has the `intranet` capability. During the next dispatch cycle, the dispatcher will review the defined capabilities and reassign the job accordingly.

### Existing Capabilities:

1. `arm64` - To run job on a cluster which contains arm64 + amd64 nodes.
2. `intranet` - Allows connectivity to the redhat intranet
3. `sshd-bastion` - For multiarch libvirt jobs, this is a temporary capability until the Multiarch can use intranet and move away from legacy bastion connectivity.
4. `rce` - release controller elligible, any job triggered from release controller will have this capability assigned.
***Note*: Not to be added manually on any job config.**
