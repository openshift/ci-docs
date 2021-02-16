---
title: "Adding a New Secret to CI"
date: 2020-12-21T10:08:01-04:00
draft: false
description: How to self-service manage secret data provided to jobs during execution.
---

Jobs execute as `Pod`s; those that need access to sensitive information will have access to it through mounted Kubernetes
[`Secrets`](https://kubernetes.io/docs/concepts/configuration/secret/). Secret data is managed self-service by the owners
of the data. While there are many OpenShift clusters in the [CI build farm](/docs/getting-started/useful-links/#clusters),
owners of secret data simply need to add their `Secret` to the `api.ci` cluster and automation will sync the data out to
all environments where jobs execute.

## Add A New Secret

In order to commit secret data to our system, the data will need to be added to the `api.ci` cluster.

All users who wish to interact with the system must [log in](/docs/how-tos/use-registries-in-build-farm/#how-do-i-log-in-to-pull-images-that-require-authentication)
to the `api.ci` cluster.

### Creating the manifests

To manage secrets, some manifests have to be created and committed to our Git-ops
[repository](https://github.com/openshift/release) to ensure that the correct configuration is persisted and that users
can cooperate on changing it.

Choose your namespace name and group of administrators, then create a Pull request adding a YAML file with the contents
to a sub-directory of the `core-services/secrets` directory:

```yaml
# this is the Namespace in which your Secret will live
apiVersion: v1
kind: Namespace
metadata:
  annotations:
    openshift.io/description: Automation Secrets for MyProject
    openshift.io/display-name: MyProject CI
  name: my-project
---
# the Group of people who should be able to manage this Secret
kind: Group
apiVersion: v1
metadata:
  name: my-project-admins
users:
  # these names are GitHub usernames
  - bob
  - tracy
  - jim
  - emily
---
# this adds the admins to the project.
kind: RoleBinding
apiVersion: rbac.authorization.k8s.io/v1
metadata:
  name: my-project-viewer-binding
  namespace: my-project
roleRef:
  kind: ClusterRole
  apiGroup: rbac.authorization.k8s.io
  name: view
subjects:
  - kind: Group
    apiGroup: rbac.authorization.k8s.io
    name: my-project-admins
    namespace: my-project
---
# this grants the right to view and update the Secret
kind: RoleBinding
apiVersion: rbac.authorization.k8s.io/v1
metadata:
  name: my-project-admins-binding
  namespace: my-project
roleRef:
  kind: ClusterRole
  apiGroup: rbac.authorization.k8s.io
  name: secret-namespace-manager
subjects:
  - kind: Group
    apiGroup: rbac.authorization.k8s.io
    name: my-project-admins
    namespace: my-project
```

{{< alert title="Info" color="info" >}}
The above YAML does _not_ contain your secret data. You will still need to create it with a manual invocation
of the `oc` CLI. The `openshift/release` repository is public and not an appropriate place to store sensitive information.
{{< /alert >}}

If your desired namespace exists already, ask the owners of the namespace if it can be shared. After the pull request is
merged, the manifests in the folder will be applied automatically to the `api.ci` cluster and you will be ready to use
the `oc` CLI to persist your secret data:

```shell
$ oc --namespace my-project create secret generic my-secret --from-literal password=hard-to-remember
```


### Propagating Secret Data

In order to propagate your secret data to all environments in which jobs execute, an entry must be added to the mirroring
[configuration](https://github.com/openshift/release/tree/master/core-services/secret-mirroring/_mapping.yaml). The secret
and any modification on it afterwards will be populated to the targeting namespace(s) on [all clusters](/docs/getting-started/useful-links/#clusters)
in the build farm.

```yaml
- from:
    namespace: "my-project"
    name: "my-secret"
  to:
    namespace: "test-credentials" # the namespace holding all secrets used in a step
    name: "my-secret"             # a unique identifier for your secret
```

{{< alert title="Info" color="info" >}}
We are in the process of turning down the `api.ci` cluster which currently hosts the source content for the
secret mirroring process. A new solution for secret management will be in place before `api.ci` is fully removed.
{{< /alert >}}

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
