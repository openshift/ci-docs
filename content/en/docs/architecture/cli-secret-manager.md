---
title: "Using the Secret Manager CLI"
description: How to manage CI secrets using the Secret Manager CLI tool.
---

This page provides an overview of the Secret Manager CLI — a tool for managing CI secrets — and covers its core commands, usage patterns, and capabilities.

# What is the Secret Manager CLI?

The Secret Manager CLI is the primary way to manage secrets used in CI workflows. It is a command-line tool that runs locally, allowing users to:

- Create new secrets
- List, delete and update existing secrets
- Retrieve authentication information for the service account tied to a secret collection

{{< alert title="Note" color="info" >}}
In the future, we may provide a GUI (e.g., a web interface),
but currently, the CLI is the only interface available.
{{< / alert >}}

## Prerequisites

Before using the Secret Manager CLI, make sure you have the following installed:

- [**gcloud CLI**](https://cloud.google.com/sdk/gcloud) – Required for authentication with Google Cloud, where CI secrets are stored.
- **Python 3** – Required for running the tool.

## Initial setup

To start using the Secret Manager CLI:

1. Clone the [openshift/release](https://github.com/openshift/release) GitHub repository locally.

2. Run the CLI via the wrapper script located at `hack/secret-manager.sh`. For example:

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
   You only need to log in once unless you explicitly log out of your `gcloud` account.

   Once authenticated, you can use all supported commands (`create`, `list`, `update`, etc.).

## Understanding secret collections

Secrets are organized into collections that control access and ownership. Here’s how they work and how your group gets access:

- **Each secret belongs to collection**. A collection is a logical grouping of secrets.
- **Access to collections is granted to Rover groups** – not individuals. You must be part of a Rover group with access to the collection.
- Permissions are based on the **email address associated with your Rover group**.

To use a collection (or create a new one), your Rover group must be added to [this configuration file](https://github.com/openshift/release/tree/master/core-services/sync-rover-groups/_config.yaml) in the `openshift/release` repo.

{{< alert title="Note" color="info" >}}
We encourage users to automate secret rotation using the dedicated write-only service account provided for each collection. [Learn more](#getting-the-service-account-associated-with-a-collection).
{{< /alert >}}

### Adding a New Secret Collection

To give the `abc` group access to a collection called `my-collection`, update the [configuration file](https://github.com/openshift/release/tree/master/core-services/sync-rover-groups/_config.yaml) like this:

```yaml
groups:
  ...
  abc:
    secret_collections:
      - my-collection
```

- A collection can belong to multiple groups.
- A group can own multiple collections.

After your PR is merged, a postsubmit job (TODO: add job link) will run to sync the changes. Once that job completes successfully, your group will have full access to manage secrets in that collection.

# Common tasks

In the following command examples we use `sm` as standing for `./hack/secret-manager.sh` for brevity.

Also see [commands cheat sheet](#commands-cheat-sheet) for quick reference.

## Creating a new secret

{{< alert title="Note" color="info" >}}
A secret must belong to a [collection](#understanding-secret-collections).
Before creating a new secret, make sure you have access to the target collection, or [create a new collecion](#adding-a-new-secret-collection).
{{< / alert >}}

To create a new secret, run:

```sh
sm create -collection=my-collection -secret=foo --from-file=./credentials.json
```

After executing this command, you’ll be prompted to enter some metadata.
These metadata help us track ownership and manage secrets effectively.
These fields are mandatory. If something doesn’t apply, enter `none`.
You’ll be asked to provide:

- **Jira project**: The JIRA project used by your team (e.g. ART for issues.redhat.com/browse/ART). This helps Test Platform track incidents related to the secret.
- **Rotation information**: A short explanation of how the secret is rotated. This helps future team members maintain token rotation. Do not include sensitive information -- focus on the process or tools used.
- **Request information**: Context for why this secret was created (e.g. links to tickets, documentation, chat threads). This helps others know who to contact if issues arise. Do not include sensitive data.

After you enter the metadata, a secret named `foo` will be created in the `my-collection` collection, with the contents of `credentials.json`.

Once created, the secret is immediately available for use in CI jobs.

### Creating a secret from a string

You can also create a secret from the contents of a literal string value using the `--from-literal` option:

```sh
sm create -collection=my-collection -secret=foo --from-literal="secret value"
```

For additional details about the `create` command, run:

```sh
sm create --help
```

## Listing secrets and collections

You can use the `list` command to inspect what secrets and collections exist. This is often the first step before creating, updating, or deleting a secret.

You can also add the `o -json` option to the commands below to output the data in JSON format (useful for scripting or automation).

### Listing all secrets in a specific collection

To list all secrets that exist in a given collection, run:

```sh
sm list --collection=my-collection
```

### Listing all secret collections for a group

To list all collections your group has access to, run:

```sh
sm list --group=my-group
```

This lists all collections configured for the `my-group` Rover group, as defined in [the configuration file](https://github.com/openshift/release/tree/master/core-services/sync-rover-groups/_config.yaml).

### Listing all secret collections

If no options are provided, `sm list` prints *all configured collections* across all groups:

```sh
sm list
```

This is useful for general exploration, especially if you're unsure of the collection or group names.

## Updating a secret

To change the contents of a secret that already exists, use the `update` command.
You can provide new secret data either from a file or directly as a literal string.
The update takes effect immediately, and the new secret value will be used the next time a new instance of a CI job references it.

{{< alert title="Note" color="info" >}}
You can only update secrets in collections you have access to. To check which secret collections you have access to, use `sm list --group=<my-group>` or see [the configuration file](https://github.com/openshift/release/tree/master/core-services/sync-rover-groups/_config.yaml).
{{< / alert >}}

### Updating a secret from file

To update the contents of a secret with data from a file:

```sh
sm update --collection=my-collection --secret=foo --from-file=./new-creds.json
```

### Updating a secret from a literal string

To update the contents of a secret with a plain string value:

```sh
sm update --collection=my-collection --secret=foo --from-literal="new secret value"
```

For more details, run:

```sh
sm update --help
```

## Deleting a secret

To remove a secret from a collection, use the `delete` command.

{{< alert title="Note" color="info" >}}
You can only delete secrets in collections you have access to. To check which secret collections you have access to, use `sm list --group=<my-group>` or see [the configuration file](https://github.com/openshift/release/tree/master/core-services/sync-rover-groups/_config.yaml).
{{< / alert >}}

### Example

To delete a secret named `foo` from the `my-collection` collection:

```sh
sm delete --collection=my-collection --secret=foo
```

For more details, run:

```sh
sm delete --help
```

## Getting the service account associated with a collection

Each secret collection has a dedicated write-only service account associated with it. This service account is intended for automating secret rotation (e.g., by setting up a scheduled job in your team).

This service account:

- Can create, update, and delete secrets in the collection.
- Cannot read secrets — this is by design, to protect sensitive data.

To retrieve the authentication credentials (in JSON format) for this service account, run:

```sh
sm get-sa --collection=my-collection
```

This command does not create a new service account — it simply returns the credentials for the one already associated with the specified collection. You can use these credentials to configure a script or automation tool that rotates secrets on a regular basis.

# Troubleshooting

TODO

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

## Create a new secret

### From ile

- `sm create --secret my-secret --from-file ./path/to/file --collection my-collection`  
  Create a secret from file contents.

### From literal string

- `sm create --secret my-secret --from-literal "secret value" --collection my-collection`  
  Create a secret from a literal string value.

## Update a Secret

### From File

- `sm update --secret my-secret --from-file ./path/to/file --collection my-collection`  
  Update a secret using a new file.

### From Literal String

- `sm update --secret my-secret --from-literal "new value" --collection my-collection`  
  Update a secret with a new literal string.

## Delete a Secret

- `sm delete --secret my-secret --collection my-collection`  
  Delete a secret from a collection.

## List

- `sm list --collection my-collection`  
  List all secrets in a collection.
- `sm list --group my-group`  
  List all secret collections for a group.
- `sm list`  
  List all secret collections.

## Get Service Account

- `sm get-sa --collection my-collection`  
  Retrieve credentials for the service account associated with the collection.
