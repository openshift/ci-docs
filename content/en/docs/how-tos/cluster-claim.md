---
title: "Creating a Cluster Pool"
description: How to create a cluster pool from which a job can claim a cluster.
---

`ci-operator` [allows](https://docs.ci.openshift.org/docs/architecture/ci-operator/#testing-with-a-cluster-from-a-cluster-pool)
CI jobs that need an OCP cluster for testing to claim a pre-installed one from so-called _"cluster pools"_
using [Hive](https://github.com/openshift/hive). This document describes how to set up custom pools backed by custom
cloud platform accounts owned by users or teams that want their jobs to use clusters provisioned with these custom
accounts.

## Prerequisites

* Verify that the cloud platform you want to use is supported
  by [Hive](https://github.com/openshift/hive#supported-cloud-providers)
* [Configure the cloud account](https://docs.openshift.com/container-platform/4.7/installing/installing-preparing.html):
  Hive does not require more configuration of the cloud account than installing an OpenShift cluster. Make sure that the
  account has quotas for the pools to contain the desired number of clusters.

## Instructions

The OpenShift CI Hive instance is deployed on a dedicated OpenShift cluster, called `hive` and all resources involved in
creating and running a custom cluster pool need to be created there. This is done via GitOps in the `openshift/release`
repository.

### Prepare Your Cloud Platform Credentials

First, you need to make sure the cloud platform credentials that will be used to install cluster for the pool are
available on the `hive` cluster. If you are not familiar with OpenShift CI custom secret management, please consult the
[Adding a New Secret to CI](/docs/how-tos/adding-a-new-secret-to-ci/) document first.

1. Select a suitable collection in [Vault](https://vault.ci.openshift.org/ui/) to hold your cluster pool secret.
   Alternatively, create a new suitable collection
   in [collection self-service](https://selfservice.vault.ci.openshift.org/).
2. In the selected collection, create a secret with the necessary keys and values. The specific needed keys depend on
   the cloud platform; consult the
   Hive [Cloud Credentials](https://github.com/openshift/hive/blob/master/docs/using-hive.md#cloud-credentials)
   document.
3. Set `secretsync/target-clusters` key to `hive` to make sure your credentials are synced to the necessary cluster.
4. Set `secretsync/target-namespace` key to a name of the namespace that will hold your pools (`${team}-cluster-pool` is a
   good baseline name).
5. Set `secretsync/target-name` to a name under which the secret will be accessible in the
   cluster (`$platform-credentials` is a good baseline name).

At the end, you should have a secret similar to the following in Vault:

#### selfservice/dptp-demo-collection/dptp-demo-pool-credentials:

```json
{
  "aws_access_key_id": "AWS KEY ID",
  "aws_secret_access_key": "AWS ACCESS KEY",
  "secretsync/target-clusters": "hive",
  "secretsync/target-name": "demo-aws-credentials",
  "secretsync/target-namespace": "dptp-demo-cluster-pool"
}
```

### Create a Directory for Your Manifests

1. In the openshift/release repository, create a folder in
   the [`clusters/hive/pools`](https://github.com/openshift/release/tree/master/clusters/hive/pools) directory that will
   contain manifests of all your resources (
   see [`openshift-ci`](https://github.com/openshift/release/tree/master/clusters/hive/pools/openshift-ci) as an
   example).

2. Create `OWNERS` file in the directory to allow your teammates make and approve changes.
3. Create a manifest for the namespace that will hold your Hive resources (the namespace name must match the one where
   you instructed [Vault to sync your secret](#prepare-your-cloud-platform-credentials)) and set up RBACs for the pool
   owners to debug on the `hive` cluster:

```console
$ make TEAM=team OWNERS=user1,user2 new-pool-admins

# ${team}-cluster-pool is assumed to be the namespace name as described above
# modify manually if you chose another name
$ cat clusters/hive/pools/team/admins_team-cluster-pool_rbac.yaml
apiVersion: v1
items:
- apiVersion: v1
  kind: Namespace
  metadata:
    name: team-cluster-pool
- apiVersion: user.openshift.io/v1
  kind: Group
  metadata:
    name: team-pool-admins
  users:
  - user1
  - user2
# hive-cluster-pool-admin contains the permission of accessing all resources created for a pool
# https://github.com/openshift/hive/blob/master/docs/clusterpools.md#managing-admins-for-cluster-pools
- apiVersion: rbac.authorization.k8s.io/v1
  kind: RoleBinding
  metadata:
    name: team-pool-admins
    namespace: team-cluster-pool
  roleRef:
    apiGroup: rbac.authorization.k8s.io
    kind: ClusterRole
    name: hive-cluster-pool-admin
  subjects:
  - apiGroup: rbac.authorization.k8s.io
    kind: Group
    name: team-pool-admins
# The pool owners need the following cluster permissions to select namespaces created for their pools
- apiVersion: rbac.authorization.k8s.io/v1
  kind: ClusterRoleBinding
  metadata:
    name: team-pool-admins
  roleRef:
    apiGroup: rbac.authorization.k8s.io
    kind: ClusterRole
    name: cluster-namespace-view
  subjects:
  - apiGroup: rbac.authorization.k8s.io
    kind: Group
    name: team-pool-admins
kind: List
metadata: {}
```

### Create a Manifest for Your Cluster Pool

Create a manifest for your cluster pool. The `ClusterPool` resource specification is available
at [Hive's documentation](https://pkg.go.dev/github.com/openshift/hive/apis@master/hive/v1#ClusterPool); consult that
document for more information about individual fields.

```yaml
apiVersion: hive.openshift.io/v1
kind: ClusterPool
metadata:
  name: dptp-demo-cluster-pool # name is not relevant but of course must be unique
  namespace: dptp-demo-cluster-pools
  labels: # architecture, cloud, owner, product, version are used to filter out a pool when a job claims a cluster
    architecture: amd64
    cloud: aws
    product: ocp
    owner: dptp-demo
    version: "4.7"
    version_lower: "4.7.0-0" # optional: lower bound for automatically updated imageset; required if version_upper is set
    version_upper: "4.8.0-0" # optional: upper bound for automatically updated imageset; required if version_lower is set
spec:
  baseDomain: dptp-demo.openshift.org # the base domain to install the cluster
  imageSetRef:
    name: ocp-4.7.0-amd64 # the name of the imageSet which determines the image to install the cluster; will be automatically updated if `version_*` labels are set
  installConfigSecretTemplateRef:
    name: dptp-demo-install-config # the name of the secret with an installation config for the installer
  skipMachinePools: true
  platform:
    aws:
      credentialsSecretRef:
        name: demo-aws-credentials # the name of the secret with the credentials of the cloud account
      region: us-east-1
  pullSecretRef:
    name: pull-secret
  size: 1 # the number of clusters that Hive should keep provisioned and waiting for use.
  maxSize: 10 # the maximum number of clusters that can exist at the same time.
```

Pay attention to the following stanzas:

1. `metadata.labels`: These labels will be used by jobs to specify what cluster they want to obtain for their testing.
2. `spec.baseDomain`: A base domain for all clusters created in this pool. This is the domain for which you created a
   hosted zone when configuring the cloud platform account (see [prerequisites](#prerequisites)).
3. `spec.imageSetRef`: A reference to a `ClusterImageSet` in the cluster that determines the exact version of clusters
   created in the pool. `ClusterImageSets` are cluster-scoped resources and their manifests are present
   in [`clusters/hive/pools`](https://github.com/openshift/release/tree/master/clusters/hive/pools) directory. Either
   select one of the already available, or create a new one. DPTP maintains a set of `ClusterImageSets` that are
   regularly bumped to most recent released OCP versions.
4. `spec.installConfigSecretTemplateRef`: a reference to a `Secret` that serves as an installation config template. See
   the [below section](#create-a-manifest-for-your-install-config-template-secret) for more information.
5. `spec.platform.$CLOUD.credentialsSecretRef`: A reference to the secret you created in
   the [Prepare your cloud platform credentials](#prepare-your-cloud-platform-credentials) section.
6. `pullSecretRef.name`: Must be kept `pull-secret`. OpenShift CI will populate your namespace with this secret that
   contains all pull secrets necessary to install an OCP cluster.

#### Sizing Your Cluster Pool

Hive maintains the number of clusters in the pool as specified by its `size`. A provisioned cluster will
be [hibernating](https://github.com/openshift/hive/blob/master/docs/hibernating-clusters.md) after staying idled for
some time and can be woken up if a job claims it. Hive removes it from the pool once it is claimed and creates a new
cluster to maintain the pool's `size`. The cluster will be destroyed 4 hours after it is claimed. If several jobs file
claims from one `ClusterPool` simultaneously, Hive will fulfill all claims until the number of living clusters reaches
the pool's `maxSize`.

All live and hibernated clusters consume resources in the cloud account, so your `maxSize` should be set according to
your cloud platform limits and quotas and presence of other cluster pools or other resource consumption in your cloud
platform account.

### Create a Manifest for Your Install Config Template Secret

This secret is used via a reference from the [`ClusterPool` resource](#create-a-manifest-for-your-cluster-pool) and
allows customizing the cluster, such as setting the number of workers or the type of instances. It is usually not
necessary to keep this manifest actually secret as it often does not contain anything sensitive.

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: dptp-demo-install-config
  namespace: dptp-demo-cluster-pools
stringData:
  install-config.yaml: |
    apiVersion: v1
    compute:
    - architecture: amd64
      hyperthreading: Enabled
      name: worker
      platform: {}
      replicas: 3
    controlPlane:
      architecture: amd64
      hyperthreading: Enabled
      name: master
      platform: {}
      replicas: 3
    metadata:
      name: test01
    networking:
      clusterNetwork:
      - cidr: 10.128.0.0/14
        hostPrefix: 23
      machineNetwork:
      - cidr: 10.0.0.0/16
      networkType: OpenShiftSDN
      serviceNetwork:
      - 172.30.0.0/16
    publish: External
type: Opaque
```

### Submit a PR to openshift/release

Submit a PR to openshift/release with all your new manifests. After the PR merges, the manifests are committed to the
cluster and Hive starts installing clusters for your pool.

### Use the Cluster Pool from a CI Job

After the pool manifests are applied on the `hive` cluster, the cluster pool can by used by CI jobs by setting
a `cluster_claim` stanza with values matching the labels on the pool:

```yaml
tests:
- as: some-test
  cluster_claim:
    architecture: amd64
    cloud: aws
    owner: dptp-demo
    product: ocp
    timeout: 1h0m0s
    version: "4.7"
...
```

For more details about tests that run on claimed clusters, see
the [testing with a cluster from a cluster pool](/docs/architecture/ci-operator/#testing-with-a-cluster-from-a-cluster-pool)
document.

## Troubleshooting Cluster Pools

### Accessing Cluster Installation logs
The cluster pools are maintained by Hive behind the scenes, so installation failures, cloud platform account
misconfigurations and similar issues are not exposed to actual CI jobs: the jobs will simply never successfully claim a
cluster if Hive fails to install them.

The installation logs can be found in the `hive` container logs with the following commands:

```console
# filter out the namespaces with the cluster pool's name
$ pool_name=dptp-demo-cluster-pool
$ oc get namespace --selector hive.openshift.io/cluster-pool-name=${pool_name}
dptp-demo-cluster-pool-pclkt              Active   16m

# get the provision pod name
$ oc get pod --namespace dptp-demo-cluster-pool-pclkt
NAME                                                            READY   STATUS     RESTARTS   AGE
dptp-demo-cluster-pool-pclkt-0-h5tml-provision-m2pp9   1/3     NotReady   0          18m
...

# access the logs
$ namespace=$(oc get namespaces --selector hive.openshift.io/cluster-pool-name=${pool_name} -o custom-columns=":metadata.name"  --no-headers | head -n 1)
$ pod=$(oc --namespace $namespace get pod --sort-by=.metadata.creationTimestamp -l hive.openshift.io/cluster-deployment-name=$namespace --no-headers -o custom-columns=":metadata.name" | head -n 1)
$ oc --namespace $namespace logs $pod -c hive
```


## Existing Cluster Pools

The following table shows the existing cluster pools that a user can claim a cluster from. Each pool defines a set of
characters about the clusters that are provisioned out of it. For instance, the cluster
pool `ci-ocp-4-6-amd64-aws-us-east-1` is composed of OCP 4.6 clusters on AWS's `us-east-1` region. The values of
**READY**, **SIZE** and **MAX SIZE** are taken
from [the status and the specification of each pool](https://pkg.go.dev/github.com/openshift/hive/apis@master/hive/v1#ClusterPool)
. Clicking <img src="https://datatables.net/examples/resources/details_open.png" alt="details button"> shows the more
details of the cluster pool, such as the release image that is used for provisioning a cluster and the labels defined on
the pool. The Search box can filter out the pools according to the given keyword.

The cluster pools owned by `openshift-ci` are general-purpose pools maintained by DPTP
and they can be used by anyone. Pools with different owners should be used only with
knowledge and approval of their owner. This is not currently programmaticaly enforced
but it will be soon.

{{< rawhtml >}}

<table id="table_pools" class="display" style="width:100%">
    <thead>
        <tr>
            <th></th>
            <th>NAMESPACE</th>
            <th>NAME</th>
            <th>READY</th>
            <th>SIZE</th>
            <th>MAX SIZE</th>
            <th>IMAGE SET</th>
            <th>OWNER</th>
        </tr>
    </thead>
</table>
{{< /rawhtml >}}

{{< alert title="Info" color="info" >}} The cluster pools in namespace `fake-cluster-pool` are for DPTP's internal
usage, such as e2e tests for the pool feature of `ci-operator`. For example, the claims against the
pool `fake-ocp-4-7-amd64-aws` are annotated with `hive.openshift.io/fake-cluster: "true"` which tells Hive to return a
syntactically correct `kubeconfig` right away without provisioning any cluster. {{< /alert >}}
