---
title: "Mirror an Image to an External Registry"
description: How to mirror an image built in the CI system out to an external registry.
---

## Requirements

In order to mirror an image built by CI to Quay, that image must be [promoted](/architecture/ci-operator/#publishing-container-images).

If the image is promoted into a namespace for which no other image mirroring is set up yet, some RBAC needs to
be configured:

* Create a folder in [clusters/app.ci/registry-access](https://github.com/openshift/release/tree/master/clusters/app.ci/registry-access) with the name of the namespace, containing the manifests of the namespace and the RBAC regarding to that namespace. Provide an `OWNERS` file to allow your team to make changes to those manifests.
* The admin of the namespace should allow the SA in the mirroring job defined below to access the images with `oc image mirror`,
	like this, which makes the images open to all authenticated users on `app.ci`:

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
  name: system:authenticated
{{< / highlight >}}

## Mirroring Images

Periodically, `oc image mirror` is used to push a configured set of images to Quay repositories. A number of Quay
repositories already have mirroring pipelines configured; each directory
[here](https://github.com/openshift/release/tree/master/core-services/image-mirroring) corresponds to a repository.
These directories contain mapping files that define tags on images in the target repository. New images may be submitted
to mirror to existing organizations, or new ones.  When naming your new image, please follow the [naming guidelines](https://github.com/openshift/release/blob/master/core-services/image-mirroring/openshift/GUIDELINES.md).
For `quay.io/openshift/...` images, whether they will be [included in the OpenShift release payload](/how-tos/onboarding-a-new-component/#product-builds-and-becoming-part-of-an-openshift-release) or not, also consider consulting [the OpenShift mirroring approvers](https://github.com/openshift/release/blob/master/core-services/image-mirroring/openshift/OWNERS), to review your name choices, before sinking significant time into work that depends on that naming (like creating Git repositories, requesting image repositories from [Software Production][CLOUDBLD], or writing multiple Go packages).

### Existing Organizations

Submit a pull request adding the image source and target to the appropriate mirroring file. For instance, adding a new
image tag to the `quay.io/openshift:4.6` image would require a new entry in the
[`core-services/image-mirroring/openshift/mapping_origin_4_6`](https://github.com/openshift/release/tree/master/core-services/image-mirroring/openshift/mapping_origin_4_6)
file. Adding a new image entirely would require a new `mapping_origin_*` file.

{{< alert title="Warning" color="warning" >}}
Images that are mirrored to Quay for the first time are **private** by default and need to be made public by an administrator of the Quay organization. For the `openshift` organization, contact Doug Hellmann, Ben Parees, or Justin Pierce about making images public.  They
will be checking to ensure your image does not contain private or licensed content such as RHEL or internal RHEL packages.
{{< /alert >}}

### Configuring Mirroring for New Organization

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
and then use our [self-service portal](/how-tos/adding-a-new-secret-to-ci/#add-a-new-secret) to add it to the clusters,
using the following keys in Vault:

{{< highlight yaml >}}
secretsync/target-namespace: "ci"
secretsync/target-name: "registry-push-credentials-quay-io-NEW_ORGANIZATION"
secretsync/target-clusters: "app.ci"
{{< / highlight >}}

Then, the mirroring jobs can mount the secret as a volume:

{{< highlight yaml >}}
periodics:
- agent: kubernetes
  cluster: app.ci
  cron: '@hourly'
  decorate: true
  labels:
    ci.openshift.io/area: NEW_ORGANIZATION
    ci.openshift.io/role: image-mirroring
  name: periodic-image-mirroring-NEW_ORGANIZATION
  spec:
    automountServiceAccountToken: true
    containers:
    - command:
      - /tp-entrypoint.sh
      env:
      - name: HOME
        value: /home/mirror
      - name: MAPPING_FILE_PREFIX
        value: mapping_NEW_ORGANIZATION
      - name: dry_run
        value: "false"
      image: registry.ci.openshift.org/ci/image-mirror:oc-415
      imagePullPolicy: Always
      name: ""
      resources:
        requests:
          cpu: 500m
      volumeMounts:
      - mountPath: /home/mirror/.docker/config.json
        name: push
        readOnly: true
        subPath: config.json # this matches the key in the secret
      - mountPath: /etc/imagemirror
        name: config
    volumes:
    - name: push
      secret:
        secretName: registry-push-credentials-quay-io-NEW_ORGANIZATION # this matches the secretsync/target-name
    - configMap:
        name: image-mirror-mappings
      name: config
{{< / highlight >}}

### Dry-run and Rehearsing

Adding the label `pj-rehearse.openshift.io/can-be-rehearsed: "true"` onto the above job makes it [rehearsable](/how-tos/contributing-openshift-release/#rehearsals)
which is useful for a new mirroring job whose the mapping files have been merged and lands into `configMap/image-mirror-mappings`.
The environment variable `dry_run=true` prints the actions that would be taken and exit without pushing the images to the destinations.
If the output of the rehearsal looks satisfactory, remove the label and set `dry_run=false`. Thus the pull request is ready to go.

### Mirror Images With Wildcard

The `*` wildcard might be useful in the case that the images are [tagged by commit](/architecture/ci-operator/#publishing-images-tagged-by-commit)
and it is desired to mirror every produced tag.
For example, the following line in the mapping file mirrors all tags of `my-imagestream` in `my-namespace` to the destination repository:

```txt
registry.ci.openshift.org/my-namespace/my-imagestream:* quay.io/myrepository/myimage
```

