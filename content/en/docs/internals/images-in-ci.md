---
title: "Images in CI"
description: Debugging the issues about the images in CI.
---

This page explains how the images in CI are stored and referenced in the tests.

## QCI

[QCI](/docs/how-tos/use-registries-in-build-farm/#summary-of-available-registries),
the image repository `quay.io/openshift/ci`, stores all images used in OpenShift CI.
There are the following kinds images in `QCI`:
- [promoted](/docs/architecture/ci-operator/#publishing-container-images) by CI jobs, or
- [mirrored from external repositories](/docs/how-tos/external-images/).

Any reference of an image stream tag in CI will be resolved _eventually_ by the image in `QCI` at the runtime of `ci-operator`.
For example, the tag `ocp/4.5:base` in the following `ci-operator`'s configuration
is meant actually to use `quay.io/openshift/ci:ocp_4.5_base`.

```yaml
base_images:
  base:
    name: "4.5"
    namespace: "ocp"
    tag: "base"
```

Only Test-Platform members and their automation have access to `QCI` directly.

## QCI-APPCI

The [reverse-proxy](https://github.com/openshift/release/blob/master/clusters/app.ci/assets/admin_qci-appci.yaml) (`quay-proxy.ci.openshift.org`) `QCI-APPCI` of `QCI` is the face of the images in QCI for human users and the 3rd party applications.
Its existence is due to the fact that it delegates the access control of the images in `QCI` to the `RBAC`s on `app.ci`, i.e.,
human users and the service accounts on `app.ci` can pull images in `QCI` via `QCI-APPCI`.


For example, the above `base` image will lead to a tag specified in [the `pipeline` image stream](/docs/architecture/ci-operator/#referencing-images):

```yaml
apiVersion: image.openshift.io/v1
kind: ImageStream
metadata:
  name: pipeline
  namespace: ci-op-j80rqjq0
spec:
  tags:
  - from:
      kind: DockerImage
      name: quay-proxy.ci.openshift.org/openshift/ci:ocp_4.5_base
    name: base
```

## The Cache Server for QCI

For reducing the cost, [the pull-through cache server](https://github.com/openshift/release/blob/master/clusters/app.ci/quayio-pull-through-cache/qci-pull-through-cache-us-east-1.yaml) `qci-pull-through-cache-us-east-1-ci.apps.ci.l2s4.p1.openshiftapps.com` for QCI is deployed. Only Test-Platform members and their automation have access to it.
It is used by [`ImageTagMirrorSet` and `ImageDigestMirrorSet`](https://docs.openshift.com/container-platform/4.15/openshift_images/image-configuration.html#images-configuration-registry-mirror_image-configuration) defined on all CI clusters.

```yaml
apiVersion: config.openshift.io/v1
kind: ImageTagMirrorSet
metadata:
  name: quay-proxy
spec:
  imageTagMirrors:
  - mirrors:
    - qci-pull-through-cache-us-east-1-ci.apps.ci.l2s4.p1.openshiftapps.com/openshift/ci
    - quay.io/openshift/ci
    source: quay-proxy.ci.openshift.org/openshift/ci
```

By the above `ImageTagMirrorSet`, OpenShift tries to replace each image in `QCI-APPCI` e.g., `quay-proxy.ci.openshift.org/openshift/ci:ocp_4.5_base`
with the counter image in the cache, e.g. `qci-pull-through-cache-us-east-1-ci.apps.ci.l2s4.p1.openshiftapps.com/openshift/ci:ocp_4.5_base`,
and then with the `QCI` image `quay.io/openshift/ci:ocp_4.5_base` if the attempt to the cache fails, and then
failover to the source `QCI-APPCI` image `quay-proxy.ci.openshift.org/openshift/ci:ocp_4.5_base` which is unlikely to happen since
`QCI` is where all CI images are stored.
Although `QCI-APPCI` shows up everywhere, with the mirroring manifests above working properly `QCI-APPCI` has only light traffic
from Human users and 3rd party applications since the rest is redirected to its mirrors.

The necessary credentials are set up on all CI clusters and thus the mirroring process should be transparent to CI users.
However, the additional layers of components on top of `QCI` might increase the amount of challenges for [troubleshooting](/docs/internals/images-in-ci/#troubleshooting) issues related to CI images.


## The Integrated Image Registry on APP.CI

The integrated image registry on `app.ci`, `registry.ci.openshift.org`, had been authoritative central CI registry
before `QCI` took over the role.
For the sake of Release Controllers, the promoted images are also available on `app.ci`.


## Troubleshooting

Most issues related to the images in the CI tests are caused by failures of referencing images.
The `imagestreams.json` and `ci-operator.log` in the Prow job's artifacts usually provide more details about the error.
The typical troubleshooting procedure is to figure out why the error happened.

For instance, the `message` on a `tag` from the underlying image stream's `status` shows 

> dockerimage.image.openshift.io "quay.io/openshift/ci:ocp_builder_rhel-9-golang-1.21-ci-build-root-multi-openshift-4.16" not found

In this case, we will verify if the error can be reproduced by `podman pull` command.
If positive, we need to find out how the image is created.
As mentioned in [the `QCI` section above](/docs/internals/images-in-ci/#qci), the images in `QCI` are
either promoted or mirrored.
The utility `make explain` from [ci-tools](https://github.com/openshift/ci-tools/tree/master/cmd/promoted-image-governor#explain)
is helpful for the first case and there should be some clue in [ci-images-mirror](https://github.com/openshift/ci-tools/tree/master/cmd/ci-images-mirror)'s [configuration](https://github.com/openshift/release/blob/master/core-services/image-mirroring/_config.yaml)
for the 2nd.

Mostly, the not-found image is either not promoted yet or not mirrored yet.
In the first case, we can trigger the job that promotes the missing image.
In the 2nd one, we need to check if the error in pod log of ci-images-mirror which triggers an alert as well.
See the [SOP](https://github.com/openshift/release/blob/master/docs/dptp-triage-sop/misc.md#quay-io-image-mirroring-failures) of the corresponding alert.
