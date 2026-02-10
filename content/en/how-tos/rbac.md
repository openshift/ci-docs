---
title: "Set Up RBACs on CI Clusters"
description: How to set up RBACs on CI clusters.
---

[All the clusters](/getting-started/useful-links/#clusters) for Openshift CI have enabled authentication via Red Hat SSO.
The [RBAC](https://docs.openshift.com/container-platform/4.6/authentication/using-rbac.html) manifests defined in [the clusters folder of the release
repo](https://github.com/openshift/release/tree/main/clusters) are applied automatically to the clusters. 

## Rover Groups
For privacy reasons, we avoid referring to specific usernames in all RBAC manifests stored in the repository.
As an enforced convention, users are not allowed to be subjects of the RoleBinding and ClusterRoleBinding manifests: every subject is either a `Group` or a `ServiceAccount`. Moreover, each group has to be a [Red Hat Rover group](https://rover.redhat.com/groups/) or a renamed group from a Rover group via [configuration](/how-tos/rbac/#configuration).

For the same privacy reasons, we disallow maintaining Group manifests directly in the repository. Instead, the users need to use the Red Hat's Rover Groups feature to maintain the list of RH users belonging to a group, and Test Platform tooling will maintain the Group resources on OpenShift CI cluster to contain users corresponding to the Rover group.

## Configuration
By default, every group used in the manifests is created on all CI clusters. [A configuration file](https://github.com/openshift/release/blob/main/core-services/sync-rover-groups/_config.yaml) is used to address special cases.

```yaml
cluster_groups:
  dp-managed:
  - build01
  - build02
groups:
  test-platform-ci-monitoring-viewers:
    clusters:
    - app.ci
    cluster_groups:
    - dp-managed
    rename_to: ci-monitoring-viewers
  some-invisible-group: {}
```

- Group renaming: In the above example, the Rover group `test-platform-ci-monitoring-viewers` is renamed to `ci-monitoring-viewers` on the clusters.

- Not all clusters: The Rover group `test-platform-ci-monitoring-viewers` is created on `app.ci`, and `cluster_groups/dp-managed` which is composed of `build01` and `build02`.

- `some-invisible-group: {}` implies that the Rover group `some-invisible-group` exists on all clusters, even if it is not used by any manifests.
  
{{< alert title="Info" color="info" >}}
  The group syncing from rover is handled by a couple of periodics that only run once per day. You may have to wait up to 48 hours for your privileges to propagate to the cluster(s).
{{< /alert >}}

## Troubleshooting
No API is provided to create Rover groups. We have to do some manual work on the existing groups and the RBACs with user subjects.

### Existing Groups
The existing groups defined in the release repo will be removed from the release repo and the clusters. 
For example, `group/cvp-pool-admins` cannot exist any more in the release repo because it contains usernames.

```yaml
apiVersion: user.openshift.io/v1
kind: Group
metadata:
  name: cvp-pool-admins
users:
- bob
- jim
```

When it is removed from the release repo and the cluster, the members of the group lose the corresponding permissions on the clusters.
To retrieve the permissions, we have to modify RBACs in the release repo and/or
update [the config file](https://github.com/openshift/release/blob/main/core-services/sync-rover-groups/_config.yaml).

The most common case is that we can use an existing [Rover](https://rover.redhat.com/groups/) group, e.g, `cvp-team` as subjects of RBACs.

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: cvp-pool-admins
  namespace: cvp-cluster-pool
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: hive-cluster-pool-admin
subjects:
- apiGroup: rbac.authorization.k8s.io
  kind: Group
  name: cvp-team ### an existing Rover group
```

Update [the config file](https://github.com/openshift/release/blob/main/core-services/sync-rover-groups/_config.yaml) with the following stanza because the group is needed only on the `hive` cluster.

```yaml
groups:
  cvp-team:
    clusters:
    - hive
```

Optionally the group name on the cluster can be modified by `rename_to`:  If `rename_to` is not set, the group name on the cluster is the same as the Rover group.
Otherwise, the value of `rename_to` is the group name on the cluster,
and thus should be used as a `subject` of any `RoleBinding` or `RoleBinding` such as `RoleBinding/cvp-pool-admins` above.

```yaml
groups:
  cvp-team:
    clusters:
    - hive
  rename_to: cvp-pool-admins
```

### Existing User Subjects
The user subjects will be removed from the existing RBAC manifests.
The owner has to modify the manifest to use Rover groups.
