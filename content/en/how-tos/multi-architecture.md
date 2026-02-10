---
title: "Multi Architecture"
description: "Configure ci-operator to build container images and run tests across multiple CPU architectures"
---

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
will resolve the image build graph based on this information. Learn more about image lifecycle in [#image-pipeline](https://docs.ci.openshift.org/internals/#image-pipeline)

## Override the Node Architecture in Workflow Steps

When using a workflow you have two options for setting the architecture for the steps:

1. **Workflow-level setting:**
   You can define `node_architecture` inside the `steps` block. This setting applies to every step in the workflow. If this setting is omitted, the step registry will use the `node_architecture` defined at the test level. If neither is defined, no node architecture is set, and the cluster and the image will determine the node to run on.

2. **Step-specific overrides:**
   Instead of affecting every step, you can use the `node_architecture_overrides` field inside the `steps` block to set a different architecture for specific steps. This field adds the `node_architecture` attribute only to the designated steps, leaving the rest of the workflow using the workflow-level (or test-level) setting. If both exist, the overrides always take precedence for the steps they target.

For example:

```yaml
tests:
- as: my-test
  steps:
    # This setting applies to every step in the workflow.
    node_architecture: amd64

    # If the node_architecture setting above is not provided, then the node_architecture
    # defined in the test (if any) from the step registry will be used.
    # If neither is present then no node_architecture is applied,
    # and the cluster with a compatible image will be used.

    # Overrides for specific steps.
    node_architecture_overrides:
      ipi-conf: arm64      # Overrides the architecture only for 'ipi-conf'
      other-step: arm64    # Overrides the architecture only for 'other-step'
    cluster_profile: aws
    test:
      - as: test
        cli: latest
        commands: myscript.sh
        from: src
    workflow: ipi-aws
```

In this configuration, all steps in the workflow will run with `amd64` unless a step is specifically overridden by `node_architecture_overrides` (as is the case for `ipi-conf` and `other-step`). If the `node_architecture` field in steps is missing, then the step registry falls back to the test-level `node_architecture`. Finally, if neither is defined, then no specific node architecture is set, and the cluster and the image determine the node.

## Cluster selection

There is currently no need to configure a specific cluster to your test. Cluster selection is achieved via the prowjob dispatcher component. Based on the [capabilities](https://github.com/openshift/release/blob/main/core-services/sanitize-prow-jobs/_clusters.yaml) of the cluster, the correct selection will be done based on the job's needs.

## Notes
Available architectures: `amd64`, `arm64`. For availability of other architectures, please contact us.
