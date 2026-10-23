---
title: "Using the Secret Manager CLI"
description: How to manage CI secrets using the Secret Manager CLI tool.
---

This page provides an overview of the Secret Manager CLI — a tool for managing CI secrets — and covers its core commands, usage patterns, and capabilities.

# What is the Secret Manager CLI?

The Secret Manager CLI is the primary way to manage secrets used in CI workflows. It is a command-line tool that runs locally, allowing users to:

- Create new secrets
- List, delete and update existing secrets
- Inspect a secret's metadata (creation date, ownership info) without revealing its value
- Retrieve authentication information for a collection's service account, where one has been requested

{{% alert title="Note" color="info" %}}
In the future, we may provide a GUI (e.g., a web interface),
but currently, the CLI is the only interface available.
{{% /alert %}}

{{% alert title="Security model" color="warning" %}}
Members of a Rover group can create, update, and delete secrets in their collections, but **cannot read secret values back**. Only the CI infrastructure reads secrets during job execution. This is by design to protect sensitive data.
{{% /alert %}}

## Prerequisites

Before using the Secret Manager CLI, make sure you have the following installed:

- [**gcloud CLI**](https://cloud.google.com/sdk/gcloud) – Required for the initial authentication (`login` command). Follow the [installation instructions](https://cloud.google.com/sdk/docs/install) for your platform.
- **podman** or **docker** – The CLI runs inside a container. Set `CONTAINER_ENGINE=docker` if using Docker instead of the default podman.

## Initial setup

To start using the Secret Manager CLI:

1. Clone the [openshift/release](https://github.com/openshift/release) GitHub repository locally.

2. Run the CLI via the wrapper script located at `hack/secret-manager.sh`. The script runs the CLI inside a container, so make sure you have a running podman (or docker) daemon before proceeding. For example:

   ```sh
   ./secret-manager.sh login
   ```

   To make this easier, we recommend setting an alias:

   ```sh
   alias sm="./<path-to-release-repo>/hack/secret-manager.sh"
   ```

   You can then use the tool like this:

   ```sh
   sm login
   ```

3. The first command you need to run is `login`. This will open a browser window and authenticate you through Red Hat SSO.
   Temporarily, `login` signs you in twice, one after the other: first to Google Cloud, then to Red Hat SSO. Complete both in your browser.
   Credentials are cached locally. The Red Hat SSO sign-in expires after about an hour; when needed, `sm list -c` opens your browser again to renew it.

   To clear cached credentials and log out, run:

   ```sh
   sm clean
   ```

   Once authenticated, you can use all supported commands (`create`, `list`, `update`, etc.).

## Quick start

Once logged in, here's how to create and list a secret:

```sh
sm create -c my-collection aws/api-token --from-literal="my-secret-value"
sm list -c my-collection
```

The rest of this page explains the concepts and commands in detail.

## Understanding secret collections and groups

Secrets are organized in a three-level hierarchy that controls access and organization:

- **Collection** (top level): A logical grouping that defines ownership and access control. Access to collections is granted to Rover groups – not individuals.
- **Group** (middle level): A subdivision within a collection that organizes related fields together (e.g., `aws`, `gcp`, or nested like `ibmcloud/config`). Group names use forward slashes (`/`) for hierarchy.
- **Field** (bottom level): An individual piece of secret data (e.g., `username`, `password`, `api-token`).

**Example hierarchy:**
```
my-collection/              # Collection
├── aws/                    # Group
│   ├── access-key-id       # Field
│   └── secret-access-key   # Field
└── gcp/config/             # Nested group
    └── sa-key              # Field
```

### Naming rules

Collection names can contain lowercase letters, numbers, hyphens (`-`), and single underscores (`_`).
Group and field names can additionally contain uppercase letters.

**How secrets are referenced in CI configs:**

In your CI configuration files (`ci-operator/config/` or step registry), you reference secrets using the collection and group:

```yaml
credentials:
- collection: my-collection
  group: aws
  mount_path: /tmp/aws-creds
```

This automatically mounts all fields in `my-collection/aws/` to the specified path. 
For example, if the group `aws` contains fields `access-key-id` and `secret-access-key`, both will be mounted as files under `/tmp/aws-creds/`:

```
/tmp/aws-creds/access-key-id
/tmp/aws-creds/secret-access-key
```

To mount only a single field instead of the entire group, specify the `field` key:

```yaml
credentials:
- collection: my-collection
  group: aws
  field: access-key-id
  mount_path: /tmp/aws-creds
```

### Who can use a secret collection
Permissions are based on the **email address associated with your Rover group**.
To modify secrets within a collection, a Rover group you are a member of 
must be added to [this configuration file](https://github.com/openshift/release/tree/master/core-services/sync-rover-groups/_config.yaml) in the `openshift/release` repo.

#### Creating a New Secret Collection

To give the `abc` rover group access to a collection called `my-collection`, update the [configuration file](https://github.com/openshift/release/tree/master/core-services/sync-rover-groups/_config.yaml) like this:

```yaml
groups:
  abc:
    secret_collections:
      - my-collection
```

- A collection can belong to multiple groups.
- A group can own multiple collections.

After your PR is merged, a postsubmit job (`branch-ci-openshift-release-main-gsm-secrets-reconciler`) will run to sync the changes. This typically takes under a minute.
Once that job completes successfully, your rover group will have full access to manage secrets in that collection.

# Common tasks

In the following command examples we use `sm` as standing for `./hack/secret-manager.sh` for brevity.

Also see [commands cheat sheet](#commands-cheat-sheet) for quick reference.

## Creating a new secret

{{% alert title="Note" color="info" %}}
A secret must belong to both a [collection and a group](#understanding-secret-collections-and-groups).
Before creating a new secret, make sure you have access to the target collection, or [create a new collection](#creating-a-new-secret-collection).
{{% /alert %}}

To create a new secret, specify the collection and the secret path in `group/field` format:

```sh
sm create -c my-collection aws/access-key-id --from-file=./credentials.json
```

This creates a secret at the path `my-collection/aws/access-key-id`.

**Secret path format:** The positional argument uses forward slashes to separate group and field:
- Simple: `aws/password` (group: `aws`, field: `password`)
- Nested: `ibmcloud/config/api-key` (group: `ibmcloud/config`, field: `api-key`)

You don't need to create the group ahead of time -- there is no separate "create group" step. A group is just part of a secret's path, so it comes into existence automatically the first time you create a secret in it (and stops existing once its last secret is deleted).

After executing this command, you’ll be prompted to enter some metadata.
These help us track ownership and manage secrets effectively.
If a field doesn’t apply to your case, enter `none` to continue.
You’ll be asked to provide:

- **Jira project**: The JIRA project used by your team (e.g. ART for issues.redhat.com/browse/ART). This helps Test Platform track incidents related to the secret.
- **Rotation information**: A short explanation of how the secret is rotated. This helps future team members maintain token rotation. Do not include sensitive information -- focus on the process or tools used.
- **Request information**: Context for why this secret was created (e.g. links to tickets, documentation, chat threads). This helps others know who to contact if issues arise. Do not include sensitive data.

After you enter the metadata, a secret at `my-collection/aws/access-key-id` will be created with the contents of `credentials.json`.

Once created, the secret is immediately available for use in CI jobs that reference it via `collection`/`group` in their credential stanzas. 
For secrets that are part of a [bundle](/how-tos/adding-a-new-secret-to-ci-gsm/#composed-secrets-bundles) (e.g., cluster profile secrets), it may take 1-2 hours for the changes to be propagated.

{{% alert title="Note" color="info" %}}
Secret rotation can be automated with a write-only service account, if your collection has one. [Learn more](#getting-the-service-account-associated-with-a-collection).
{{% /alert %}}

### Creating a secret from a literal string

You can also create a secret from the contents of a literal string value using the `--from-literal` option:

```sh
sm create -c my-collection aws/api-token --from-literal="secret value"
```

For additional details about the `create` command, run:

```sh
sm create --help
```

## Listing secrets, rover groups, and collections

You can use the `list` command to inspect what secrets, rover groups, and collections exist. This is often the first step before creating, updating, or deleting a secret.

You can also add the `-o json` option to the commands below to output the data in JSON format (useful for scripting or automation).

### Listing all fields in a collection

To list all fields within a collection, run:

```sh
sm list -c my-collection
```

This displays all fields in `group/field` format, organized by group:

```
aws/access-key-id
aws/secret-access-key

gcp/sa-key

ibmcloud/config/api-key
```

### Listing all secret collections for a Rover group

To list all collections your Rover group has access to, run:

```sh
sm list --rover-group=my-rover-group
```

This lists all collections configured for the `my-rover-group` Rover group, as defined in [the configuration file](https://github.com/openshift/release/tree/master/core-services/sync-rover-groups/_config.yaml).

{{% alert title="Note" color="info" %}}
`--rover-group` refers to your **Rover group** (for access control), which is different from **secret groups** (the organizational hierarchy within collections like `aws`, `gcp`, etc.).
{{% /alert %}}

### Listing all secret collections

If no options are provided, `sm list` prints *all configured collections* across all groups:

```sh
sm list
```

This is useful for general exploration, especially if you're unsure of the collection or group names.

## Inspecting a secret's metadata

To see the metadata associated with a secret, use the `describe` command:

```sh
sm describe -c my-collection aws/access-key-id
```

This prints the secret's creation date and the ownership metadata that was
provided when it was created (Jira project, rotation instructions, and request
information):

```
Created:               2026-08-10 15:36:59 UTC
JIRA project:          my-team
Rotation instructions: rotated quarterly via the cloud console
Request information:   https://issues.redhat.com/browse/DPTP-1234
```

{{% alert title="Note" color="info" %}}
`describe` only reads metadata -- it never fetches or displays the secret value,
consistent with the security model. Add `-o json` to get the metadata in JSON
format.
{{% /alert %}}

## Updating a secret

To change the contents of a secret that already exists, use the `update` command.
You can provide new secret data either from a file or directly as a literal string.
The update takes effect immediately, and the new secret value will be used the next time a new instance of a CI job references it.

Previous versions of the secret are retained automatically by the underlying storage. However, the CLI always uses the latest version, and there is currently no way to roll back to a previous version through the CLI.

{{% alert title="Note" color="info" %}}
You can only update secrets in collections you have access to. To check which secret collections you have access to, use `sm list --rover-group=<my-rover-group>` or see [the configuration file](https://github.com/openshift/release/tree/master/core-services/sync-rover-groups/_config.yaml).
{{% /alert %}}

### Updating a secret from file

To update the contents of a secret with data from a file:

```sh
sm update -c my-collection aws/access-key-id --from-file=./new-creds.json
```

### Updating a secret from a literal string

To update the contents of a secret with a plain string value:

```sh
sm update -c my-collection aws/api-token --from-literal="new secret value"
```

For more details, run:

```sh
sm update --help
```

## Deleting a secret

To remove a secret from a collection, use the `delete` command.

{{% alert title="Note" color="info" %}}
You can only delete secrets in collections you have access to. To check which secret collections you have access to, use `sm list --rover-group=<my-rover-group>` or see [the configuration file](https://github.com/openshift/release/tree/master/core-services/sync-rover-groups/_config.yaml).
{{% /alert %}}

### Example

To delete a secret from a collection:

```sh
sm delete -c my-collection aws/access-key-id
```

For more details, run:

```sh
sm delete --help
```

## Getting the service account associated with a collection

A secret collection can have a write-only service account, intended for automating secret rotation
(e.g., by setting up a scheduled job in your team).

This service account:

- Can create, update, and delete secrets in the collection.
- Cannot read secrets — this is by design, to protect sensitive data.

Service accounts are **not created for every collection**. Yours has one only if it is listed under
`updater_service_accounts` in
[`core-services/sync-rover-groups/_config.yaml`](https://github.com/openshift/release/blob/master/core-services/sync-rover-groups/_config.yaml).
See [requesting one](/how-tos/adding-a-new-secret-to-ci-gsm/#access-for-automation-that-is-not-a-person)
if you need it. You do not need one to manage secrets yourself — membership of the collection's Rover
group is enough.

To retrieve the authentication credentials (in JSON format) for a collection that has one, run:

```sh
sm get-sa -c my-collection
```

This command does not create a service account — it returns the credentials for the one already
associated with the collection, and fails if the collection has none. You can use these credentials
to configure a script or automation tool that rotates secrets on a regular basis.

# Troubleshooting

### "You don't have permission to access secrets in collection '...'"

Your Rover group doesn't have access to this collection. Check which collections you have access to with `sm list --rover-group=<your-rover-group>`. If the collection is missing, add it to the [configuration file](https://github.com/openshift/release/tree/master/core-services/sync-rover-groups/_config.yaml) and wait for the postsubmit job to complete.

### "Your hack/secret-manager.sh is outdated"

Run `git pull` in your local `openshift/release` checkout, then retry.

### "Could not listen on local port 8085 for the SSO login"

The Red Hat SSO sign-in needs local port 8085. Stop the program using it (for example, another running `sm` command), then retry.

### "Collection '...' does not exist"

The collection hasn't been provisioned yet. Make sure it's listed in the [configuration file](https://github.com/openshift/release/tree/master/core-services/sync-rover-groups/_config.yaml), the PR is merged, and the postsubmit job has completed successfully.

### "Secret '...' already exists"

Use `sm update` instead of `sm create` to change the value of an existing secret.

### "Secret '...' is in inconsistent state"

The secret exists in one place but not the other (index vs storage). Run `sm delete -c <collection> <group/field>` to clean up, then `sm create` to recreate it.
If that doesn't help, please reach out to the Test Platform team on `#forum-ocp-testplatform` Slack channel.

### `sm get-sa` fails for a collection you have access to

The collection most likely has no service account — they are only created for collections listed under
`updater_service_accounts`. See
[requesting one](/how-tos/adding-a-new-secret-to-ci-gsm/#access-for-automation-that-is-not-a-person).
You do not need a service account to manage secrets yourself; your Rover group membership already
covers that.

# Commands cheat sheet

In the following examples, `sm` stands for `./hack/secret-manager.sh`.

> **Note:** Each command also supports short flag versions (e.g. `-c` instead of `--collection`).  
> Run `<command> --help` to see all available options and shortcuts.

## Help

- `sm --help`  
  Show the list of available commands.
- `sm <command> --help`  
  Show detailed help for a specific command (e.g. `sm create --help`).

## Getting started

- `sm login`  
  Authorize into Google Cloud using Red Hat SSO.
- `sm clean`  
  Remove cached credentials and log out.

## Create a new secret

### From file

- `sm create -c my-collection aws/my-secret --from-file ./path/to/file`  
  Create a secret from file contents.

### From literal string

- `sm create -c my-collection aws/my-secret --from-literal "secret value"`  
  Create a secret from a literal string value.

## Update a secret

### From file

- `sm update -c my-collection aws/my-secret --from-file ./path/to/file`  
  Update a secret using a new file.

### From literal string

- `sm update -c my-collection aws/my-secret --from-literal "new value"`  
  Update a secret with a new literal string.

## Delete a secret

- `sm delete -c my-collection aws/my-secret`  
  Delete a secret from a collection.

## List

- `sm list -c my-collection`  
  List all fields in a collection (displayed in `group/field` format).
- `sm list --rover-group my-rover-group`  
  List all secret collections accessible by a Rover group.
- `sm list`  
  List all secret collections.

## Describe a secret

- `sm describe -c my-collection aws/my-secret`  
  Show a secret's creation date and ownership metadata (never its value).

## Get Service Account

- `sm get-sa -c my-collection`  
  Retrieve credentials for the collection's service account, if it has one.