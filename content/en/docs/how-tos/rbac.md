---
title: "Set Up RBACs on CI Clusters"
description: How to set up RBACs on CI clusters.
---

[All the clusters](/docs/getting-started/useful-links/#clusters) for Openshift CI have enabled authentication via Red Hat SSO.
The [RBAC](https://docs.openshift.com/container-platform/4.6/authentication/using-rbac.html) manifests defined in [the clusters folder of the release
repo](https://github.com/openshift/release/tree/master/clusters) are applied automatically to the clusters. 

## Rover Groups
For privacy reasons, we avoid referring to specific usernames in all RBAC manifests stored in the repository.
As an enforced convention, users are not allowed to be subjects of the RoleBinding and ClusterRoleBinding manifests: every subject is either a `Group` or a `ServiceAccount`. Moreover, each group has to be a [Red Hat Rover group](https://rover.redhat.com/groups/).

For the same privacy reasons, we disallow maintaining Group manifests directly in the repository. Instead, the users need to use the Red Hat's Rover Groups feature to maintain the list of RH users belonging to a group, and Test Platform tooling will maintain the Group resources on OpenShift CI cluster to contain users corresponding to the Rover group.

## Configuration
By default, every group used in the manifests is created on all CI clusters. [A configuration file](https://github.com/openshift/release/blob/master/core-services/sync-rover-groups/_config.yaml) is used to address special cases.

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

## Troubleshooting
No API is provided to create Rover groups. We have to do some manual work on the existing groups and the RBACs with user subjects.

### Existing Groups
The existing groups defined in the release repo will be removed from the release repo and the clusters. 
If such a group is used as a subject in a RBAC manifest, then its owner has to ensure the group also exists on Rover. In case that the group name cannot be managed by the owner, e.g., the desired group name is taken by other teams, then the RBAC manifest has to use another Rover group.


### Existing User Subjects
The user subjects will be removed from the existing RBAC manifests.
The owner has to modify the manifest to use Rover groups.
