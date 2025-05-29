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


## List

## Update

## Delete

## Get service account

# Commands cheat sheet

In the following commands examples we use `sm` as standing for `/hack/secret-manager.sh` for brevity

## Getting started

- `sm login`: Authorize into Google Cloud through RedHat SSO.

## Create a new secret

#### From file

- `sm create --secret my-secret --from-file <filename> --collection my-collection`: Create a secret `my-secret` in collection `my-collection`.
- `sm create -s my-secret -f <filename> -c my-collection`: Same as above, using short versions of flags.

#### From literal string

- `sm create --secret my-secret --from-literal "value" --collection my-collection`: Create a secret `my-secret` in collection `my-collection`.
- `sm create -s my-secret -l "value" -c my-collection`: Same as above, using short versions of flags.

## Delete a secret

- `sm delete -s my-secret -c my-collection`

## List

- `sm list -c my-collection`: List all secrets in a collection.
- `sm list -g my-group`: List all secret collections for a group.
- `sm list`: List all secret collections.

## Update a secret

### From file

- `sm update --secret my-secret --from-file <filename> --collection my-collection`: Update the secret `my-secret` in collection `my-collection`.
- `sm update -s my-secret -f <filename> -c my-collection`: Same as above, using short versions of flags.

### From literal string

- `sm update --secret my-secret --from-literal "new value" --collection my-collection`: Update the secret `my-secret` in collection `my-collection`.
- `sm update -s my-secret -l "new value" -c my-collection`: Same as above, using short versions of flags.

## Get service account

- `sm get-sa -c my-collection`: Get credentials for the service account associated with the collection.

## Help

- `sm --help`: See the list of available commands and how to use them. Also available for each command for detailed help, e.g. `sm create --help`.