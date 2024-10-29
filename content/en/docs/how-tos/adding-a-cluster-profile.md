---
title: "Add a New Cluster Profile"
description: How to add a cluster profile to the test platform.
---
This document lays out the process of getting a new cluster profile added to the test platform so that jobs can begin using it.

{{< alert title="Info" color="info" >}}

Adding a cluster profile is just one of the steps necessary to enable CI for new platforms. For the high-level information
about platform enablement process, please see the [OpenShift Infrastructure Provider Onboarding](http://docs.providers.openshift.org/continuous-integration-and-testing/) Guide.

{{< /alert >}}

## What Is a Cluster Profile?

The `cluster_profile` is a `ci-operator` concept that bundles together a couple of concepts to make it easier to configure jobs and steps that can operate on different cloud infrastructures.

When a `cluster_profile` is added to a job or workflow, the following actions occur:

- all steps in the workflow will have [`credentials`](/docs/architecture/step-registry/#injecting-custom-credentials) mounted at `$CLUSTER_PROFILE_DIR` for cloud accounts, image registries, etc.
- the test will implicitly ask for a [`lease`](/docs/architecture/step-registry/#implicit-lease-configuration-with-cluster_profile) and expose it with `$LEASED_RESOURCE`
- all steps in the test will implicitly declare [`dependencies`](/docs/architecture/ci-operator/#referring-to-images-in-tests) on imported OpenShift release images
- all steps will have a number of environment variables set, such as `$CLUSTER_TYPE`, `$IMAGE_FORMAT`, and `$KUBECONFIG`

Generally, the major difference between `cluster_profile`s is the content of the credentials.

## Prepare the cloud account
In order for most workflows to operate with the cluster profile, the cloud account must be prepared, including creating a new IAM user as described in the OCP document ([AWS](https://docs.openshift.com/container-platform/4.14/installing/installing_aws/installing-aws-account.html), [GCP](https://docs.openshift.com/container-platform/4.14/installing/installing_gcp/installing-gcp-account.html)).

In addition to the permissions specified by the OCP documentation, include the following which are required for running tests in the environment:

AWS Policies:
- `CloudFormationFullAccess`
- `AmazonEC2ContainerRegistryFullAccess`

GCP Roles:
- `Deployment Manager Editor`
- `Compute Image User`
- `Role Administrator`

## Adding a New Cluster Profile

When adding a new `cluster_profile`, three major steps must be taken: registering the profile inside of `ci-operator`, adding the new leases to `Boskos`, and providing the credentials.

### Registering a New Profile

As `cluster-profile`s are handled as first-class items in the `ci-operator`
configuration, a new pull request ([example](https://github.com/openshift/ci-tools/pull/2808))
must be sent to the `openshift/ci-tools` repository in order to register a new
profile.  The next sections detail the requirements for opening this pull
request.  All changes required in `openshift/ci-tools` are isolated to a single
file, [`pkg/api/types.go`](https://github.com/openshift/ci-tools/blob/master/pkg/api/types.go).
The process of creating a new cluster profile involves adding:

- `ClusterProfile`: a new constant for the name of the profile.
- `ClusterProfiles()`: a new item in the list of valid test profiles.
- `ClusterProfile::ClusterType()`: a mapping from the profile to its
  [cluster type]({{< relref "#cluster-type" >}}).
- `ClusterProfile::LeaseType()`: a mapping from the profile to its
  [lease type]({{< relref "#adding-new-leases" >}}).
- `LeaseTypeFromClusterType()`: a mapping from cluster type to lease type, if
  a new type is being added (this is only used for legacy template tests).
- `ClusterProfile::ConfigMap()`: a `switch` label if the profile requires its
  own `ConfigMap`.

### Cluster type

This value is passed to tests via the `CLUSTER_TYPE` environment variable, as
mentioned in the introduction.  It is used for cloud-provider-specific behavior
by step registry components such as the OpenShift installer steps
([e.g.](https://steps.ci.openshift.org/reference/ipi-install-install)).

For profiles created for completely new platforms, this should be a unique value
and will probably require corresponding changes to the installation steps.
Profiles which are derivatives of existing ones should likely retain the cluster
type unless they require special treatment in the installation process.

### Adding New Leases

In the pull request to `openshift/ci-tools`, the mapping between a `cluster_profile` and the implicit `lease` that will be requested is determined. The standard is to use leases named `<name>-quota-slice`, so the `aws` profile uses `aws-quota-slice`. The resources for leasing must be [registered](/docs/architecture/quota-and-leases/#adding-a-new-type-of-resource) with our leasing server ([example](https://github.com/openshift/release/pull/32536)).

### Providing Credentials

The credentials provided to tests that declare a `cluster_profile` are a mix
of content owned by the test platform and content owned by the users adding 
a new `cluster_profile`. The secret used to hold this content is 
`cluster-secrets-<name>`, so the `aws` profile uses `cluster-secrets-aws`. 
When adding a new profile, a pull request must change the `ci-secret-bootstrap` 
configuration to seed this credential with content owned by the platform, 
like central pull secrets for image registries ([example](https://github.com/openshift/release/commit/1f775399dfd636a1feca304fb9b6944ca2dd8fb9#diff-6f809450f5216bc90d0c08b723c9fe080da1358283bbf47c42f05bfc589c49fd)). 
In addition, any user-provided secrets must be added using 
the [self-service portal](/docs/how-tos/adding-a-new-secret-to-ci/#add-a-new-secret) 
to add it to the clusters, using the following keys in Vault (the destination 
namespace/name needs to match the item added to the `ci-secret-bootstrap` config):

{{< highlight yaml >}}
secretsync/target-namespace: "ci"
secretsync/target-name: "cluster-secrets-<name>"
{{< / highlight >}}

Credentials provided for the test containers fall into two categories:
- Credentials are mounted using a simple `Secret` mount.
  - The secret name must match the item in the `ci-secret-bootstrap` configuration.
  - If the convention for the secret to be named `cluster-secrets-<name>` is 
    followed, no other action is required.
  - To use a custom secret name for the new cluster profile, 
    e.g. when the new profile shares credentials with another profile,
    a new field must be added to the [cluster profiles configuration](https://github.com/openshift/release/blob/master/ci-operator/step-registry/cluster-profiles/cluster-profiles-config.yaml) to override the default naming:
    ```
    - profile: <name>
      secret: custom-cluster-profile-secret
    ```
    In this case, **two pull requests are required**; the first pull request should modify 
    the `ci-secret-bootstrap` configuration and must be merged before proceeding with the second
    pull request, which modifies the [cluster profiles configuration](https://github.com/openshift/release/blob/master/ci-operator/step-registry/cluster-profiles/cluster-profiles-config.yaml).

- A `ConfigMap` is required for the profile.
  - In the `openshift/ci-tools` pull request, the `ClusterProfile::ConfigMap()` 
    function must be modified. The convention is for it to be named 
    `cluster-profile-<name>`, in which case a single new `switch` label is required.

{{< alert title="Note" color="info" >}}
It is recommended to provide credentials using a Secret. 
The use of ConfigMaps for credentials is considered legacy 
and is planned for deprecation.
{{< /alert >}}

#### Storing AWS credentials as secrets

Some workflows will provision resources before installing the cluster (e.g.,
[`ipi-aws`](https://steps.ci.openshift.org/workflow/ipi-aws). These types of
workflows requires AWS credentials exposed to the workflow as a Vault secret.
It's important to note that the secret must contain a key-value pair where the
key name is `.awscred` and the value is the contents of an [AWS credentials
file](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-files.html).
Replace the placeholder values as appropriate:

```
[default]
aws_access_key_id=<placeholder-id>
aws_secret_access_key=<placeholder-secret>
```

#### Storing SSH key pairs

In addition to credentials, some workflows (e.g., `ipi-aws`) require ssh keys,
which allow you to access CI clusters. This can be important for debugging
issues. We recommend generating a new key pair specifically for CI usage.

SSH key pairs are also stored in Vault, just like provider credentials. They
should be stored within the same secret as the provider credentials, but as
separate key-value pairs. You'll have two new key-value pairs, where the keys
are `ssh-publickey` and `ssh-privatekey` and they store the file contents of
the SSH public and private key, respectively.

#### Supplying an AWS IP Pool

It is possible to take advantage of AWS's [BYOIP feature](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-byoip.html)
to allow your test's ephemeral clusters to utilize configured IP Pools for cost savings. To utilize this, a few steps must be taken:
1. Set up IP Pool in utilized region(s). See AWS [docs](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-byoip.html). Note that this feature can only handle **one** IP Pool per region.
2. Add `Boskos` configuration for _every_ region you intend to utilize. See the [example](https://github.com/openshift/release/blob/6a8f889b353fd3764b7c877bb0cd52cf7ea68aba/core-services/prow/02_config/_boskos.yaml#L435-L438), noting, the `name` should be `{cluster-profile-name}-ip-pools-{region}`.
3. Add your lease name (without the region suffix) to the `ci-tools` [configuration](https://github.com/openshift/ci-tools/blob/07c36f6c2e38780a54b071ea8c880e1f8dd9a7c9/pkg/api/types.go#L1940-L1947) for your cluster-profile.
4. (optional) If you **don't** want the [standard](https://github.com/openshift/ci-tools/blob/07c36f6c2e38780a54b071ea8c880e1f8dd9a7c9/pkg/api/leases.go#L50-L69) OpenShift branch validation to determine which tests can utilize the pools, modify [this function](https://github.com/openshift/ci-tools/blob/07c36f6c2e38780a54b071ea8c880e1f8dd9a7c9/pkg/api/types.go#L1952-L1957) to return `false` for your cluster-profile.

## Private Cluster Profiles

To restrict the usage of your cluster profile to specific organizations and repositories, 
you can create a pull request in the `openshift/release` repository.
Within the pull request, add your repository or organization to the [cluster profiles configuration file](https://github.com/openshift/release/tree/master/ci-operator/step-registry/cluster-profiles/cluster-profiles-config.yaml).

For detailed instructions please refer to the [README file](https://github.com/openshift/release/tree/master/ci-operator/step-registry/cluster-profiles/README.md).

## VPN connection

For platforms that need access to restricted environments, `ci-operator`
supports adding a dedicated VPN connection to each test step.  Since this is a
requirement of specific platforms, it is triggered by special files in the
[cluster profile(s)]({{< ref "docs/how-tos/adding-a-cluster-profile#what-is-a-cluster-profile" >}})
associated with those platforms.  This process is transparent to the test
command: when a VPN connection is requested at the test level, it is set up
automatically by the test platform with no changes required to individual tests.

{{< alert title="Note" color="info" >}}
Details of the implementation can be found in the
<a href="https://docs.google.com/document/d/1mPjrHVS1EvmLdq4kGhRazTpGu6xVZDyGpVAphVZhX4w/edit?resourcekey=0-KA-qXXq1J2bTR7o6Kit9Vw">design document</a>.
{{< /alert >}}

### Cluster profile

VPN connections are requested by the presence of a special file named `vpn.yaml`
in the cluster profile, detected when the test steps are about to be executed.
This file should have the following fields:

- `image`: _pull spec_ of the image to be used for the VPN client container.
- `commands`: the name of another file in the cluster profile (e.g.
  `openvpn.sh`) which contains the VPN client's entry point script.  This script
  is effectively executed as `bash -c "$(<f")"`, where `f` is the value
  associated with the `commands` key.
- `wait_timeout`: the maximum amount of time the step script should wait before
  starting (detailed in the next section).  This ensures the steps are not
  blocked until the test timeout (several hours) expires if any problems occur
  with the VPN client.

### Image

The image used for the VPN client should contain the packages necessary to
establish the connection, as well as the `bash` shell to execute the container's
entry point script.

The _pull spec_ placed in the cluster profile can point to images stored
anywhere, but the simplest setup is to build and store them in the central CI
cluster.  Builds are configured in [`openshift/release`][openshift_release] in
the [supplemental images][supplemental_images] directory (see for example the
[OpenVPN image build][openvpn_build]).

Once the `BuildConfig` is merged into `master` and the image is built and
tagged, the cluster profile can reference the public _pull spec_.  For the
OpenVPN image stream from the example above, that would be:

{{< highlight yaml >}}
image: registry.ci.openshift.org/ci/openvpn:latest
# …
{{< / highlight >}}

### Client container

The container should execute the VPN client to establish the connection.  It
will reside in the same network namespace as the test container, so no special
provisions are necessary to make the networking changes usable by the test
program.  When executed, the entry point program will be located in the
directory where the cluster profile files are mounted, so all secrets will be
available and can be referenced with a relative path.

In addition to executing the client, the container has also two synchronization
points:

- When the connection has been established and the test script should start, a
  file named `/tmp/vpn/up` should be created.  For OpenVPN, for example, the
  following options can be used:

{{< highlight bash >}}
openvpn --script-security 2 --route-up '/bin/bash -c "touch /tmp/vpn/up"' …
{{< / highlight >}}

- The script should watch for the creation of a file indicating that the main
  test has finished and then exit so that the test can terminate properly.  This
  marker file is created automatically by the CI infrastructure at
  `/logs/marker-file.txt`.  The client can perform these actions with a script
  such as:

{{< highlight bash >}}
function exit_with_test() {
    until [[ -f /logs/marker-file.txt ]]; do sleep 1; done
    while :; do kill 1; sleep 1; done
}

exit_with_test &
# run the VPN client
{{< / highlight >}}

{{< alert title="Note" color="info" >}}
N.b. both containers start simultaneously, so the test may exit before the VPN
client starts.
{{< /alert >}}

[openshift_release]: https://github.com/openshift/release.git
[openvpn_build]: https://github.com/openshift/release/blob/master/clusters/app.ci/supplemental-ci-images/openvpn.yaml
[supplemental_images]: https://github.com/openshift/release/blob/master/clusters/app.ci/supplemental-ci-images/
