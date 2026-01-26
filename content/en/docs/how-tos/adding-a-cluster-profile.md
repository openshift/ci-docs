---
title: "Add a New Cluster Profile"
description: How to add a cluster profile to the test platform.
---
This guide walks you through creating a new cluster profile step-by-step, with real examples you can follow.

## Quick Overview

Creating a cluster profile involves three main steps:

1. **Register the profile** - Add code to `openshift/ci-tools` to tell the system about your new profile
2. **Set up leases** - Register cloud resources in `openshift/release` that tests can reserve
3. **Add credentials** - Store secrets (cloud keys, SSH keys, etc.) that your tests will need

**Time estimate:** Plan for 2-3 pull requests across different repositories, with review cycles for each.

**Reference example:** Throughout this guide, we'll reference [PR 4685](https://github.com/openshift/ci-tools/pull/4685) which created the `gcp-oadp-qe` cluster profile. You can use this as a template for your own profile.

{{< alert title="Info" color="info" >}}

Adding a cluster profile is just one of the steps necessary to enable CI for new platforms. For the high-level information
about platform enablement process, please see the [OpenShift Infrastructure Provider Onboarding](http://docs.providers.openshift.org/continuous-integration-and-testing/) Guide.

{{< /alert >}}

## What Is a Cluster Profile?

Think of a **cluster profile** as a "recipe" that tells the CI system:

- Which cloud platform to use (AWS, GCP, Azure, etc.)
- What credentials are needed
- How to reserve cloud resources for your tests

Instead of configuring each of these things separately for every test, you create a cluster profile once, and then any test can use it by simply saying "use the `aws` profile" or "use the `gcp-oadp-qe` profile."

**What happens when you use a cluster profile in a test:**

When you add a `cluster_profile` to a job or workflow, the CI system automatically:

- **Mounts credentials:** All your cloud account keys, image registry passwords, and other secrets are automatically available to your test steps at `$CLUSTER_PROFILE_DIR`
- **Reserves cloud resources:** The test automatically requests a "lease" (reserved cloud account/project) and makes it available via `$LEASED_RESOURCE`
- **Sets up environment:** Important environment variables are automatically set, like:
  - `$CLUSTER_TYPE` - tells your test what cloud platform it's running on
  - `$IMAGE_FORMAT` - format for pulling OpenShift images
  - `$KUBECONFIG` - path to the cluster's kubeconfig file
- **Imports OpenShift images:** All test steps automatically have access to the OpenShift release images they need

**The bottom line:** Different cluster profiles mainly differ in what credentials they provide. One profile might give you access to AWS account A, while another gives you access to AWS account B or a completely different cloud provider.

## Prepare the cloud account

In order for most workflows to operate with the cluster profile, the cloud account must be prepared, including creating a new IAM user as described in the OCP document ([AWS](https://docs.openshift.com/container-platform/4.14/installing/installing_aws/installing-aws-account.html), [GCP](https://docs.openshift.com/container-platform/4.14/installing/installing_gcp/installing-gcp-account.html)).

In addition to the permissions specified by the OCP documentation, include the following which are required for running tests in the environment:

**AWS Policies:**

- `CloudFormationFullAccess`
- `AmazonEC2ContainerRegistryFullAccess`

**GCP Roles:**

- `Deployment Manager Editor`
- `Compute Image User`
- `Role Administrator`

The default AWS [quotas](https://us-east-1.console.aws.amazon.com/servicequotas) need to be increased to ensure the AWS account is capable of creating and running multiple clusters at the same time. The [Configuring an AWS account](https://docs.openshift.com/container-platform/4.17/installing/installing_aws/installing-aws-account.html#installation-aws-limits_installing-aws-account) section of the OpenShift document include general instructions on configuring the quotas. We make the following recommendations to be requested on us-east-1, us-east-2, us-west-1, us-west-2 regions separately:

- Simple Storage Service (S3): Bucket Limit: 1000
- Amazon Elastic Compute Cloud (Amazon EC2): EC2-VPC Elastic IPs: 500
- Amazon Elastic Compute Cloud (Amazon EC2): Running On-Demand Standard (A, C, D, H, I, M, R, T, Z) instances: 3700
- Amazon Virtual Private Cloud (Amazon VPC): VPCs per Region: 250
- Amazon Virtual Private Cloud (Amazon VPC): NAT gateways per Availability Zone: 200
- Amazon Virtual Private Cloud (Amazon VPC): Internet gateways per Region: 200
- Elastic Load Balancing (ELB): Classic Load Balancers per Region: 250

For GCP, we need to increase the following quotas:

- Cloud Filestore API: Basic HDD (Standard) capacity (GB) per region: 20 TB

## Adding a New Cluster Profile

When adding a new `cluster_profile`, you need to complete three main steps:

1. **Register the profile** in the `ci-operator` code (in `openshift/ci-tools` repository)
2. **Add the new leases** to `Boskos` (in `openshift/release` repository)  
3. **Provide the credentials** for the profile

The following sections walk you through each step with a real-world example.

### Step-by-Step Example: Creating a New Cluster Profile

Let's walk through creating a cluster profile using a real example. We'll use the `gcp-oadp-qe` profile from [PR 4685](https://github.com/openshift/ci-tools/pull/4685) as our reference.

**Profile Name:** `gcp-oadp-qe`

This example shows exactly what code changes you need to make. Follow this pattern for your own cluster profile.

### Registering a New Profile

To register a new cluster profile, you need to create a pull request to the [`openshift/ci-tools`](https://github.com/openshift/ci-tools) repository. All the code changes go in a single file: [`pkg/api/types.go`](https://github.com/openshift/ci-tools/blob/master/pkg/api/types.go).

Think of this as "telling the system about your new profile" - you're adding it to the list of profiles that the CI system recognizes.

You need to make **5 specific changes** in the [`pkg/api/types.go`](https://github.com/openshift/ci-tools/blob/master/pkg/api/types.go) file:

#### 1. Add a New Constant for the Profile Name

**File:** [`pkg/api/types.go`](https://github.com/openshift/ci-tools/blob/master/pkg/api/types.go)  
**Location:** Find the `const` block with other `ClusterProfile` constants (around [line 1517](https://github.com/openshift/ci-tools/blob/master/pkg/api/types.go#L1517))

Add your new constant following the existing naming pattern.

**Example from PR 4685:**

```go
const (
    // ... existing profiles ...
    ClusterProfileGCPOADPQE ClusterProfile = "gcp-oadp-qe"
)
```

**What this does:** This creates a constant that represents your profile name. The value in quotes (`"gcp-oadp-qe"`) is what you'll use when referencing this profile in CI jobs.

#### 2. Add Your Profile to the Valid Profiles List

**File:** [`pkg/api/types.go`](https://github.com/openshift/ci-tools/blob/master/pkg/api/types.go)  
**Function:** [`ClusterProfiles()`](https://github.com/openshift/ci-tools/blob/master/pkg/api/types.go#L1713)  
**Location:** Around [line 1713](https://github.com/openshift/ci-tools/blob/master/pkg/api/types.go#L1713)

Find the `ClusterProfiles()` function and add your new constant to the list it returns.

**Example from PR 4685:**

```go
func ClusterProfiles() []ClusterProfile {
    return []ClusterProfile{
        // ... existing profiles ...
        ClusterProfileGCPOADPQE,
    }
}
```

**What this does:** This makes your profile "official" - it's now included in the list of profiles that the system recognizes as valid.

#### 3. Map Your Profile to a Cluster Type

**File:** [`pkg/api/types.go`](https://github.com/openshift/ci-tools/blob/master/pkg/api/types.go)  
**Method:** [`ClusterType()`](https://github.com/openshift/ci-tools/blob/master/pkg/api/types.go#L1998)  
**Location:** Around [line 1998](https://github.com/openshift/ci-tools/blob/master/pkg/api/types.go#L1998)

Find the `ClusterType()` method and add a case for your profile. The cluster type is used by the OpenShift installer to know which cloud platform it's working with.

**Note:** If you're creating a profile that reuses an existing cluster type (for example, a new GCP profile that uses the same `gcp` cluster type), you may not need to add a case here. The `gcp-oadp-qe` profile in PR 4685 reused the existing `gcp` cluster type, so no `ClusterType()` case was added.

**Example for a new cluster type:**

```go
func (p ClusterProfile) ClusterType() string {
    switch p {
    // ... existing cases ...
    case ClusterProfileYourNewProfile:
        return "your-new-cluster-type"
    default:
        return ""
    }
}
```

**What this does:** When a test uses your cluster profile, this tells the system what type of cluster to create. The value you return here is passed to tests as the `$CLUSTER_TYPE` environment variable.

#### 4. Map Your Profile to a Lease Type

**File:** [`pkg/api/types.go`](https://github.com/openshift/ci-tools/blob/master/pkg/api/types.go)  
**Method:** [`LeaseType()`](https://github.com/openshift/ci-tools/blob/master/pkg/api/types.go#L2379)  
**Location:** Around [line 2379](https://github.com/openshift/ci-tools/blob/master/pkg/api/types.go#L2379)

Find the `LeaseType()` method and add a case for your profile. The lease type determines which cloud resources your tests can use.

**Example from PR 4685:**

```go
func (p ClusterProfile) LeaseType() string {
    switch p {
    // ... existing cases ...
    case ClusterProfileGCPOADPQE:
        return "gcp-oadp-qe-quota-slice"
    default:
        return ""
    }
}
```

**What this does:** This tells the system which "lease" (reserved cloud resources) to use for your profile. The naming convention is `<profile-name>-quota-slice`. This lease must be registered separately in the `openshift/release` repository (see [Adding New Leases](#adding-new-leases) below).

#### 5. Add to LeaseTypeFromClusterType (if needed)

**File:** [`pkg/api/types.go`](https://github.com/openshift/ci-tools/blob/master/pkg/api/types.go)  
**Function:** [`LeaseTypeFromClusterType()`](https://github.com/openshift/ci-tools/blob/master/pkg/api/types.go#L2423)  
**Location:** Around [line 2423](https://github.com/openshift/ci-tools/blob/master/pkg/api/types.go#L2423)

If you're creating a completely new cluster type (not reusing an existing one), you also need to add it to the `LeaseTypeFromClusterType()` function. This is mainly used for older template-based tests.

**Example from PR 4685:**

```go
func LeaseTypeFromClusterType(t string) (string, error) {
    switch t {
    // ... existing cases ...
    case "gcp-oadp-qe":
        return t + "-quota-slice", nil
    default:
        return "", fmt.Errorf("invalid cluster type %q", t)
    }
}
```

**What this does:** This provides a fallback way to convert cluster types to lease types for legacy test templates.

#### Summary of Code Changes

Here's a quick checklist of what you need to add to [`pkg/api/types.go`](https://github.com/openshift/ci-tools/blob/master/pkg/api/types.go):

- [ ] Add constant: `ClusterProfileYourName ClusterProfile = "your-profile-name"` ([constants section](https://github.com/openshift/ci-tools/blob/master/pkg/api/types.go#L1517))
- [ ] Add to [`ClusterProfiles()`](https://github.com/openshift/ci-tools/blob/master/pkg/api/types.go#L1713) list
- [ ] Add case in [`ClusterType()`](https://github.com/openshift/ci-tools/blob/master/pkg/api/types.go#L1998) method
- [ ] Add case in [`LeaseType()`](https://github.com/openshift/ci-tools/blob/master/pkg/api/types.go#L2379) method
- [ ] Add case in [`LeaseTypeFromClusterType()`](https://github.com/openshift/ci-tools/blob/master/pkg/api/types.go#L2423) (if new cluster type)

Once you've made these changes, create a pull request to `openshift/ci-tools`. You can reference [PR 4685](https://github.com/openshift/ci-tools/pull/4685) as an example of the complete set of changes needed.

{{< alert title="Note" color="info" >}}
Default AWS accounts for the OpenShift organization have automated periodic deprovisioning jobs in place. These are designed to clean up residual resources left behind due to failed deprovisioning steps or network interruptions, helping to prevent quota limit issues.
{{< /alert >}}

### Understanding Cluster Type

The **cluster type** is a string that identifies what kind of cloud platform your tests will run on. This value gets passed to your test containers as the `$CLUSTER_TYPE` environment variable.

**How to choose a cluster type:**

- **For a completely new platform:** Create a unique cluster type name (like `gcp-oadp-qe`). You'll likely need to work with the OpenShift installer team to add support for this new platform type.
- **For a variant of an existing platform:** You can reuse the existing cluster type. For example, if you're creating a new AWS profile that works the same way as the standard AWS profile, you could use `aws` as the cluster type.

The cluster type is used by the OpenShift installer and other step registry components to know how to set up your cluster. For example, the [`ipi-install-install`](https://steps.ci.openshift.org/reference/ipi-install-install) step uses this to determine which cloud provider APIs to call.

### Adding New Leases

A **lease** is a reservation of cloud resources (like AWS accounts or GCP projects) that your tests can use. When a test runs with your cluster profile, it automatically requests a lease so it has access to the cloud resources it needs.

**The naming convention:** Leases are typically named `<profile-name>-quota-slice`. For example:

- The `aws` profile uses `aws-quota-slice`
- The `gcp-oadp-qe` profile uses `gcp-oadp-qe-quota-slice`

**What you need to do:**

1. **In your `ci-tools` PR:** You've already mapped your profile to a lease type in the `LeaseType()` method (step 4 above).

2. **In a separate PR to `openshift/release`:** You need to register the actual lease resources with the leasing server (Boskos). This tells the system "here are the cloud accounts/projects that can be used for this lease type."

   **File:** [`core-services/prow/02_config/_boskos.yaml`](https://github.com/openshift/release/blob/master/core-services/prow/02_config/_boskos.yaml)

   See the [Adding a New Type of Resource](/docs/architecture/quota-and-leases/#adding-a-new-type-of-resource) documentation for details on how to register leases. You can also reference [this example PR](https://github.com/openshift/release/pull/32536) that shows how leases are registered.

**Important:** The lease name you use in `openshift/release` must match exactly what you return from the `LeaseType()` method in `ci-tools`.

### Providing Credentials

Your tests need credentials (like cloud account keys, image registry passwords, etc.) to run. These credentials are stored in a Kubernetes Secret and automatically mounted into your test containers.

**How it works:**

1. **Secret naming:** The secret is always named `cluster-secrets-<profile-name>`. For example:
   - `aws` profile → `cluster-secrets-aws`
   - `gcp-oadp-qe` profile → `cluster-secrets-gcp-oadp-qe`

2. **Two types of credentials are needed:**
   - **Platform-provided:** Things like central image registry pull secrets that the CI platform team manages
   - **Your credentials:** Cloud account keys, SSH keys, and other secrets specific to your profile

3. **Setting it up:**

   **Step 1:** Create a pull request to `openshift/release` that adds your secret to the `ci-secret-bootstrap` configuration. This "seeds" the secret with platform-provided content.

   **File:** [`core-services/ci-secret-bootstrap/_config.yaml`](https://github.com/openshift/release/blob/master/core-services/ci-secret-bootstrap/_config.yaml)

   See [this example](https://github.com/openshift/release/commit/1f775399dfd636a1feca304fb9b6944ca2dd8fb9#diff-6f809450f5216bc90d0c08b723c9fe080da1358283bbf47c42f05bfc589c49fd) for reference.

   **Step 2:** Add your custom credentials (cloud keys, SSH keys, etc.) using the [self-service portal](/docs/how-tos/adding-a-new-secret-to-ci/#add-a-new-secret). When adding secrets in Vault, make sure to set these metadata keys:

   ```yaml
   secretsync/target-namespace: "ci"
   secretsync/target-name: "cluster-secrets-<your-profile-name>"
   ```

   These metadata keys tell the system to automatically sync your Vault secrets into the Kubernetes Secret that your tests will use.

**Special cases:**

- **Using the default naming:** If you follow the `cluster-secrets-<name>` convention, no additional configuration is needed. The system will automatically find and mount your secret.

- **Using a custom secret name:** If you want to share credentials with another profile or use a different name, you need to:
  1. First, same as above, create the PR that adds your secret to `ci-secret-bootstrap` (and wait for it to merge)
  2. Then, create a second PR that modifies the cluster profiles configuration to specify your custom secret name:

     **File:** [`ci-operator/step-registry/cluster-profiles/cluster-profiles-config.yaml`](https://github.com/openshift/release/blob/master/ci-operator/step-registry/cluster-profiles/cluster-profiles-config.yaml)

     ```yaml
     - profile: <your-profile-name>  # This needs to match the constant you added into [`pkg/api/types.go`](https://github.com/openshift/ci-tools/blob/master/pkg/api/types.go)
       secret: custom-cluster-profile-secret
     ```

#### Storing AWS Credentials

If your workflows need to create AWS resources before installing the cluster (like the [`ipi-aws`](https://steps.ci.openshift.org/workflow/ipi-aws) workflow), you'll need to store AWS credentials in your cluster profile secret.

**Important:** The secret must contain a key named `.awscred` (note the leading dot). The value should be the contents of a standard [AWS credentials file](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-files.html).

**Format:**

```ini
[default]
aws_access_key_id=YOUR_ACCESS_KEY_ID
aws_secret_access_key=YOUR_SECRET_ACCESS_KEY
```

Replace `YOUR_ACCESS_KEY_ID` and `YOUR_SECRET_ACCESS_KEY` with your actual AWS credentials.

#### Storing SSH Key Pairs

Some workflows (like `ipi-aws`) require SSH keys so you can access and debug CI clusters when needed.

**Best practice:** Generate a new SSH key pair specifically for CI usage. Don't reuse your personal SSH keys.

**How to store them:**

SSH keys are stored in the same Vault secret as your other credentials, but as separate key-value pairs:

- **Key name:** `ssh-publickey`  
  **Value:** The contents of your SSH public key file (usually `~/.ssh/id_rsa.pub`)

- **Key name:** `ssh-privatekey`  
  **Value:** The contents of your SSH private key file (usually `~/.ssh/id_rsa`)

**Example:** If you generate a key pair with `ssh-keygen -t rsa -f ci-key`, you would:

1. Store the contents of `ci-key.pub` as the `ssh-publickey` value
2. Store the contents of `ci-key` as the `ssh-privatekey` value

#### Using AWS IP Pools (Advanced)

AWS supports a "Bring Your Own IP" (BYOIP) feature that lets you use your own IP addresses for cost savings. If you want to use this with your cluster profile, you need to:

1. **Set up the IP Pool in AWS:** Follow AWS's [BYOIP documentation](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-byoip.html) to configure IP pools in each region you'll use. **Note:** AWS only supports one IP pool per region.

2. **Register IP Pool leases in Boskos:** Add configuration in `openshift/release` for each region. The lease name format should be `{cluster-profile-name}-ip-pools-{region}`.

   **File:** [`core-services/prow/02_config/_boskos.yaml`](https://github.com/openshift/release/blob/master/core-services/prow/02_config/_boskos.yaml)  
   **Example:** See [this example](https://github.com/openshift/release/blob/6a8f889b353fd3764b7c877bb0cd52cf7ea68aba/core-services/prow/02_config/_boskos.yaml#L435-L438)

3. **Update ci-tools configuration:** Add your lease name (without the region suffix) to the IP pool configuration in `ci-tools`.

   **File:** [`pkg/api/types.go`](https://github.com/openshift/ci-tools/blob/master/pkg/api/types.go)  
   **Location:** Around [line 1940](https://github.com/openshift/ci-tools/blob/master/pkg/api/types.go#L1940)

4. **Optional - Custom branch validation:** By default, only tests on certain OpenShift branches can use IP pools. If you want different behavior, modify the validation function to return `false` for your cluster profile.

   **File:** [`pkg/api/types.go`](https://github.com/openshift/ci-tools/blob/master/pkg/api/types.go)  
   **Function:** Around [line 1952](https://github.com/openshift/ci-tools/blob/master/pkg/api/types.go#L1952)

## Private Cluster Profiles

To restrict the usage of your cluster profile to specific organizations and repositories,
you can create a pull request in the `openshift/release` repository.

**File:** [`ci-operator/step-registry/cluster-profiles/cluster-profiles-config.yaml`](https://github.com/openshift/release/blob/master/ci-operator/step-registry/cluster-profiles/cluster-profiles-config.yaml)

Within the pull request, add your repository or organization to the cluster profiles configuration file.

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
Details of the implementation can be found in the [design document](https://docs.google.com/document/d/1mPjrHVS1EvmLdq4kGhRazTpGu6xVZDyGpVAphVZhX4w/edit?resourcekey=0-KA-qXXq1J2bTR7o6Kit9Vw).
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
