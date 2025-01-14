---
title: "Multi Architecture"
description: "Configure ci-operator to build container images and run tests across multiple CPU architectures"
---

# Multi Architecture

Configure ci-operator to build container images and run tests across multiple CPU architectures.

## Building Multi-Architecture Images

To build an image for the default `amd64` architecutre, no extra configuration is needed.
For adding multiple architectures, add the `additional_architectures` field under the image configuration.

The following example will build the `my-image` for `amd64` (default) and `arm64`.

```yaml
base_images:
  os:
    name: ubi-minimal
    namespace: ocp
    tag: "9"
images:
- context_dir: .
  from: os
  to: my-image
  additional_architectures:
  - arm64
```

In the above example, the `os` image defined in the `base_images` is used as a base to build the `my-image` image.
Since the `additional_architectures` is defined for `arm64`, the `os` image must be combatible with `arm64` architecture too.

## Running Tests on Different Architectures

To run tests on a specific architecture, add the node_architecture field to your test configuration:

```yaml
tests:
- as: unit
  commands: make unit
  container:
    from: src
  node_architecture: arm64
```

This test uses `src` as a base image to run the `unit` test. Ci-operator will determine that the `src` image needs to be build for `arm64` architecture
will resolve the image build graph based on this information. Learn more about image lifecycle in [#image-pipeline](https://docs.ci.openshift.org/docs/internals/#image-pipeline)


## Cluster selection

There is currently no need to configure a specific cluster to your test. Cluster selection is achieved via the prowjob dispatcher component. Based on the [capabilities](https://github.com/openshift/release/blob/master/core-services/sanitize-prow-jobs/_clusters.yaml) of the cluster, the correct selection will be done based on the job's needs.

## Notes
Available architectures: `amd64`, `arm64`. For availability of other architectures, please contact us.
