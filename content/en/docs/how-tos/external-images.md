---
title: "Using External Images in CI"
description: How to mirror external images to the CI environments for use in jobs.
---

The `ci-operator` config only allows referencing an image in the form of `namespace/name:tag`, it does not allow the specification of arbitrary Docker pull specs. In order
to use external images, they need to be mirrored to [QCI](/docs/how-tos/use-registries-in-build-farm/#the-ci-image-repository-in-quayio-qci).

## Mirror Public Images

If the source image is open to the public, we can mirror it to [QCI](/docs/how-tos/use-registries-in-build-farm/#the-ci-image-repository-in-quayio-qci) by adding it into [the configuration file](https://github.com/openshift/release/blob/master/core-services/image-mirroring/_config.yaml) in
[the `core-services/image-mirroring` folder](https://github.com/openshift/release/tree/master/core-services/image-mirroring/) of `openshift/release` repository.

```yaml
supplementalCIImages:
  ci/boskos:latest:
    image: gcr.io/k8s-staging-boskos/boskos:latest
  ci/ci-tools-build-root:1.21:
    namespace: ci
    name: ci-tools-build-root
    tag: "1.21"
```

The above stanza indicates the image `gcr.io/k8s-staging-boskos/boskos:latest` is pushed to QCI as `quay.io/openshift/ci:ci_boskos_latest` and
`registry.ci.openshift.org/ci/ci-tools-build-root:1.21` as `quay.io/openshift/ci:ci_ci-tools-build-root_1.21`. The target of the mapping
`supplementalCIImages` is of the form `namespace/name:tag` and the source is specified either by `image` or a reference of an `imagestreamtag` on `app.ci`. The latter kind of source is useful when the source image is on `app.ci`, e.g., the output of a `buildConfig`.
It takes a couple of hours to complete the mirroring after the change on the configuration file is merged.
Once the target image lands on QCI, it can be referred in ci-operator's config file such as the following:

{{< highlight yaml >}}
base_images:
  my-external-image:
    namespace: ci
    name:  boskos
    tag: latest
{{< / highlight >}}

{{< alert title="Warning" color="warning" >}}
- We cannot mirror images from `docker.io` due to rate limiting constraints. Please, instead, push up an image to quay and mirror that to QCI.
- Before [DPTP-3915](https://issues.redhat.com/browse/DPTP-3915) is in place, the target should be chosen carefully to avoid overriding existing images in QCI. It can be verified by pulling the targeting image from QCI.
{{< /alert >}}


## The mapping files: Deprecated
The mapping files in [the `core-services/image-mirroring/supplemental-ci-images` folder](https://github.com/openshift/release/tree/master/core-services/image-mirroring/supplemental-ci-images/) of `openshift/release` repository will be replaced with the mapping in the configuration file above. From now on, no new images will be accepted for those files. It is WIP at the moment.
Once the migration is complete, the hourly periodic job [`periodic-image-mirroring-supplemental-ci-images`](https://prow.ci.openshift.org/?job=periodic-image-mirroring-supplemental-ci-images) that consumes the mapping files will be removed.

## Mirror Private Images

It is not supported at the moment to mirror external private images to the central CI registry.
