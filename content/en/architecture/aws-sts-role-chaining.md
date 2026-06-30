---
title: "AWS STS Role Chaining for CI"
description: How ci-operator uses AWS STS role chaining to replace static IAM credentials in test steps.
---

## Overview

CI test steps that interact with AWS historically relied on a static `.awscred`
file containing long-lived IAM access keys. AWS STS role chaining replaces
those static credentials with short-lived tokens obtained through a three-hop
`AssumeRole` chain.

When STS is enabled for a cluster profile, `ci-operator` automatically injects
the necessary volumes and configuration into every step pod. The AWS SDK
handles credential refresh transparently, so **no changes are required in
individual test step scripts** in most cases.

## Architecture

The credential chain involves three IAM roles deployed across three AWS
accounts:

```
 Build-cluster account        Hub account            Target account
┌──────────────────┐    ┌──────────────────┐    ┌──────────────────────┐
│  ci-step-runner   │───>│ ci-step-runner-hub│───>│ ci-step-runner-target│
│  (home role)      │    │ (hub role)        │    │ (target role)        │
│                   │    │                   │    │                      │
│  AssumeRole       │    │  AssumeRole       │    │  Full provision      │
│  WithWebIdentity  │    │  (from home)      │    │  permissions         │
│  (OIDC SA token)  │    │                   │    │                      │
└──────────────────┘    └──────────────────┘    └──────────────────────┘
```

### Hop 1: Home role (build cluster account)

Each build cluster's AWS account has an IAM role named `ci-step-runner`. This
role trusts the cluster's OIDC provider and can be assumed via
`AssumeRoleWithWebIdentity` using a projected ServiceAccount token with the
`sts.amazonaws.com` audience.

The trust policy restricts access to ServiceAccounts in `ci-op-*` namespaces
(the dynamic namespaces created by `ci-operator` for each test run).

The home role's only permission is `sts:AssumeRole` on
`arn:aws:iam::*:role/ci-step-runner-hub`.

### Hop 2: Hub role (shared hub account)

The DPTP team maintains a **shared hub account** that hosts the
`ci-step-runner-hub` role. This role trusts the home roles from all build
cluster accounts, allowing them to assume it.

The hub role's only permission is `sts:AssumeRole` on
`arn:aws:iam::*:role/ci-step-runner-target`.

Because the hub account is centrally managed, cluster profile owners do **not**
need to deploy their own hub role or establish trust relationships with every
build cluster account. Instead, contact the DPTP team to obtain the hub role
ARN for your cluster profile configuration.

### Hop 3: Target role (cluster profile account)

Each AWS account used by a cluster profile has a `ci-step-runner-target` role.
This role trusts the hub role and carries the full set of provisioning
permissions (EC2, S3, IAM, Route53, ELB, CloudFormation, etc.) needed to
install and deprovision OpenShift clusters.

## How ci-operator Activates STS

STS is activated per cluster profile based on the contents of the cluster
profile secret. When the secret contains all three keys
`home_role_arn`, `hub_role_arn`, and `target_role_arn`, `ci-operator`
performs the following at test run time:

1. **Reads the ARNs** from the cluster profile secret during lease
   acquisition. The lease step imports the cluster profile secret from the
   `ci` namespace and extracts the `home_role_arn`, `hub_role_arn`, and
   `target_role_arn` keys. If `hub_role_arn` and `target_role_arn` are present
   but `home_role_arn` is missing, a warning is logged and STS is not
   activated.

2. **Creates a ConfigMap** (`<test-name>-sts-config`) containing the AWS
   config file with `source_profile` chaining:

   ```ini
   [profile home]
   web_identity_token_file = /var/run/secrets/aws/sts-token/token
   role_arn = <home_role_arn>

   [profile hub]
   role_arn = <hub_role_arn>
   source_profile = home

   [default]
   role_arn = <target_role_arn>
   source_profile = hub
   ```

3. **Injects two volumes** into each step pod:

   | Volume | Mount path | Contents |
   |---|---|---|
   | `aws-sts-token` | `/var/run/secrets/aws/sts-token` | Projected ServiceAccount token (audience `sts.amazonaws.com`, 24 h expiry) |
   | `aws-sts-config` | `/var/run/secrets/aws/config` | The AWS config file from the ConfigMap |

Step scripts that need STS credentials set `AWS_CONFIG_FILE` to
`/var/run/secrets/aws/config/config` so the AWS SDK picks up the chained
profile configuration.

If any of the three ARN keys are missing from the secret, STS is not
activated and the cluster profile falls back to the legacy `.awscred`
static credentials.

## OpenShift Installer Credential Modes and STS

The OpenShift installer supports three Cloud Credential Operator (CCO) modes
on AWS. Each mode has different credential requirements, and not all are
compatible with CI-level STS role chaining directly.

### Mint mode (default)

In Mint mode, the CCO uses the provided admin-level credentials to create
new IAM users and access keys for each OpenShift component (the ingress
operator, the image registry, the machine API, etc.). This requires the
root credential to contain static IAM keys (`aws_access_key_id` and
`aws_secret_access_key`), because the CCO calls `iam:CreateUser` and
`iam:CreateAccessKey` to mint per-component credentials.

**STS interaction:** The installer cannot use STS role-chained credentials
directly in Mint mode. To work around this, enable the minimal permissions
mechanism (see [Minimal Permissions for Installer](#minimal-permissions-for-installer)
below), which uses STS to create a temporary IAM user with static keys for
the installer.

### Passthrough mode

In Passthrough mode, the CCO copies the root credential directly to each
component's namespace without creating new users. The CCO's
`syncPassthrough()` function reads `aws_access_key_id` and
`aws_secret_access_key` from the root secret and writes them into each
component's secret via `syncAccessKeySecret()`, which generates a
credentials file in the static key format:

```ini
[default]
aws_access_key_id = ...
aws_secret_access_key = ...
```

This means Passthrough mode also requires static IAM keys in the root
credential.

**STS interaction:** Same as Mint -- the minimal permissions mechanism is
needed to bridge CI-level STS with the installer.

### Manual mode with STS

In Manual mode with STS, the `ccoctl` tool pre-provisions a dedicated IAM
role and OIDC trust for each OpenShift component before installation. The
CCO does not use root credentials at all. Instead, `syncSTSSecret()`
generates per-component credential files using a web identity template:

```ini
[default]
sts_regional_endpoints = regional
role_arn = <per-component-role-arn>
web_identity_token_file = <token-path>
```

Each component authenticates using its own short-lived token. This is
OpenShift-level STS support, distinct from the CI-level STS described in
this document.

**STS interaction:** The `ccoctl` tool still needs credentials to create the
per-component IAM roles and OIDC provider. When CI-level STS is enabled,
set `AWS_CCOCTL_USE_MINIMAL_PERMISSIONS` to `"yes"` to create a temporary
IAM user with the `ccoctl`-specific permissions.

### Minimal Permissions for Installer

Because the OpenShift installer requires static IAM credentials in Mint and
Passthrough modes, the standard IPI AWS workflow includes the
[`aws-provision-iam-user-minimal-permission`](https://steps.ci.openshift.org/chain/aws-provision-iam-user-minimal-permission)
chain, which consists of two steps:

1. **`ipi-conf-aws-user-min-permissions`** -- generates a minimal IAM
   permissions policy based on the cluster configuration and OpenShift
   version. Controlled by two environment variables:
   - `AWS_INSTALL_USE_MINIMAL_PERMISSIONS` -- set to `"yes"` to generate
     installer-required permissions
   - `AWS_CCOCTL_USE_MINIMAL_PERMISSIONS` -- set to `"yes"` to generate
     `ccoctl`-required permissions

2. **`aws-provision-iam-user`** -- uses the STS credentials (via
   `AWS_CONFIG_FILE`) to create a temporary IAM user with only the
   permissions from the generated policy, and writes its static access key
   to `${SHARED_DIR}/aws_minimal_permission`.

During the install and deprovision steps, if the file
`${SHARED_DIR}/aws_minimal_permission` exists, it is used as
`AWS_SHARED_CREDENTIALS_FILE` instead of the cluster profile's `.awscred`.
This way the installer gets the static credentials it requires, while all
other test steps use STS.

The temporary IAM user and its policy are cleaned up by the
[`aws-deprovision-users-and-policies`](https://steps.ci.openshift.org/reference/aws-deprovision-users-and-policies)
step in the post chain.

This chain is already included in the standard
[`ipi-aws-pre`](https://steps.ci.openshift.org/chain/ipi-aws-pre) chain.
To enable it, set `AWS_INSTALL_USE_MINIMAL_PERMISSIONS` to `"yes"` in
the job or workflow configuration. No other workflow changes are needed.

## Enabling STS for a Cluster Profile

### Prerequisites

- The build cluster must have an OIDC provider registered (standard for
  ROSA/OSD/HyperShift-managed clusters).
- The target role must be deployed in your AWS account (see
  [CloudFormation Templates](#cloudformation-templates) below).
- The home and hub role ARNs must be obtained from the DPTP team.
- All three role ARNs must be stored in the cluster profile secret.

### Step 1: Deploy the Target Role

Deploy the `ci-step-runner-target` role in your cluster profile's AWS
account using the `target-role.cf` CloudFormation template. You will need
the hub role ARN from the DPTP team as input.

CloudFormation templates are maintained in
[`openshift/ci-tools/hack/aws-sts-roles/`](https://github.com/openshift/ci-tools/tree/master/hack/aws-sts-roles/).

### Step 2: Obtain the Home and Hub Role ARNs

Contact the DPTP team to obtain:

- The **home role ARN** (`ci-step-runner`) -- one per build cluster
- The **hub role ARN** (`ci-step-runner-hub`) -- shared across all cluster
  profiles

The DPTP team manages the home and hub roles centrally. You do not need to
deploy these yourself.

If you are onboarding a new build cluster (DPTP team only), deploy
`home-role.cf` in the build cluster's AWS account and update the hub
role's `TrustedHomeRoleArns` parameter to include the new home role ARN.

### Step 3: Add ARNs to the Cluster Profile Secret

Add the following keys to the cluster profile's Vault secret (or the
`ci-secret-bootstrap` config in `openshift/release`):

| Key | Value |
|---|---|
| `home_role_arn` | ARN of `ci-step-runner` in the build cluster account (from DPTP team) |
| `hub_role_arn` | ARN of `ci-step-runner-hub` in the shared hub account (from DPTP team) |
| `target_role_arn` | ARN of `ci-step-runner-target` in your account (output of `target-role.cf`) |

Once the secret is synced, all tests using that cluster profile will
automatically use STS instead of static credentials.

### Step 4: Enable Minimal Permissions for Installer

Set `AWS_INSTALL_USE_MINIMAL_PERMISSIONS` to `"yes"` in your job or workflow
configuration. The `aws-provision-iam-user-minimal-permission` chain
(already part of the standard `ipi-aws-pre` chain) will use STS to create
a temporary IAM user with the exact permissions required by the installer.

If your job uses Manual mode with `ccoctl`, also set
`AWS_CCOCTL_USE_MINIMAL_PERMISSIONS` to `"yes"`.

## CloudFormation Templates

All templates are in
[`openshift/ci-tools/hack/aws-sts-roles/`](https://github.com/openshift/ci-tools/tree/master/hack/aws-sts-roles/).

### home-role.cf (DPTP-managed)

Deploys the `ci-step-runner` role in a build cluster's AWS account. The
trust policy allows `AssumeRoleWithWebIdentity` from the cluster's OIDC
provider, scoped to ServiceAccounts in `ci-op-*` namespaces with the
`sts.amazonaws.com` audience.

The role is permitted to assume `arn:aws:iam::*:role/ci-step-runner-hub`.

**Parameters:**

- `OIDCProviderArn` -- ARN of the cluster's OIDC provider
- `OIDCProviderURL` -- OIDC issuer URL (without `https://`)

### hub-role.cf (DPTP-managed)

Deploys the `ci-step-runner-hub` role in the shared hub account. Trusts the
home roles from all build clusters.

The role is permitted to assume `arn:aws:iam::*:role/ci-step-runner-target`.

When adding or removing a build cluster, update the `TrustedHomeRoleArns`
parameter and run a CloudFormation stack update.

**Parameters:**

- `TrustedHomeRoleArns` -- Comma-separated list of home role ARNs from all
  build cluster accounts

### target-role.cf (cluster profile owner)

Deploys the `ci-step-runner-target` role in a cluster profile's target
AWS account. Trusts the hub role and carries full provisioning permissions
equivalent to the legacy `origin-ci-robot-provision` IAM user:

- EC2, ELB, Auto Scaling (full)
- S3 (full)
- IAM, STS (full)
- Route53 and Route53 Domains (full)
- CloudFormation (full)
- ECR, EFS (full)
- Secrets Manager (read/write)
- Lambda (full)
- Resource Groups, Tags (full)
- Service Quotas (read-only)

**Parameters:**

- `TrustedRoleArn` -- ARN of the `ci-step-runner-hub` hub role (obtain from
  DPTP team)

## Security Model

| Property | Static keys (`.awscred`) | STS role chaining |
|---|---|---|
| Credential lifetime | Permanent (until manually rotated) | 24 hours (auto-refreshed) |
| Scope | Unrestricted within the IAM user's policies | Restricted to `ci-op-*` namespaces via OIDC `:sub` condition |
| Rotation | Manual | Automatic (token projection) |
| Blast radius | Leaked key grants access until revoked | Leaked token expires within 24 h; namespace condition limits usage to CI |
| Audit trail | IAM user actions in CloudTrail | STS `AssumeRole*` events with full role chain in CloudTrail |

## Troubleshooting

### STS not activating

If tests continue using static credentials despite the secret containing ARN
keys, verify that **all three** keys (`home_role_arn`, `hub_role_arn`,
`target_role_arn`) are present in the secret. If any one is missing,
`ci-operator` logs a warning and falls back to static credentials.

### AccessDenied errors

1. Verify the home role's trust policy references the correct OIDC provider
   ARN and URL for the build cluster where the test ran.
2. Verify the hub role's `TrustedHomeRoleArns` includes the home role from
   that build cluster.
3. Verify the target role's `TrustedRoleArn` matches the hub role's ARN.
4. Check CloudTrail in all three accounts for the specific
   `AssumeRoleWithWebIdentity` or `AssumeRole` call that failed.

### Token expiry

The projected ServiceAccount token has a 24-hour expiry and is
automatically refreshed by the kubelet. If a test step runs for longer than
24 hours, the AWS SDK will automatically pick up the refreshed token on the
next API call.
