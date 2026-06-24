---
title: "Adding a New Secret to CI (Coming Soon)"
description: How to add and manage secrets used by CI jobs.
---

{{%  alert title="Coming soon" color="info" %}}
This page describes the new Google Secret Manager-based secrets workflow, which is not yet in production.
Until the migration is complete, please continue using the [current Vault-based workflow](/how-tos/adding-a-new-secret-to-ci/).
{{% /alert %}}

Jobs execute as `Pod`s; those jobs that need access to sensitive information can have it mounted from
[Google Secret Manager](https://cloud.google.com/security/products/secret-manager) (GSM). Secret data is managed
self-service by the owners of the data using the [Secret Manager CLI](/architecture/cli-secret-manager/).

{{% alert title="Security model" color="warning" %}}
Secret values **cannot be read back** by users. Only the CI infrastructure reads secrets during job execution.
This is by design to protect sensitive data.
{{% /alert %}}

## Add a New Secret

### Step 1: Create a secret collection

Secrets are organized into **collections**. A collection defines ownership and access control through a [Rover group](https://rover.redhat.com/groups/).

If your team already has a collection, skip to [Step 2](#step-2-create-the-secret). To create a new one:

1. Go to [Rover groups](https://rover.redhat.com/groups/) and find an existing group for your team, or create a new one.

   {{% alert title="Important" color="warning" %}}
   The Rover group must have **email/calendar capabilities enabled**. This is required for the access control integration
   to work. When creating a new group, check "Enable mail/calendar capabilities." For existing groups, this setting can be
   enabled in the group settings.
   {{% /alert %}}

2. Submit a PR to [`openshift/release`](https://github.com/openshift/release) adding your Rover group and collection
   to [`core-services/sync-rover-groups/_config.yaml`](https://github.com/openshift/release/blob/master/core-services/sync-rover-groups/_config.yaml):

   ```yaml
   groups:
     your-rover-group-name:
       secret_collections:
         - your-collection-name
   ```

   {{% alert title="Note" color="info" %}}
   Secret collection names are globally unique in our system.
   {{% /alert %}}

3. After the PR is merged, a postsubmit job will provision the collection. This typically takes under a minute.

### Step 2: Create the secret

Use the [Secret Manager CLI](/architecture/cli-secret-manager/) to create your secret. If you haven't set up the CLI yet,
see the [initial setup instructions](/architecture/cli-secret-manager/#initial-setup).

```sh
sm create -c my-collection my-group/my-field --from-file=./secret-data.txt
```

The secret path uses the format `group/field`:
- **group**: organizes related secrets (e.g., `aws`, `gcp`)
- **field**: the specific piece of secret data (e.g., `password`, `api-key`)

For example, to store AWS credentials:

```sh
sm create -c my-collection aws/access-key-id --from-literal="AKIA..."
sm create -c my-collection aws/secret-access-key --from-file=./secret-key.txt
```

See the [CLI documentation](/architecture/cli-secret-manager/) for full details on creating, updating, listing, and deleting secrets.

## Use a Secret in a Job Step

The most common case is to use secrets in a [step](/architecture/step-registry/#step) of a job. The pod which runs the
step can access the secrets defined in the `credentials` stanza of the step definition.

### Mount an entire group

To mount all fields from a group, reference the collection and group:

```yaml
ref:
  as: my-step
  from: base
  commands: my-step-commands.sh
  credentials:
  - collection: my-collection
    group: aws
    mount_path: /var/run/aws-creds
```

All fields in `my-collection/aws/` are mounted as files under `/var/run/aws-creds/`. For example, if the group contains
`access-key-id` and `secret-access-key`:

```
/var/run/aws-creds/access-key-id
/var/run/aws-creds/secret-access-key
```

### Mount a single field

To mount only one specific field from a group, add the `field` key:

```yaml
credentials:
- collection: my-collection
  group: aws
  field: access-key-id
  mount_path: /var/run/aws-creds
```

Only `access-key-id` is mounted at `/var/run/aws-creds/access-key-id`.

### Rename a field on mount

If the field name in GSM differs from the file name your code expects, use the
`as` key to rename it:

```yaml
credentials:
- collection: my-collection
  group: gcp
  field: credentials
  as: renamed-credentials
  mount_path: /var/run/gcp-creds
```

The file will be mounted as `/var/run/gcp-creds/renamed-credentials`.

Once created, the secret is immediately available for use in CI jobs that reference it via `collection`/`group`
in their credential stanzas.

See the [step registry documentation](/architecture/step-registry/#injecting-custom-credentials) for more details
on how credentials are injected into steps.

## Composed Secrets (Bundles)

Sometimes you need to mount secrets from multiple groups together as a single set of files. You can always do this
by listing multiple `collection`/`group` entries in your `credentials` stanza. However, if you find yourself repeating
the same combination of entries across many steps, **bundles** let you group them under one reusable name.

### Creating a bundle

Bundles are defined in [`core-services/ci-secret-bootstrap/gsm-config.yaml`](https://github.com/openshift/release/blob/master/core-services/ci-secret-bootstrap/gsm-config.yaml)
in the `openshift/release` repository. Submit a PR to add a new bundle:

```yaml
bundles:
- name: my-app-secrets
  gsm_secrets:
  - collection: my-collection
    group: db-creds
  - collection: my-collection
    group: api-keys
```

This creates a bundle called `my-app-secrets` that includes all fields from both the `db-creds` and `api-keys` groups.

### Referencing a bundle in a job step

In your step's credential stanza, reference the bundle by name:

```yaml
credentials:
- bundle: my-app-secrets
  mount_path: /var/run/my-app-secrets
```

All fields from all groups in the bundle are mounted under the specified path.

{{% alert title="Note" color="info" %}}
Changes to bundles require a PR to `openshift/release`. After the PR is merged, it may take 1-2 hours
for the changes to be propagated to CI jobs.
{{% /alert %}}

## Naming Conventions

Collection and group names can contain letters, numbers, hyphens (`-`), and single underscores (`_`).

For backwards compatibility with the previous secrets storage, old secret names containing dots (`.`) hat to be stored
with `--dot--` substitution, because Google secret manager (GSM) does not support dots in secret names. For example,
`credentials.json` becomes `credentials--dot--json` in GSM. Dots are not supported for new secrets, and we recommend
using hyphens instead of dots (e.g., `sa-key` instead of `sa.key`) when creating a new secret.

## Protecting Secrets from Leaking

Unfortunately, secrets can often leak indirectly in various ways. Commonly, a setup step of a CI job uses a secret
to configure a resource in the cluster, and then later another step collects that resource when capturing artifacts for
the CI job. Logs and artifacts in OpenShift CI are publicly accessible, so when secrets are included in artifacts, they
leak and must be rotated. To mitigate this risk, the Prow component that processes and stores all artifacts and logs
contains a feature that automatically censors all secrets it can detect before uploading them to storage. Although this
feature is relatively powerful (it detects and censors the content of artifacts that are tar or gzip archives, has
built-in support for some compound secret formats like pull secrets and INI files, censors base64-encoded forms
of the secret strings, etc.), it still needs to know what secret strings to search for.

The censoring process takes advantage of the fact that the secret value needs to be provided to the `Pod` running
the test code. In OpenShift CI, all secrets are provided to CI jobs via populating a namespace with `Secret` resources,
and therefore the CI job cannot use (and thus, leak) anything that is not present in one of the `Secret` resources
in the namespace. The censoring code scans all artifacts for all values of all `Secret` resources in the namespace where
the `Pod` runs and removes all matches it finds.

Therefore, this censoring can only protect a secret from leaking if the secret is stored in a "direct" form.
It may be convenient to store secrets in a better consumable form, such as in a shell script that gets
sourced by the test code and populates multiple environmental variables at once. This approach is risky because it makes
**that whole shell script** the censored secret: it will only get stripped if you happen to `cat` it in full by mistake.
However, if the content of one of the environment variables is the actual password that should not leak, the CI has no
chance of knowing that. If that password ends up in a resource in the cluster, and that resource will get collected
as an artifact, the password would leak.

### Good practice

Store each sensitive value as its own field:

```sh
sm create -c my-collection db/password --from-literal="s3cr3t"
```

The value `s3cr3t` is stored directly as the field `password`. When mounted in a CI job, Prow knows that `s3cr3t` is
a secret string and will censor it from all artifacts and logs.

### Risky practice

Store a script or config file that embeds the sensitive value:

```sh
# secrets.sh contains: export PASSWORD=s3cr3t
sm create -c my-collection db/secrets-sh --from-file=./secrets.sh
```

The value stored in GSM is the entire contents of `secrets.sh` (`export PASSWORD=s3cr3t`). Prow will censor the
full string `export PASSWORD=s3cr3t` if it appears verbatim in logs, but it has no way of knowing that `s3cr3t` alone
is the actual sensitive part. If `s3cr3t` leaks separately (e.g., it ends up in a cluster resource collected as an
artifact), it will **not** be censored.

This applies to any compound format — shell scripts, JSON snippets, INI files, etc.

### Acceptable practice

If consuming secrets individually is impractical, you can store them in a compound format **and** store the raw values
as separate fields:

```sh
# Compound form for convenience
sm create -c my-collection db/secrets-sh --from-file=./secrets.sh

# Raw value for censoring protection
sm create -c my-collection db/password --from-literal="s3cr3t"
```

This way your test scripts can source `secrets.sh` for convenience, while Prow still knows to censor `s3cr3t` from
artifacts. The tradeoff is that you must keep both fields in sync when rotating the secret.
