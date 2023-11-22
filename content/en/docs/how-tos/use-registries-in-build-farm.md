---
title: "Interacting With CI Image Registries"
description: How to interact with the CI image registries, set up service account access and interact with images for a specific job.
---

# Summary of Available Registries

The OpenShift CI system runs on OpenShift clusters; each cluster hosts its own image registry. Therefore, a number of
image registries exist in the OpenShift CI ecosystem. The following table shows the public DNS of each registry and has
some comments on their purpose:

{{< rawhtml >}}

<table id="table_registries" class="display" style="width:100%">
    <thead>
        <tr>
            <th>Cluster</th>
            <th>Registry URL</th>
            <th>Description</th>
        </tr>
    </thead>
</table>
{{< /rawhtml >}}

{{< alert title="Warning" color="warning" >}}
The previous registry `registry.svc.ci.openshift.org` has been decommissioned. If there is any reference to its image, e.g., in your Dockerfile,
please use the current authoritative registry [registry.ci.openshift.org](https://registry.ci.openshift.org) instead.
{{< /alert >}}

# Container Image Data Flows

Today, three major data flows exist for container images in the OpenShift CI ecosystem. First, when a job executes on
one of the build farm clusters, container images that need to be [built](/docs/architecture/ci-operator/#building-container-images)
for the execution will exist only on that cluster. Second, when changes are merged to repositories under test, updated
images are built on a build farm and [promoted](/docs/architecture/ci-operator/#publishing-container-images) to the
central, authoritative registry. Users should always pull from this registry for any images they interact with. Third,
when an image changes on the authoritative registry, that change is propagated to all build farm clusters so that the
copies they hold are up-to-date and jobs that run there run with the correct container image versions.

# Common Questions

## How do I log in to pull images that require authentication?

All registries are the internal OpenShift image registry for the cluster they reside on, so authenticating to the registry
requires authentication to the cluster that hosts it. Once logged in to the OpenShift cluster, the `oc` CLI can be used to
authenticate to the registry in question.  The primary example here is the central CI registry `registry.ci.openshift.org`
which is backed by the `app.ci`cluster.

Using the [the list of clusters](/docs/getting-started/useful-links/#clusters), navigate to the [console URL](https://console-openshift-console.apps.ci.l2s4.p1.openshiftapps.com/).
After logging in to this cluster using the console, use the link in the top right "Copy login command" to authenticate your local `oc` CLI.
Then you can run `oc registry login` to authenticate to the registry.

```bash
$ oc registry login
info: Using registry public hostname registry.ci.openshift.org
Saved credentials for registry.ci.openshift.org

$ cat ~/.docker/config.json | jq '.auths["registry.ci.openshift.org"]'
{
  "auth": "token"
}

```

{{< alert title="Info" color="info" >}}
Today, authentication to OpenShift CI clusters is [delegated to Red Hat SSO](/docs/how-tos/rbac/).
{{< /alert >}}

## How do I get a token for programmatic access to the central CI registry?

If you're developing an integration with the central CI registry, an OpenShift `ServiceAccount` should be used. Write a
pull request to the [`openshift/release`](https://github.com/openshift/release) repository that adds a new directory under
the `release/clusters/app.ci/registry-access` directory. In this directory, provide an `OWNERS` file to allow your team
to make changes to your manifests and an `admin_manifest.yaml` file that creates your `ServiceAccount` and associated
[RBAC](/docs/how-tos/rbac/):

```yaml
# this is the Namespace in which your ServiceAccount will live
apiVersion: v1
kind: Namespace
metadata:
  annotations:
    openshift.io/description: Automation ServiceAccounts for MyProject
    openshift.io/display-name: MyProject CI
  name: my-project
---
# this is the ServiceAccount whose credentials you will use
kind: ServiceAccount
apiVersion: v1
metadata:
  name: image-puller
  namespace: my-project
---
# this grants your ServiceAccount rights to pull images
kind: RoleBinding
apiVersion: rbac.authorization.k8s.io/v1
metadata:
  name: my-project-image-puller-binding
  # the namespace from which you will pull images
  namespace: ocp
roleRef:
  kind: ClusterRole
  apiGroup: rbac.authorization.k8s.io
  name: system:image-puller
subjects:
  - kind: ServiceAccount
    namespace: my-project
    name: image-puller
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
# this grants the right to read the ServiceAccount's credentials and pull
# images to the admins.
kind: RoleBinding
apiVersion: rbac.authorization.k8s.io/v1
metadata:
  name: my-project-admins-binding
  namespace: my-project
roleRef:
  kind: ClusterRole
  apiGroup: rbac.authorization.k8s.io
  name: pull-secret-namespace-manager
subjects:
  - kind: Group
    apiGroup: rbac.authorization.k8s.io
    # This is a group from Rover https://rover.redhat.com/groups/
    name: my-project-admins
    namespace: my-project
```

After the pull request is merged, your manifests will be automatically applied to the cluster hosting the central CI
registry. Make sure your `oc` CLI is [logged in](#how-do-i-log-in-to-pull-images-that-require-authentication) to the
`app.ci` cluster via the [console](https://console-openshift-console.apps.ci.l2s4.p1.openshiftapps.com/), then you
will be able to generate the pull credentials for your `ServiceAccount` using the `oc` CLI:

```console
### Require jq cmd: https://stedolan.github.io/jq/
$ oc registry login --auth-basic $(oc get secrets -n my-project --sort-by=.metadata.creationTimestamp -o json | \
  jq '.items[] | select(.type=="kubernetes.io/dockercfg" and .metadata.annotations["kubernetes.io/service-account.name"]=="image-puller")' | \
  jq -r -s '.[-1] | .data.".dockercfg"' | base64 -d | jq -r '."registry.ci.openshift.org" as $e | $e.username + ":" + $e.password') \
  --registry-config=/tmp/config.json
```

The created `/tmp/config.json` file can be then used as a standard `.docker/config.json` authentication file.

## How can I access images that were built during a specific job execution?

Namespaces in which jobs execute on build farms are ephemeral and will be garbage-collected an hour after a job finishes
executing, so access to images used in a specific job execution will only be possible shortly after the job executed.

In order to access these images, first determine the build farm on which the job executed by looking for a log line in
the test output like:

```
2020/11/20 14:12:28 Using namespace https://console.build02.ci.openshift.org/k8s/cluster/projects/ci-op-2c2tvgti
```

This line determines the build farm that executed the tests and the namespace on that cluster in which the execution
occurred. In this example, the job executed on the `build02` farm and used the `ci-op-2c2tvgti` namespace. All registry
pullspecs are in the form `<registry>/<namespace>/<imagestream>:<tag>`, so if we needed to access the source image for
this execution, the pullspec would be `registry.build02.ci.openshift.org/ci-op-2c2tvgti/pipeline:src`. In order to pull
an image from a test namespace, you must be logged in to the registry and be the author of the pull request. Pull the
image with any normal container engine:

```bash
$ podman pull registry.build02.ci.openshift.org/ci-op-2c2tvgti/pipeline:src
```

**Warning:** Only `vSphere` system administrators can access the images on [registry.apps.build01-us-west-2.vmc.ci.openshift.org](https://registry.apps.build01-us-west-2.vmc.ci.openshift.org).

## How do I access the latest published images for my component?

If the `ci-operator` configuration for your component configures image [`promotion`](/docs/architecture/ci-operator/#publishing-container-images),
output container images will be published to the central CI registry when changes are merged to your repository. Two main
configurations are possible for promotion: configuring an `ImageStream` name and namespace or a namespace and a target tag.

### Granting Pull Privileges

In both cases, it will be necessary to declare who should be able to pull the selected images from the registry. By default,
no pulling privileges are provided to any new image. You may choose to simply allow any authenticated user to pull images
from the target `Namespace` or any [user groups](/docs/how-tos/rbac/) who may pull images. In both cases, write a pull request to the
[`openshift/release`](https://github.com/openshift/release) repository that adds a new directory under the
`release/clusters/app.ci/registry-access` directory. In this directory, provide an `OWNERS` file to allow your team
to make changes to your manifests and an `admin_manifest.yaml` file that implements your pull policy. Here's an example
of allowing all authenticated users to pull:

```yaml
# this is the Namespace in which your images live
apiVersion: v1
kind: Namespace
metadata:
  annotations:
    openshift.io/description: Published Images for MyProject
    openshift.io/display-name: MyProject CI
  name: my-project
---
# this grants all authenticated users rights to pull images
kind: RoleBinding
apiVersion: rbac.authorization.k8s.io/v1
metadata:
  name: my-project-image-puller-binding
  namespace: my-project
roleRef:
  kind: ClusterRole
  apiGroup: rbac.authorization.k8s.io
  name: system:image-puller
subjects:
# this is the set of all authenticated users
- apiGroup: rbac.authorization.k8s.io
  kind: Group
  name: system:authenticated
```

### Publication of New Tags

A configuration that specifies the `ImageStream` name looks like the following and results in new tags on that stream
for each image that is promoted:

```yaml
images:
- dockerfile_path: images/my-component
  from: base
  to: my-component
promotion:
  name: "4.7"
  namespace: ocp
```

The `my-component` image can be pulled from the authoritative registry with:

```bash
$ podman pull registry.ci.openshift.org/ocp/4.7:my-component
```

### Publication of New Streams

A configuration that specifies the `ImageStream` tag looks like the following and results in new streams in the namespace
for each image that is promoted, with the named tag in each stream:

```yaml
images:
- dockerfile_path: images/my-component
  from: base
  to: my-component
promotion:
  namespace: my-organization
  tag: latest
```

The `my-component` image can be pulled from the authoritative registry with:

```bash
$ podman pull registry.ci.openshift.org/my-organization/my-component:latest
```

## The CI Image Repository in quay.io: QCI
In addition to the integrated image registry on `app.ci`, all [`promoted`](/docs/architecture/ci-operator/#publishing-container-images)
images are pushed by `ci-operator`
to the image registry `quay.io/openshift/ci`, called _QCI_ for short. To be more precise, the promoted image stream tag `<namespace>/<name>:<tag>`
can be pulled with `quay.io/openshift/ci:<namespace>_<name>_<tag>`. Its namespace, name, and tag are connected with "_" to form the tag in QCI as the images in different namespaces on `app.ci` are converged into a monorepo on `quay.io`. Another side effect is that the promoted images are accessible to each user that has the pull permission on QCI, regardless of the namespace of the tag defined in the `ci-operator`'s configuration.

{{< alert title="Warning" color="warning" >}}
We are in the process of migrating the authoritative, central CI registry from `app.ci` to `quay.io` for the sake of stability and features of the image registry.
The clients of CI images should start to use QCI because promoting images to `app.ci` will be disabled once the migration is complete.
{{< /alert >}}

### Access TO QCI
The access control to the images in QCI is delegated to the [RBACs](/docs/how-tos/rbac/) on `app.ci`.
This is to reduce the effort on managing users in different places.
The access to QCI has to be through a reverse proxy serving `quay-proxy.ci.openshift.org` and only pull permission is granted.

#### Human Users
Create a pull request to include a Rover group that you belong to as a subject in the rolebinding `qci-image-puller` in [the release repo](https://github.com/openshift/release/blob/master/clusters/app.ci/assets/admin_qci-image-puller_rbac.yaml). The change will be applied automatically to `app.ci` after merging.

Provided that `oc` has logged into `app.ci`, we may pull images from QCI such as `quay-proxy.ci.openshift.org/openshift/ci:ci_ci-operator_latest`
by the following commands:

```console
$ podman login -u=$(oc --context app.ci whoami) -p=$(oc --context app.ci whoami -t) quay-proxy.ci.openshift.org --authfile /tmp/t.c
$ podman pull quay-proxy.ci.openshift.org/openshift/ci:ci_ci-operator_latest --authfile /tmp/t.c --platform linux/amd64
```

#### Token For Programmatic Access to QCI
With the `admin_manifest.yaml` [described above](/docs/how-tos/use-registries-in-build-farm/#how-do-i-get-a-token-for-programmatic-access-to-the-central-ci-registry), the members of group `my-project-admins`
can [create bound tokens for the service account](https://docs.openshift.com/container-platform/4.13/authentication/bound-service-account-tokens.html#bound-sa-tokens-configuring-externally_bound-service-account-tokens) `image-puller`
Once `oc` logged in with the service account token, we may use the same commands above to pull the images.
Note that we should avoid creating long-lived tokens for service accounts as described in [the Kubernetes document](https://kubernetes.io/docs/reference/access-authn-authz/service-accounts-admin/#create-token). Regardless of the token types, The members of group `my-project-admins`
is responsible for managing the tokens, e.g., rotate the token in case of leaking.

## Why I am getting an authentication error?

An authentication error may occur both in the case where you have not yet logged in to a registry and in the case where
you logged in to the registry in the past.

### I have not yet logged in to the registry.

Please follow [the directions](#how-do-i-log-in-to-pull-images-that-require-authentication) to log in to the registry.

### I have logged in to the registry in the past.

An unfortunate side-effect of the architecture for container image registry authentication results in authentication
errors when your authentication token expired, even if the image you are attempting to pull requires no authentication.
Authentication tokens expire once a month. All you'll need to do is follow [the directions](#how-do-i-log-in-to-pull-images-that-require-authentication)
to log in to the registry again.

{{< alert title="Warning" color="warning" >}}
Note that `podman logout` will not consider or modify `~/.docker/config.json`
(the default target of `oc registry login`) even though `podman pull` uses that
file for authentication.  Some versions will print an alert message, others will
not:

```console
$ cat ~/.docker/config.json
{"auths":{"registry.ci.openshift.org":{"auth": "…"}}}
$ podman --version
podman version 4.1.1
$ podman logout registry.ci.openshift.org
Not logged into registry.ci.openshift.org with current tool. Existing credentials were established via docker login. Please use docker logout instead.
```

To clear an expired token in order to be able to pull public images again, use
either `docker logout` or indicate the target file via `--authfile` or
`$REGISTRY_AUTH_FILE`:

```console
$ podman logout --authfile ~/.docker/config.json registry.ci.openshift.org
Removed login credentials for registry.ci.openshift.org
```
{{< /alert >}}
