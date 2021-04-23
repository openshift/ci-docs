---
title: "Using External Images in CI"
description: How to import external images to the CI environments for use in jobs.
---

The `ci-operator` config only allows to reference `ImageStreamTags`, it does not allow to specify arbitrary Docker pull specs. In order
to use external images, they need to be imported. For this, create a file in the
[`openshift/release` repository in the `clusters/app.ci/supplemental-ci-images` folder](https://github.com/openshift/release/tree/master/clusters/app.ci/supplemental-ci-images)
that looks like the following:


{{< highlight yaml >}}
apiVersion: image.openshift.io/v1
kind: ImageStream
metadata:
  name: boskos
  namespace: ci
spec:
  tags:
  - name: latest
    from:
      kind: DockerImage
      name: gcr.io/k8s-staging-boskos/boskos:latest
    importPolicy:
      scheduled: true
{{< / highlight >}}

Now you can use the image like this:
{{< highlight yaml >}}
base_images:
  my-external-image::
    namespace: ci
    name:  boskos
    tag: latest
{{< / highlight >}}

Note that if your image is in a private registry that requires authentication to pull it, you will need to [add your credentials](/docs/how-tos/adding-a-new-secret-to-ci/) and ensure that you use the [`Local`](https://docs.openshift.com/container-platform/4.7/rest_api/image_apis/imagestream-image-openshift-io-v1.html) `referencePolicy` on your `ImageStream` to allow downstream consumers to not require authentication:

{{< highlight yaml >}}
apiVersion: image.openshift.io/v1
kind: ImageStream
metadata:
  name: secret
  namespace: my-namespace
spec:
  tags:
  - name: latest
    from:
      kind: DockerImage
      name: secret.io/secret/secret:latest
    importPolicy:
      scheduled: true
    referencePolicy: # this is required for downstream users to pull this image without authenticating
      type: Local
{{< / highlight >}}