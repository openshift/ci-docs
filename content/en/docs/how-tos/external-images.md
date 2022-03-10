---
title: "Using External Images in CI"
description: How to mirror external images to the CI environments for use in jobs.
---

The `ci-operator` config only allows to reference `ImageStreamTags`, it does not allow to specify arbitrary Docker pull specs. In order
to use external images, they need to be mirrored to [the central CI registry](/docs/how-tos/use-registries-in-build-farm/#summary-of-available-registries).

## Mirror Public Images

If the source image is open to the public, we can mirror the image by adding it into a mapping file in
[the `core-services/image-mirroring/supplemental-ci-images` folder](https://github.com/openshift/release/tree/master/core-services/image-mirroring/supplemental-ci-images/) of `openshift/release` repository. The following line in the `mapping_supplemental_ci_images_ci` file mirrors 
`gcr.io/k8s-staging-boskos/boskos:latest` to `registry.ci.openshift.org/ci/boskos:latest`. The naming convention of the mapping file is `mapping_supplemental_ci_images_<namespace>`, e.g., the images in `mapping_supplemental_ci_images_ci` are mirrored to the namespace `ci`.

{{< highlight text >}}
gcr.io/k8s-staging-boskos/boskos:latest registry.ci.openshift.org/ci/boskos:latest
{{< / highlight >}}

The hourly periodic job [`periodic-image-mirroring-supplemental-ci-images`](https://prow.ci.openshift.org/?job=periodic-image-mirroring-supplemental-ci-images)
mirrors all the images defined in the mapping files.  Note that it operates on
the contents of the `master` branch, so the changes to the files have to be
merged before the images can be used in jobs and/or pull request rehearsals.
Once it is mirrored, you can use the image like this:

{{< highlight yaml >}}
base_images:
  my-external-image:
    namespace: ci
    name:  boskos
    tag: latest
{{< / highlight >}}

{{< alert title="Warning" color="warning" >}}
It is not possible to use Red Hat managed namespaces. Therefore, you cannot mirror your image to **any** namespace that
matches the following regular expression: (^kube.*|^openshift.*|^default$|^redhat.*)
{{< /alert >}}

## Mirror Private Images

If the image is in a private registry that requires authentication to pull it, you will need to [add your credentials](/docs/how-tos/adding-a-new-secret-to-ci/) and define a new periodic [mirroring job](/docs/how-tos/mirroring-to-quay/) with it.

We cannot reuse the existing job as the keys in the credentials config are registries and we might have to set up multiple credentials for the same registry.
