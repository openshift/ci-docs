---
title: "Adding a New Secret to CI"
description: How to self-service manage secret data provided to jobs during execution.
---

Jobs execute as `Pod`s; those jobs that need access to sensitive information can have access through mounted Kubernetes
[`Secrets`](https://kubernetes.io/concepts/configuration/secret/). Secret data is managed self-service by the owners
of the data.

## Add A New Secret

1. Create a "secret collection" at [selfservice.vault.ci.openshift.org](https://selfservice.vault.ci.openshift.org).

   * Log in, click on the "New Collection" button, enter a name for your new secret collection, click the "Submit" button and, ideally, add your teammates as members.

   {{< alert title="Important" color="info" >}} Secret collection names are globally unique in our system. {{< /alert >}}

   {{< alert title="Info" color="info" >}} Users must have logged in to the DPTP Vault system at least once before they are listed as potential members. {{< /alert >}}

2. Create a new secret.

   * Log in to [vault.ci.openshift.org](https://vault.ci.openshift.org) with your OIDC auth (leave the Role as blank/Default).
   * After logging in, click on `kv`, and you should see your secret collection.
   * Click on the link for your secret collection, then click `Create secret +`. Enter the new path (for example, `selfservice/(your secret collection)/newpath`) in the `Path for this secret` box. The message that says `The secret path may not end in /` disappears.
   * Add your new secret data as a key-value pair. Include the special `secretsync` key value pairs listed below. These key value pairs ensure that the new secret is propagated into the build clusters:
    
    ```yaml
    secretsync/target-namespace: "test-credentials" # The Namespace of your secret in the build clusters. Multiple namespaces can be targeted by using a comma-separated list
    secretsync/target-name: "my-secret"             # The Name of your secret in the build clusters
    ```

    In order to avoid putting the sensitive data into a secret used by other tests, it is suggested to give the secret a name as specific as possible,
    e.g., by including the team name or clarifying what content are stored in the secret. A good example is `redhat-developer-services-binding-operator-test-quay-credentials`.

    {{< alert title="Note" color="info" >}}
    Make sure that each secret is longer than 3 characters to reduce the risk of incorrectly censoring other info in the logs.
    {{< / alert >}}

    Before clicking on the "Save" button, it is helpful to switch to JSON mode (click near the top of the page) to ensure the secrets are correctly added (for example, you will be able to clearly see any entries inadvertently set as blank/empty). Your new secret will have a total of three key/value pairs -- one for your secret data, one for `secretsync/target-namespace`, and one for `secretsync/target-name`.

    As an advanced feature, it is also possible to limit the clusters to which the secret should be synced. This is not needed in most cases and will result in failures if used for secrets that are used by jobs. This also works by using a special key in vault:

    ```yaml
    secretsync/target-clusters: "one-cluster,another-cluster"
    ```

## Use A Secret In A Job Step

The most common case is to use secrets in a [step](/architecture/step-registry/#step) of a job. In this case, we
**require** the user to mirror secrets to `test-credentials` namespace. The pod which runs the step can access the secrets
defined in the `credentials` stanza of the step definition. See [the documentation](https://docs.ci.openshift.org/architecture/step-registry/#injecting-custom-credentials)
for details.

The propagation of secret contents is scheduled immediately after they are
added or modified and should be completed within 30m.

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

Therefore, this censoring can only protect a secret from leaking if the secret is present in Vault in a "direct" form.
It may be convenient to store the secrets in Vault in a better consumable form, such as in a shell script that gets
sourced by the test code and populates multiple environmental variables at once. This approach is risky because it makes
**that whole shell script** the censored secret: it will only get stripped if you happen to `cat` it in full by mistake.
However, if the content of one of the environment variables is the actual password that should not leak, the CI has no
chance of knowing that. If that password ends up in a resource in the cluster, and that resource will get collected
as an artifact, the password would leak.

### Good practice

![protected Secret](/secrets-good-practice.png)

In this example, the password is a direct value of a key stored in Vault. When synced to the CI clusters, the password
will be stored in the `password` key of a `Secret` resource and hence will be censored in all artifacts and logs
collected from the CI run.

### Risky practice

![unprotected Secret](/secrets-risky-practice.png)

In the example above, the password is an arbitrary substring of the value stored in Vault. When synced to the CI
cluster, the `secrets.sh` key content will match the one in Vault. The actual secret string `s3cr3t` is unknown to Prow
and therefore will not be censored from any artifacts or logs. Note that this practice is not limited to the shell
script form; the same applies for storing secrets inside JSON snippets and other formats.

### Acceptable practice

![protected convenient secret](/secrets-acceptable-practice.png)

With many secrets passed to CI jobs, it can become inconvenient to pass and consume them in individual keys. It can
therefore be acceptable to pass them for consumption by CI jobs in the "convenient" compound form if, at the same time,
the actual secret value is present directly in a separate key. Structuring your secrets this way makes them convenient
to consume while still being protected by the censoring mechanism. Of course, this assumes you never forget to manage
the secret in two places instead of one.

## Use A Secret In Non-Step jobs

{{< alert title="Warning" color="warning" >}}
This section is used only for the jobs that had existed before [Test Step Registry](/architecture/step-registry/)
was introduced and have not yet been converted to multistage tests with steps. It is strongly suggested to use steps for
any new jobs.
{{< /alert >}}

For non-step jobs, we have to use `ci` as the targeting namespace in the secret mirroring configuration.

* For a job which is generated from `ci-operator` configuration and does not use steps, we can mount the secrets via
  `secrets` stanza in the `ci-operator` configuration, e.g.,

```yaml
tests:
- as: "vet"                      # names this test "vet"
  commands: "go vet ./..."       # declares which commands to run
  container:
    from: "src"                  # runs the commands in "pipeline:src"
  secrets:
  - mount_path: "/secret"        # mount path of the extracted files from the secret
    name: "secret-name-in-ci"    # the secret name in the ci namespace
```

* For a job which does not even use `ci-operator` at all, i.e. [handcrafted jobs](/how-tos/contributing-openshift-release/#handcrafted-jobs),
  the following example shows how to use secrets in a job definition. As stated there, **creating handcrafted jobs is discouraged**.

```yaml
postsubmits:
  org/repo:
  - name: bar-job
    branches:
    - ^master$
    spec:                       # Valid Kubernetes PodSpec.
      containers:
      - image: docker.io/hello-world
        name: ""
        volumeMounts:
        - mountPath: "/secret"               # mount path of the extracted files from the secret
          name: "volume-name"
      volumes:
      - name: "volume-name"
        secret:
          secretName: "secret-name-in-ci"    # the secret name in the ci namespace
```
