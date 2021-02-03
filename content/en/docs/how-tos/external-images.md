---
title: "Using External Images in CI"
date: 2020-10-05T11:14:39-04:00
draft: false
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
