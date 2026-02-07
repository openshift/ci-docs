---
title: Ephemeral Clusters in Konflux CI
description: Konflux Pipeline provisioning an Ephemeral Cluster in OpenShift CI
---

Konflux pipelines can leverage the OpenShift CI facilities to either provision or claim an
ephemeral cluster and use it to run tests.  

## Who is this documentation meant for?

The user facing documentation is available at [konflux-ci.dev/testing/integration/third-parties/openshift-ci](https://konflux-ci.dev/testing/integration/third-parties/openshift-ci/).  
This is intended as an high level overview for an OpenShift CI developer or for a user who is curious to understand how this feature works under the hood.

## Lifecycle of an Ephemeral Cluster

[The design document](https://docs.google.com/document/d/1RLE4PcRXWwXg7GTnyOxzOAq9FtLXMZxOhRRioMxQhJc/edit?tab=t.0#heading=h.x9snb54sjlu9) gives an high level overview on the mechanism.

The steps needed for provisioning an ephemeral cluster can be summarized as follow:
1. A Konflux pipeline runs the [provision-ephemeral-cluster](https://github.com/openshift/konflux-tasks/tree/main/tasks/provision-ephemeral-cluster/0.1) task.
1. The task creates a `TestPlatformCluster` object.
1. The [Crossplane](https://www.crossplane.io/) component acts upon the object and creates an `EphemeralCluster` object in `app.ci`.
1. The [ephemeral cluster reconciler](http://github.com/openshift/ci-tools/blob/main/pkg/controller/ephemeralcluster/reconciler.go) watches the `EphemeralCluster` object within the `ephemeral-cluster` namespace and spawns a `ProwJob`.
1. The `ProwJob` runs `ci-operator` that, in turns, use [one of the available workflows](https://steps.ci.openshift.org/#workflows) to provision an ephemeral cluster.
1. `ci-operator` eventually succeeds in provisioning the cluster, then waits until it receives a "signal" from the reconciler to start the deprovisioning procedures.
1. The `ephemeral cluster reconciler` continuously polls the `ci-op-xxxx` namespace until it finds a secret that holds the kubeconfig for the ephemeral cluster. Once it shows up the cluster is ready.
1. The `ephemeral cluster reconciler` copies the kubeconfig into the `.status.kubeconfig` stanza of the `EphemeralCluster` object.
1. The `crossplane` reports the kubeconfig from the `EphemeralCluster` to a secret into the Konflux pipeline tenant namespace.
1. The `provision-ephemeral-cluster` task reads the kubeconfig from the secret and writes it into its results.
1. The Konflux pipeline uses the kubeconfig to run a test.
1. Upon test completion, the Konflux pipeline runs the [deprovision-ephemeral-cluster](https://github.com/openshift/konflux-tasks/tree/main/tasks/deprovision-ephemeral-cluster/0.1) task to start the deprovisioning procedures.
1. The `deprovision-ephemeral-cluster` task sets the `.spec.tearDownCluster` stanza to `true`.
1. The `crossplane` task sets the stanza to `true` but on the `EphemeralCluster` object in `app.ci`.
1. The `ephemeral cluster reconciler` signals `ci-operator`.
1. `ci-operator` starts the deprovisioning procedures. The ephemeral cluster is, eventually, destroyed.

### Konflux Crossplane
XRDs and Composition for Test Platform are defined as follow:
- [https://github.com/konflux-ci/crossplane-control-plane/config/xtestplatformcluster](https://github.com/konflux-ci/crossplane-control-plane/tree/main/config/xtestplatformcluster).  

Deployments on various Konflux enviroments are defined as follow:
- [https://github.com/redhat-appstudio/infra-deployments/components/crossplane-control-plane](https://github.com/redhat-appstudio/infra-deployments/tree/main/components/crossplane-control-plane)
- [https://github.com/redhat-appstudio/infra-deployments/components/crossplane-config](https://github.com/redhat-appstudio/infra-deployments/tree/main/components/crossplane-config)

**IMPORTANT**: When any change is introduced in Crossplane, make sure to bump the deployments above.

Crossplane doesn't write an `EphemeralCluster` object directly in `app.ci` but it rather leverages the [provider-kubernetes](https://github.com/crossplane-contrib/provider-kubernetes) to achieve that.  
The provider creates an `EphemeralCluster` proxy object within the Konflux cluster, keeping it in sync with the same `EphemeralCluster` object on `app.ci` within the `ephemeral-cluster` namespace.

```
+- Konflux -------------------------+
|                                   |
|        TestPlatformCluster        |
|               |                   |
|               v                   |
|        EphemeralCluster (proxy)   |
|               |                   |
+- app.ci ------|-------------------+
|               v                   |
|        EphemeralCluster           |
|                                   |
+-----------------------------------+
```

#### How Crossplane communicates to `app.ci`
Crossplane uses a kubeconfig for the `app.ci` cluster defined at [https://github.com/redhat-appstudio/infra-deployments/components/crossplane-control-plane/staging/testplatform-provider-config.yaml#L16-L35](https://github.com/redhat-appstudio/infra-deployments/blob/4d63bbbe22977ad897d8074708d44f427d3b5092/components/crossplane-control-plane/staging/testplatform-provider-config.yaml#L16-L35).  

The kubeconfig is synchronized from [Vault](https://vault.devshift.net/ui/vault/secrets/stonesoup/kv/production%2Fopenshift-ci%2Fephemeral-cluster/details).
Follow [this](https://github.com/openshift/release/blob/ca2b56fe13700f7970240e1b72ae8b5860a1b668/dptp-triage-sop/token-rotation.md#konflux-ephemeral-cluster-service-account-token) guide to rotate the kubeconfig token.  

#### XRD and CRD
The `TestPlatformCluster` is an XRD (this is not entirely true, it's a `Claim` but the concept it's strictly tied to an XRD) resource (see [docs.crossplane.io/latest/composition/composite-resource-definitions](https://docs.crossplane.io/latest/composition/composite-resource-definitions/)) whereas the `EphemeralCluster` is a regular CRD.  
The `EphemeralCluster` CRD `.spec` definition is embedded into `TestPlatformCluster`, this means that
when the CRD definition changes the XRD must be updated as well (see [xtestplatformcluster/README.md](https://github.com/konflux-ci/crossplane-control-plane/blob/main/config/xtestplatformcluster/README.md)).