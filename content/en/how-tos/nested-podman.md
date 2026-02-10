---
title: "Run Podman in a Test Container"
description: How to run a test that uses Podman to spawn containers.
---

## Problem Overview

Like almost anything else, a test payload runs in a container within the Test Platform infrastructure.
Some developers find it convenient to use Podman to create new containers within their unit, integration or e2e tests and,
as stated above, this requires the infrastructure to support nested containerization.

This documentation page describes how to use Podman to create a new container in a test managed by `ci-operator`.  

We will be referring to this feature as `nested-podman`.

## Test Setup

Nested containerization in Test Platform is not enabled on any build cluster by default as it requires a combination of some OpenShift and k8s features to be enabled, and not all the clusters possess them.

### Capability

Only the clusters tagged with the `nested-podman` **capability** (see [capabilities](../capabilities/)) are able to run a container within a container.
To check which capabilities are supported by a cluster, refer to [_clusters.yaml](https://github.com/openshift/release/blob/main/core-services/sanitize-prow-jobs/_clusters.yaml).  
Below is an example of how to set this capability on a test:

```yaml
- as: nested-podman-unit-test
  capabilities:
  - nested-podman
```

### Base Image

Other than having `podman` itself available, the image running the test needs to perform some preliminary steps to prepare the environment by running an `entrypoint.sh` script.  
The [catatonit](https://github.com/openSUSE/catatonit) application is also required to run as an init process. It will also run `entrypoint.sh` as child process that would, in turn, run the real test payload.

An image with such a requirements is already avaiable in Test Platform CI to be used as base image.  
What follows is the pullspec that can be used within a `ci-operator` configuration:

```yaml
base_images:
  nested-podman:
    namespace: ci
    name: nested-podman
    tag: latest
```

### Enable The Feature on a Test
The `nested-podman` feature is available for the use on [multi-stage tests](../../architecture/step-registry/) and on regular [test steps](../../internals/steps/#test-steps).  
It's an opt-in feature, enabled as show in the example below:  

```yaml
tests:
# In a test step
- as: unit
  nested_podman: true

# In a multi-stage test
- as: e2e
  steps:
    test:
    - as: e2e
      nested_podman: true
```

### Working Example

What follows is an example of a `ci-operator` configuration defining a `unit` test and an `e2e` test, both using the `nested-podman` feature.  
This example includes all the requirements described above, along with comments explaining the purpose of each stanza.

```yaml
base_images:
  # Tag the `nested-podman` enabled base image into the test namespace.
  nested-podman:
    namespace: ci
    name: nested-podman
    tag: latest
  cli:
    name: "4.19"
    namespace: ocp
    tag: cli
build_root:
  image_stream_tag:
    namespace: ci
    name: ci-tools-build-root
    tag: "1.23"
images:
# Use the `nested-podman` as a base image for the e2e test.
# Copy the source code and the oc binary into it.
- from: nested-podman
  dockerfile_literal: |
      FROM nested-podman
      COPY oc /usr/bin/oc
      COPY src/ /opt/app-root/src/
      WORKDIR /opt/app-root/src
  inputs:
    cli:
      paths:
      - destination_dir: .
        source_path: /usr/bin/oc
    src:
      paths:
      - destination_dir: src/
        source_path: /go/src/github.com/openshift/ci-tools
  to: e2e-image
resources:
  '*':
    requests:
      cpu: "1"
      memory: 1Gi
tests:
- as: unit
  # Claim a cluster that support nested containerization
  capabilities:
  - nested-podman
  # Enable the feature
  nested_podman: true
  commands: |
    podman run --env=POSTGRES_PASSWORD=password --publish=5432 \
      docker.io/postgres:14 \
      -c log_destination=stderr \
      -c log_statement=all \
      -c logging_collector=off
  container:
    # The base image can also be used right away.
    from: nested-podman

- as: e2e
  # Claim a cluster that support nested containerization
  capabilities:
  - nested-podman
  steps:
    test:
    - as: e2e
      # Enable the feature
      nested_podman: true
      commands: |
        podman run --env=POSTGRES_PASSWORD=password --publish=5432 \
          docker.io/postgres:14 \
          -c log_destination=stderr \
          -c log_statement=all \
          -c logging_collector=off
      from: e2e-image
      resources:
        requests:
          cpu: 100m
          memory: 200Mi
zz_generated_metadata:
  branch: main
  org: openshift
  repo: ci-tools
```