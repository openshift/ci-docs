---
title: "Mirror an image to an external registry"
date: 2020-10-05T11:14:39-04:00
draft: false
---


## Requirements

In order to mirror an image built by CI to Quay, that image must be [promoted.](/docs/architecture/ci-operator/#publishing-container-images)

If the image is promoted into a namespace for which no other image mirroring is set up yet, some RBAC needs to
be configured:

* Create a folder in [app.ci](https://github.com/openshift/release/tree/master/clusters/app.ci) with the name of the namespace, containing the manifests of the namespace and the RBAC regarding to that namespace.
* The admin of the namespace should allow the SA in the mirroring job defined below to access the images with `oc image mirror`,
	like this, which makes the images open to the public:

{{< highlight yaml >}}
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: image-puller
  namespace: openshift-kni
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: system:image-puller
subjects:
- apiGroup: rbac.authorization.k8s.io
  kind: Group
  name: system:unauthenticated
- apiGroup: rbac.authorization.k8s.io
  kind: Group
  name: system:authenticated
{{< / highlight >}}

## Mirroring Images

Periodically, `oc image mirror` is used to push a configured set of images to Quay repositories. A number of Quay
repositories already have mirroring pipelines configured; each directory
[here](https://github.com/openshift/release/tree/master/core-services/image-mirroring) corresponds to a repository.
These directories contain mapping files that define tags on images in the target repository. New images may be submitted
to mirror to existing repositories, or new ones.

### Existing Repositories

Submit a pull request adding the image source and target to the appropriate mirroring file. For instance, adding a new
image tag to the `quay.io/openshift:4.6` image would require a new entry in the
[`core-services/image-mirroring/openshift/mapping_origin_4_6`](https://github.com/openshift/release/tree/master/core-services/image-mirroring/openshift/mapping_origin_4_6)
file. Adding a new image entirely would require a new `mapping_origin_*` file.

{{< alert title="Warning" color="warning" >}}
Images that are mirrored to Quay for the first time are **private** by default and need to be made public by an administrator of the Quay organization. For `openshift` organization, contact Clayton Coleman about making images public.
{{< /alert >}}

## Configuring Mirroring for New Repository

Submit a PR adding a new subdirectory
[here](https://github.com/openshift/release/tree/master/core-services/image-mirroring), with at least a single mapping file
and an `OWNERS` file (so that you can maintain your mappings). The mapping files
should follow the `mapping_$name$anything` naming convention to avoid conflicts
when put into a `ConfigMap`.

Additionally, you will need to add a new Periodic job
[here](https://github.com/openshift/release/blob/master/ci-operator/jobs/infra-image-mirroring.yaml). You can use
any of the jobs as sample and simply replace all occurences of the value found in the `ci.openshift.io/area` label
(e.g. `knative`) with the name of your repository (which should be the same as the name of the directory you created).

In oder to push images to an external  repository, credentials are needed. Use `docker` or `podman` to create a docker config
file as described [here](https://kubernetes.io/docs/tasks/configure-pod-container/pull-image-private-registry/#log-in-to-docker)
and then talk to @dptp-helpdesk in the #forum-testplatform channel in the CoreOS Slack to get it into the clusters.
