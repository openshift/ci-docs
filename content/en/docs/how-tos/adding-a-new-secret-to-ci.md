---
title: "Adding a New Secret to CI"
date: 2020-12-21T10:08:01-04:00
draft: false
---

If a job needs to access sensitive information, we can seal it into a [Kubernetes secret](https://kubernetes.io/docs/concepts/configuration/secret/) and mount it to the pod which runs the job. There are several OpenShift [clusters in CI build farm](/docs/getting-started/useful-links/#clusters). A user can maintain the secrets in a namespace that the user has access to on `api.ci`. The CI `secret-mirroring` tool can be used to mirror the secrets to other namespaces on all clusters in the build farm. 

## Add A New Secret

Choose a new namespace, and create a pull request to add a folder with the same name in [release/core-services](https://github.com/openshift/release/tree/master/core-services). The folder should contain the manifests for the namespace and the RBACs regarding to the namespace. If the desired namespace exists already, ask the owners of the namespace if it can be shared. After the pull request is merged, the manifests in the folder will be applied automatically to `api.ci`.

Log into `api.ci` and create the secret in the namespace chosen above.

Use the secret as the source in [the mapping file](https://github.com/openshift/release/tree/master/core-services/secret-mirroring).
The secret and any modification on it afterwards will be populated to the targeting namespace on [all clusters](/docs/getting-started/useful-links/#clusters) in the build farm.

```yaml
- from:
    namespace: "some-namespace"
    name: "source-some-secret"
  to:
    namespace: "test-credentials"    # the namespace holding all secrets used in a step
    name: "target-some-secret"       # a unique identifier for your secret
```

Note that we are in the process of turning down the cluster `api.ci` which currently is still used for the secret mirroring process. A new solution for secret management will be in place before `api.ci` is fully removed.

## Use A Secret In A Job Step

The most common case is to use secrets in a [step](/docs/architecture/step-registry/#step) of a job. In this case, we **require** the user to mirror secrets to `test-credentials` namespace. The pod which runs the step can access the secrets defined in `credentials` stanza of the step definition. see [injecting-custom-credentials](https://docs.ci.openshift.org/docs/architecture/step-registry/#injecting-custom-credentials) for details.

## Use A Secret In Non-Step jobs

{{< alert title="Warning" color="warning" >}}
This section is used only for the jobs that had existed before [Test Step Registry](/docs/architecture/step-registry/) was introduced and have not yet been converted to multistage tests with steps. It is strongly suggested to use steps for any new jobs.
{{< /alert >}}

For non-step jobs, we have to use `ci` as the targeting namespace in secret-mirroring.

* For a job which is generated from `ci-operator`'s config and does not use steps, we can mount the secrets via `secrets` stanza in the ci-operator's config, e.g.,

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

* For a job which does not even use `ci-operator` at all, i.e. [handcrafted jobs](/docs/how-tos/contributing-openshift-release/#handcrafted-jobs), the following example shows how to use secrets in a job definition. As stated there, **creating handcrafted jobs is discouraged**. 

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
