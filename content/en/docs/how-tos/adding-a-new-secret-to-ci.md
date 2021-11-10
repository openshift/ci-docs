---
title: "Adding a New Secret to CI"
description: How to self-service manage secret data provided to jobs during execution.
---

Jobs execute as `Pod`s; those that need access to sensitive information will have access to it through mounted Kubernetes
[`Secrets`](https://kubernetes.io/docs/concepts/configuration/secret/). Secret data is managed self-service by the owners
of the data.

## Add A New Secret

In order to add a new secret to our system, you will first need to create a secret collection. Secret collections are managed
at [selfservice.vault.ci.openshift.org](https://selfservice.vault.ci.openshift.org). Just head there, log in, create a new
one and ideally also add your teammates as members. Important: Secret collection names are globally unique in our system.
{{< alert title="Info" color="info" >}} Users must have logged in to the DPTP Vault system at least once before they are listed as potential members. {{< /alert >}}

The secrets themselves are managed in our Vault instance at [vault.ci.openshift.org](https://vault.ci.openshift.org).
You need to use the OIDC auth to log in there. After logging in, click on `kv`, then `selfservice` and you should see your secret collection.

To create a new secret, simply click `Create secret`. Put your data into it and include the special `secretsync` key value pairs listed below. These key value pairs will ensure that the new secret is propagated into the build clusters:

```yaml
secretsync/target-namespace: "test-credentials" # The Namespace of your secret in the build clusters
secretsync/target-name: "my-secret"             # The Name of your secret in the build clusters
```

As an advanced feature, it is also possible to limit the clusters to which the secret should be synced. This is not needed
in most cases and will result in failures if used for secrets that are used by jobs. This also works by using a special
key in vault:

```yaml
secretsync/target-clusters: "one-cluster,another-cluster"
```

## Use A Secret In A Job Step

The most common case is to use secrets in a [step](/docs/architecture/step-registry/#step) of a job. In this case, we
**require** the user to mirror secrets to `test-credentials` namespace. The pod which runs the step can access the secrets
defined in `credentials` stanza of the step definition. See [the documentation](https://docs.ci.openshift.org/docs/architecture/step-registry/#injecting-custom-credentials)
for details.

## Use A Secret In Non-Step jobs

{{< alert title="Warning" color="warning" >}}
This section is used only for the jobs that had existed before [Test Step Registry](/docs/architecture/step-registry/)
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

* For a job which does not even use `ci-operator` at all, i.e. [handcrafted jobs](/docs/how-tos/contributing-openshift-release/#handcrafted-jobs),
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
