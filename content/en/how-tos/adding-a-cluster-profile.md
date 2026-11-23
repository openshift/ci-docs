---
title: "Add a New Cluster Profile"
description: How to add a cluster profile to the test platform.
---
This guide walks you through creating a new cluster profile step-by-step, with real examples you can follow.

## Quick Overview

Creating a cluster profile involves three main steps:

1. **Set up leases** - Register cloud resources in `openshift/release` that tests can reserve
2. **Add credentials** - Store secrets (cloud keys, SSH keys, etc.) that your tests will need
3. **Register the profile** - Add a new definition in `openshift/release` to tell the system about your new profile

**Time estimate:** Plan for 2 pull requests across different repositories, with review cycles for each.

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

In order for most workflows to operate with the cluster profile, the cloud account must be prepared, including creating a new IAM user as described in the OCP document ([AWS](https://docs.redhat.com/en/documentation/openshift_container_platform/4.14/html/installing_on_aws/installing-aws-account), [GCP](https://docs.redhat.com/en/documentation/openshift_container_platform/4.14/html/installing_on_google_cloud/installing-gcp-account)).

In addition to the permissions specified by the OCP documentation, include the following which are required for running tests in the environment:

**AWS Policies:**

- `CloudFormationFullAccess`
- `AmazonEC2ContainerRegistryFullAccess`

**GCP Roles:**

- `Deployment Manager Editor`
- `Compute Image User`
- `Role Administrator`

The default AWS [quotas](https://us-east-1.console.aws.amazon.com/servicequotas) need to be increased to ensure the AWS account is capable of creating and running multiple clusters at the same time. The [Configuring an AWS account](https://docs.redhat.com/en/documentation/openshift_container_platform/4.17/html/installing_on_aws/installing-aws-account#installation-aws-limits_installing-aws-account) section of the OpenShift document include general instructions on configuring the quotas. We make the following recommendations to be requested on us-east-1, us-east-2, us-west-1, us-west-2 regions separately:

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

1. **Add the new leases** in `Boskos`.
2. **Provide the credentials** for the profile.
3. **Register the profile** in [`ci-operator/step-registry/cluster-profiles/cluster-profiles-config.yaml`](https://github.com/openshift/release/blob/main/ci-operator/step-registry/cluster-profiles/cluster-profiles-config.yaml).

Steps (1) and (2) can be accomplished simultaneously with just a single PR. Merge it and wait for your credentials to be synchronized by the [periodic-ci-secret-bootstrap](https://prow.ci.openshift.org/?job=periodic-ci-secret-bootstrap) job.  
Open a separate PR to complete step (3).

The following sections walk you through each step with a real-world example.

### Adding New Leases

A **lease** is a reservation of cloud resources (like AWS accounts or GCP projects) that your tests can use. When a test runs with your cluster profile, it automatically requests a lease so it has access to the cloud resources it needs.

**The naming convention:** Leases are typically named `<profile-name>-quota-slice`. For example:

- The `aws` profile uses `aws-quota-slice`
- The `gcp-oadp-qe` profile uses `gcp-oadp-qe-quota-slice`

**What you need to do:**

You need to register the actual lease resources with the leasing server (Boskos). This tells the system "here are the cloud accounts/projects that can be used for this lease type."

   **File:** [`core-services/prow/02_config/_boskos.yaml`](https://github.com/openshift/release/blob/main/core-services/prow/02_config/_boskos.yaml)

   See the [Adding a New Type of Resource](/architecture/quota-and-leases/#adding-a-new-type-of-resource) documentation for details on how to register leases. You can also reference [this example PR](https://github.com/openshift/release/pull/32536) that shows how leases are registered.


### Providing Credentials

Your tests need credentials (like cloud account keys, image registry passwords, etc.) to run. These credentials are stored in Google Secret Manager (GSM) and automatically mounted into your test containers via a **bundle**.

**How it works:**

1. **Bundle naming:** Each cluster profile has a corresponding bundle named `cluster-secrets-<profile-name>`. For example:
   - `aws` profile → `cluster-secrets-aws`
   - `gcp-oadp-qe` profile → `cluster-secrets-gcp-oadp-qe`

2. **Two types of credentials are needed:**
   - **Platform-provided:** Things like central image registry pull secrets that the CI platform team manages
   - **Your credentials:** Cloud account keys, SSH keys, and other secrets specific to your profile

3. **Setting it up:**

   **Step 1:** Create your secrets using the [Secret Manager CLI](/architecture/cli-secret-manager/).
   Make sure you have a [secret collection](/how-tos/adding-a-new-secret-to-ci-gsm/#step-1-create-a-secret-collection)
   set up.

   **Step 2:** Define a bundle in [`core-services/ci-secret-bootstrap/gsm-config.yaml`](https://github.com/openshift/release/blob/main/core-services/ci-secret-bootstrap/gsm-config.yaml)
   that groups your secrets under `cluster-secrets-<your-profile-name>`. Example bundle:

   ```yaml
   bundles:
   - name: cluster-secrets-my-profile
     gsm_secrets:
     - collection: my-collection
       group: aws
     - collection: my-collection
       group: ssh
     sync_to_cluster: true
     targets:
     - cluster_groups: [non_app_ci]
       namespace: ci
   ```

   **Important**:`sync_to_cluster: true` is required. The `targets` section specifies which clusters and namespaces receive the secret,
   usually the `non_app_ci` cluster_group and the `ci` namespace are the preferred options.

   Submit this as a PR to [`openshift/release`](https://github.com/openshift/release). After it merges, it may take
   1-2 hours for the secrets to be propagated.

   See [Composed Secrets (Bundles)](/how-tos/adding-a-new-secret-to-ci-gsm/#composed-secrets-bundles) for more details on the bundle format.

#### Storing AWS Credentials

If your workflows need to create AWS resources before installing the cluster (like the [`ipi-aws`](https://steps.ci.openshift.org/workflow/ipi-aws) workflow), you'll need to store AWS credentials in your cluster profile.

**Default for new AWS profiles: STS.** Test Platform managed profiles (`aws`, `aws-2`, `aws-3`, `aws-4`, `aws-5`) already ship STS role ARNs in their cluster secrets. New self-supplied AWS profiles should enable STS during onboarding (see [Enabling AWS STS](#enabling-aws-sts-for-a-cluster-profile)). Keep static `.awscred` during the dual-stack period until static keys are fully retired.

**Static credentials (still required for dual-stack / non-STS):** The field must be named `.awscred` (note the leading dot). Due to GSM naming restrictions, dots are stored as `--dot--`, so the field name in GSM will be `--dot--awscred`. Use `as` in your bundle definition to restore the original name:

```yaml
bundles:
- name: cluster-secrets-my-profile
  gsm_secrets:
  - collection: my-collection
    group: aws
    fields:
    - name: --dot--awscred
      as: .awscred
```

The value should be the contents of a standard [AWS credentials file](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-files.html):

```ini
[default]
aws_access_key_id=YOUR_ACCESS_KEY_ID
aws_secret_access_key=YOUR_SECRET_ACCESS_KEY
```

To store it:

```sh
sm create -c my-collection aws/--dot--awscred --from-file=./aws-credentials
```

#### Enabling AWS STS for a Cluster Profile

OpenShift CI can use short-lived AWS credentials via STS (home → hub → target role chaining) instead of relying only on long-lived keys in `.awscred`.

**How `ci-operator` activates STS:** there is no workflow/`ci-operator` `sts:` switch. STS turns on automatically when all three ARNs are present for a job:

| ARN | Where it lives | Who owns it |
|---|---|---|
| `home_role_arn` | Secret `ci/aws-sts-cluster-config` on each **AWS** build farm | Test Platform (already deployed) |
| `hub_role_arn` | Your cluster profile secret | Shared hub role (value below) |
| `target_role_arn` | Your cluster profile secret | You (role in your AWS account) |

When activated, `ci-operator` mounts a projected SA token and AWS config under `/var/run/secrets/aws/` and logs `Creating STS AWS config for test …`. Role templates live in [`openshift/ci-tools` `hack/aws-sts-roles/`](https://github.com/openshift/ci-tools/tree/master/hack/aws-sts-roles).

Today only Test Platform managed profiles `aws` / `aws-2` / `aws-3` / `aws-4` / `aws-5` ship `hub_role_arn` + `target_role_arn` in their cluster secrets. Other AWS profiles still use static `.awscred` until they complete the steps below.

{{< alert title="Note" color="info" >}}
STS activates only on **AWS build farms** that publish `home_role_arn` (for example build01/03/05/…). GCP build farms (for example build02/04) do **not** have `ci/aws-sts-cluster-config`, so jobs that run only there will not get STS volumes even if your profile secret includes hub/target ARNs.
{{< /alert >}}

{{< alert title="Note" color="info" >}}
STS activation mounts credentials for steps that honor `AWS_CONFIG_FILE=/var/run/secrets/aws/config/config`. Many steps still export `AWS_SHARED_CREDENTIALS_FILE=$CLUSTER_PROFILE_DIR/.awscred`, so keep `.awscred` populated (dual-stack) until static keys are retired.
{{< /alert >}}

##### 1. New AWS profile onboarding (STS by default)

Complete the normal cluster-profile steps, and include STS while seeding credentials:

1. **Prepare the cloud account** as usual ([Prepare the cloud account](#prepare-the-cloud-account)).
2. **Deploy the target role** in your AWS account with [`target-role.cf`](https://github.com/openshift/ci-tools/blob/master/hack/aws-sts-roles/target-role.cf).
   Download the template from that path, then:

   ```bash
   aws cloudformation deploy \
     --stack-name ci-step-runner-target \
     --template-file target-role.cf \
     --capabilities CAPABILITY_NAMED_IAM \
     --parameter-overrides \
       TrustedRoleArn=arn:aws:iam::320297955214:role/ci-step-runner-hub
   ```

   The stack output `RoleArn` is your `target_role_arn` (role name is fixed as `ci-step-runner-target`, so the ARN looks like `arn:aws:iam::<your-account>:role/ci-step-runner-target`).
   The hub role already allows assuming `arn:aws:iam::*:role/ci-step-runner-target`, so you do **not** need a hub stack update for a new account.

3. **Store STS fields** in GSM next to `.awscred` (same collection/group your profile uses):

   ```sh
   # hub role is shared (same value used by managed aws / aws-2 … aws-5 profiles)
   sm create -c my-collection aws/hub_role_arn \
     --from-literal='arn:aws:iam::320297955214:role/ci-step-runner-hub'
   sm create -c my-collection aws/target_role_arn \
     --from-literal='arn:aws:iam::<your-account>:role/ci-step-runner-target'
   ```

4. **Declare the fields** on your bundle in [`core-services/ci-secret-bootstrap/gsm-config.yaml`](https://github.com/openshift/release/blob/main/core-services/ci-secret-bootstrap/gsm-config.yaml). Mirror a managed profile such as `cluster-secrets-aws` / `cluster-secrets-aws-2`:

   ```yaml
   fields:
   - name: --dot--awscred
     as: .awscred
   - name: hub_role_arn
   - name: target_role_arn
   # …ssh keys, baseDomain, etc.
   ```

5. **Register the profile**, merge, and wait for [`periodic-ci-secret-bootstrap`](https://prow.ci.openshift.org/?job=periodic-ci-secret-bootstrap). Confirm the synced secret on an AWS build farm contains both ARNs:

   ```bash
   oc --context build01 -n ci get secret cluster-secrets-<profile> \
     -o jsonpath='{.data.hub_role_arn}' | base64 -d; echo
   oc --context build01 -n ci get secret cluster-secrets-<profile> \
     -o jsonpath='{.data.target_role_arn}' | base64 -d; echo
   ```

6. **Job side:** The [`ipi-aws`](https://steps.ci.openshift.org/workflow/ipi-aws) workflow defaults `AWS_INSTALL_USE_MINIMAL_PERMISSIONS` to `"yes"`, which creates per-run install-scoped IAM users. For other workflows, set:

   ```yaml
   env:
     AWS_INSTALL_USE_MINIMAL_PERMISSIONS: "yes"
   ```

   Reference: [`ipi-conf-aws-user-min-permissions`](https://steps.ci.openshift.org/reference/ipi-conf-aws-user-min-permissions).

##### 2. Existing (already onboarded) AWS profiles

If your profile already runs with static `.awscred` only (no `hub_role_arn` / `target_role_arn` on `cluster-secrets-<profile>`):

1. **Deploy `target-role.cf`** in the AWS account behind your profile (same command as onboarding step 2).
2. **Add GSM fields** `hub_role_arn` and `target_role_arn` to the existing group for that profile (`sm create` for new fields, or `sm update` if they already exist).
3. **Update `gsm-config.yaml`** so `cluster-secrets-<your-profile>` syncs those two fields (copy the field entries from `cluster-secrets-aws-2` or similar).
4. Merge and wait for secret bootstrap. Re-check the ARNs on an AWS build farm with the `oc get secret` commands in onboarding step 5.
5. **Turn on ephemeral install credentials** for your jobs if they do not already inherit [`ipi-aws`](https://steps.ci.openshift.org/workflow/ipi-aws):

   ```yaml
   env:
     AWS_INSTALL_USE_MINIMAL_PERMISSIONS: "yes"
   ```

6. **Validate** with a rehearsal or representative job on an AWS build farm:
   - ci-operator logs should include `Creating STS AWS config for test` when home/hub/target are all present.
   - With min-permissions `"yes"`, the install path should create an ephemeral IAM user (`aws_minimal_permission` in `${SHARED_DIR}`).

7. **Escape hatch** if something breaks:

   ```yaml
   env:
     AWS_INSTALL_USE_MINIMAL_PERMISSIONS: "no"
   ```

   Ask in `#forum-ocp-testplatform` if you need help with role trust or bootstrap wiring.

{{< alert title="Warning" color="warning" >}}
Do not remove `.awscred` until Test Platform announces that static keys are fully retired for your profile. STS and static credentials currently run dual-stack.
{{< /alert >}}

{{< alert title="Note" color="info" >}}
This procedure matches managed profiles `aws`–`aws-5` and current ci-operator STS activation. Deploying `target-role.cf` in a new account may still fail if your org SCPs block the role or attached policies.
{{< /alert >}}

#### Storing SSH Key Pairs

Some workflows (like `ipi-aws`) require SSH keys so you can access and debug CI clusters when needed.

**Best practice:** Generate a new SSH key pair specifically for CI usage. Don't reuse your personal SSH keys.

Store SSH keys as separate fields in your collection:

```sh
sm create -c my-collection ssh/ssh-publickey --from-file=./ci-key.pub
sm create -c my-collection ssh/ssh-privatekey --from-file=./ci-key
```

Then include the `ssh` group in your cluster profile bundle (see [Providing Credentials](#providing-credentials) above).

### Registering a New Profile

To register a new cluster profile, you need to define a new entry in [`ci-operator/step-registry/cluster-profiles/cluster-profiles-config.yaml`](https://github.com/openshift/release/blob/main/ci-operator/step-registry/cluster-profiles/cluster-profiles-config.yaml).

Think of this as "telling the system about your new profile" - you're adding it to the list of profiles that the CI system recognizes:

```yaml
cluster_profiles:
- name: aws
  owners:
  - org: openshift
  - org: cri-o
    repos:
    - cri-o
  - konflux:
      cluster_groups:
      - rh-staging
      tenant: testplatform-ci-tenant
  cluster_type: aws
  lease_type: aws-quota-slice
  ip_pool_lease_type: aws-ip-pools
  secret: cluster-secrets-aws
```

The meaning of each stanza is described below:
- `name`: name of this cluster profile.
- `owners`: restricts the usage of the cluster profile to a given `organization`, `organization/repository`s or Konflux tenant. For detailed instructions please refer to the [README file](https://github.com/openshift/release/tree/main/ci-operator/step-registry/cluster-profiles/README.md).
- `lease_type`: The lease type determines which cloud resources your tests can use.  
This tells the system which "lease" (reserved cloud resources) to use for your profile.  
**IMPORTANT**: The name of the lease **MUST** be the same of what you have chosen in the previous step [Adding New Leases](#adding-new-leases).
- `cluster_type`: the cluster type is used by the OpenShift installer to know which cloud platform it's working with.  
When a test uses your cluster profile, this tells the system what type of cluster to create. The value set here is passed to tests as the `$CLUSTER_TYPE` environment variable.  
See [Understanding Cluster Type](#understanding-cluster-type)
- `ip_pool_lease_type`: name of the lease type used for the BYOIP feature, see [Using AWS IP Pools (Advanced)](#using-aws-ip-pools-advanced). This field is **OPTIONAL**.
- `secret`: name of the secret that holds the cluster profile information.  
**IMPORTANT**: The name of the secret **MUST** be the same of what you have chosen in the previous step [Providing Credentials](#providing-credentials).

You can now open and merge a PR that holds the new profile definition.

{{< alert title="Note" color="info" >}}
Default AWS accounts for the OpenShift organization have automated periodic deprovisioning jobs in place. These are designed to clean up residual resources left behind due to failed deprovisioning steps or network interruptions, helping to prevent quota limit issues.
{{< /alert >}}

### Understanding Cluster Type

The **cluster type** is a string that identifies what kind of cloud platform your tests will run on. This value gets passed to your test containers as the `$CLUSTER_TYPE` environment variable.

**How to choose a cluster type:**

- **For a completely new platform:** Create a unique cluster type name (like `gcp-oadp-qe`). You'll likely need to work with the OpenShift installer team to add support for this new platform type.
- **For a variant of an existing platform:** You can reuse the existing cluster type. For example, if you're creating a new AWS profile that works the same way as the standard AWS profile, you could use `aws` as the cluster type.

The cluster type is used by the OpenShift installer and other step registry components to know how to set up your cluster. For example, the [`ipi-install-install`](https://steps.ci.openshift.org/reference/ipi-install-install) step uses this to determine which cloud provider APIs to call.


### Using AWS IP Pools (Advanced)

AWS supports a "Bring Your Own IP" (BYOIP) feature that lets you use your own IP addresses for cost savings. If you want to use this with your cluster profile, you need to:

1. **Set up the IP Pool in AWS:** Follow AWS's [BYOIP documentation](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-byoip.html) to configure IP pools in each region you'll use. **Note:** AWS only supports one IP pool per region.

2. **Register IP Pool leases in Boskos:** Add configuration in `openshift/release` for each region. The lease name format should be `{cluster-profile-name}-ip-pools-{region}`.

   **File:** [`core-services/prow/02_config/_boskos.yaml`](https://github.com/openshift/release/blob/main/core-services/prow/02_config/_boskos.yaml)  
   **Example:** See [this example](https://github.com/openshift/release/blob/6a8f889b353fd3764b7c877bb0cd52cf7ea68aba/core-services/prow/02_config/_boskos.yaml#L435-L438)

3. **Update the profile definition:** Add the IP Pool lease name to the cluster profile you have defined in [Registering a New Profile](#registering-a-new-profile)

```yaml
ip_pool_lease_type: {cluster-profile-name}-ip-pools-{region}
```

4. **Optional - Custom branch validation:** TODO

## VPN connection

For platforms that need access to restricted environments, `ci-operator`
supports adding a dedicated VPN connection to each test step.  Since this is a
requirement of specific platforms, it is triggered by special files in the
[cluster profile(s)]({{< ref "/how-tos/adding-a-cluster-profile#what-is-a-cluster-profile" >}})
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

Once the `BuildConfig` is merged into `main` and the image is built and
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
[openvpn_build]: https://github.com/openshift/release/blob/main/clusters/app.ci/supplemental-ci-images/openvpn.yaml
[supplemental_images]: https://github.com/openshift/release/blob/main/clusters/app.ci/supplemental-ci-images/
