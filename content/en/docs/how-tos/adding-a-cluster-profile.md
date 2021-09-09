---
title: "Add a New Cluster Profile"
description: How to add a cluster profile to the test platform.
---
This document lays out the process of getting a new cluster profile added to the test platform so that jobs can begin using it.

## What a Cluster Profile?

The `cluster_profile` is a `ci-operator` concept that bundles together a couple of concepts to make it easier to configure jobs and steps that can operate on different cloud infrastructures.

When a `cluster_profile` is added to a job or workflow, the following actions occur:

 - all steps in the workflow will have [`credentials`](/docs/architecture/step-registry/#injecting-custom-credentials) mounted at `$CLUSTER_PROFILE_DIR` that contains credentials for cloud accounts, image registries, *etc*
 - the test will implicitly ask for a [`lease`](/docs/architecture/step-registry/#implicit-lease-configuration-with-cluster_profile) and expose it with `$LEASED_RESOURCE`
 - all steps in the test will implicitly declare [`dependencies`](/docs/architecture/ci-operator/#referring-to-images-in-tests) on imported OpenShift release images
 - all steps will have a number of environment variables set, such a `$CLUSTER_TYPE`, `$IMAGE_FORMAT` and `$KUEBCONFIG`
 
Generally, the major difference between `cluster_profile`s is the content of the credentials. These credentials are stored in the test platform clusters using naming convention: `cluster-secrets-<name>`; so, the `aws` profile stores credentials in `cluster-secrets-aws`.

## Adding a New Cluster Profile

When adding a new `cluster_profile`, three major steps must be taken: registering the profile inside of `ci-operator`, adding the new leases to `Boskos`, and providing the credentials.

### Registering a New Profile

As `cluster-profile`s are handled as first-class items in the `ci-operator` configuration, a new pull request ([example](https://github.com/openshift/ci-tools/commit/b89a00a9a39acd29d68f7490f49cf93b50cc0d21#diff-2a51a519993c716f3906647228a199e77fad62246de50d88b348a52255837bf9)) must be sent to the `openshift/ci-tools` repository in order to register a new profile.

### Adding New Leases

In the pull request to `openshift/ci-tools`, the mapping between a `cluster_profile` and the implcit `lease` that will be requested is determined. The standard is to use leases named `<name>-quota-slice`, so the `aws` profile uses `aws-quota-slice`. The resources for leasing must be [registered](/docs/architecture/quota-and-leases/#adding-a-new-type-of-resource) with our leasing server ([example](https://github.com/openshift/release/commit/1f775399dfd636a1feca304fb9b6944ca2dd8fb9#diff-5169f2a74d1497f38a44e9adc57f6993269a89c3ddf90ab01f5d1d114ef61e58)).

### Providing Credentials

The credentials provided to tests that declare a `cluster_profile` are a mix of content owned by the test platform and content owned by the users adding a new `cluster_profile`. The secret used to hold this content is `cluster-secrets-<name>`, so the `aws` profile uses `cluster-secrets-aws`. When adding a new profile, a pull request must change the `ci-secret-bootstrap` configuration to seed this credential with content owned by the platform, like central pull secrets for image registries ([example](https://github.com/openshift/release/commit/1f775399dfd636a1feca304fb9b6944ca2dd8fb9#diff-5169f2a74d1497f38a44e9adc57f6993269a89c3ddf90ab01f5d1d114ef61e58)). In addition, any user-provided secrets must be added using the [self-service portal](/docs/how-tos/adding-a-new-secret-to-ci/#add-a-new-secret) to add it to the clusters, using the following keys in Vault (the destination namespace/name needs to match the item added to the `ci-secret-bootstrap` config):

{{< highlight yaml >}}
secretsync/target-namespace: "ci"
secretsync/target-name: "cluster-secrets-<name>"
{{< / highlight >}}
