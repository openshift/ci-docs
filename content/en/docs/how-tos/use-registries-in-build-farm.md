---
title: "Interacting With CI Image Registries"
date: 2020-12-15T16:08:01-04:00
draft: false
---

# Summary of Available Registries

The OpenShift CI system runs on OpenShift clusters; each cluster hosts its own image registry. Therefore, a number of
image registries exist in the OpenShift CI ecosystem. The following table shows the public DNS of each registry and has
some comments on their purpose:

|  Cluster  | Registry URL                                                                                                 | Note                                                                                                                                    |
|-----------|--------------------------------------------------------------------------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------|
| `app.ci`  | [registry.ci.openshift.org](registry.ci.openshift.org)                                                       | the authoritative, central CI registry                                                                                                  |
| `api.ci`  | [registry.svc.ci.openshift.org](registry.svc.ci.openshift.org)                                               | the previous central registry; contains identical images to the authoritative registry                                                  |
| `build01` | [registry.build01.ci.openshift.org](registry.build01.ci.openshift.org)                                       | contains up-to-date image copies from the authoritative registry for jobs that run on this build farm only                              |
| `build02` | [registry.build02.ci.openshift.org](registry.build02.ci.openshift.org)                                       | contains up-to-date image copies from the authoritative registry for jobs that run on this build farm only                              |
| `vsphere` | [registry.apps.build01-us-west-2.vmc.ci.openshift.org](registry.apps.build01-us-west-2.vmc.ci.openshift.org) | contains up-to-date image copies from the authoritative registry for jobs that run on this build farm only; only open to vsphere admins |

# Container Image Data Flows

Today, three major data flows exist for container images in the OpenShift CI ecosystem. First, when a job executes on
one of the build farm clusters, container images that need to be [built](/docs/architecture/ci-operator/#building-container-images)
for the execution will exist only on that cluster. Second, when changes are merged to repositories under test, updated
images are built on a build farm and [promoted](/docs/architecture/ci-operator/#publishing-container-images) to the
central, authoritative registry. Users should always pull from this registry for any images they interact with. Third,
when an image changes on the authoritative registry, that change is propagated to all build farm clusters so that the
copies they hold are up-to-date and jobs that run there run with the correct container image versions.

**Note:** Today, we are in the process of migrating between authoritative image registries. The current authoritative 
registry is [registry.svc.ci.openshift.org](registry.svc.ci.openshift.org). The previous authoritative registry,
[registry.svc.ci.openshift.org](registry.svc.ci.openshift.org), contains an up-to-date version of all images as well,
and will continue to do so for the time being while users migrate to using the new registry.

# Common Questions

## How do I log in to pull images that require authentication?

All registries are the internal OpenShift image registry for the cluster they reside on, so authenticating to the registry
requires authentication to the cluster that hosts it. Once logged in to the OpenShift cluster, the `oc` CLI can be used to
authenticate to the registry in question. For example, for the [registry.build01.ci.openshift.org](registry.build01.ci.openshift.org)
registry, the cluster is `build01`. Using the [the list of clusters](/docs/getting-started/useful-links/#clusters),
the console URL for this cluster is found to be [console.build01.ci.openshift.org](console.build01.ci.openshift.org).
After logging in to this cluster using the console and copying the log-in command to authenticate your local `oc` CLI,
you can run `oc registry login` to authenticate to the registry.

```bash
$ oc registry login
info: Using registry public hostname registry.build01.ci.openshift.org
Saved credentials for registry.build01.ci.openshift.org

$ cat ~/.docker/config.json | jq '.auths["registry.build01.ci.openshift.org"]'
{
  "auth": "token"
}

```

**Note:** Today, authentication to the OpenShift cluster is delegated to GitHub and requires that you are a member of the
`OpenShift` organization.

## How do I get a token for programmatic access to the central CI registry?

If you're developing an integration with the central CI registry, an OpenShift `ServiceAccount` should be used. Write a
pull request to the [`openshift/release`](https://github.com/openshift/release) repository that adds a new directory under
the `release/clusters/app.ci/registry-access` directory. In this directory, provide an `OWNERS` file to allow your team
to make changes to your manifests and an `admin_manifest.yaml` file that creates your `ServiceAccount` and associated
RBAC:

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
# the Group of people who should be able to manage this ServiceAccount
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
# this grants the right to read the ServiceAccount's credentials
kind: Role
apiVersion: rbac.authorization.k8s.io/v1
metadata:
  name: secret-reader
  namespace: my-project
rules:
  - apiGroups:
      - ""
    resources:
      - serviceaccounts
      - secrets
    verbs:
      - get
      - list
---
# this allows the group of people admin access to the Namespace
kind: RoleBinding
apiVersion: rbac.authorization.k8s.io/v1
metadata:
  name: my-project-admins-binding
  namespace: my-project
roleRef:
  kind: Role
  apiGroup: rbac.authorization.k8s.io
  name: secret-reader
  namespace: my-project
subjects:
  - kind: Group
    apiGroup: rbac.authorization.k8s.io
    name: my-project-admins
    namespace: my-project
```

After the pull request is merged, you will be able to extract the pull token for your `ServiceAccount` using the `oc` CLI:

```bash
$ token="$( oc --namespace my-project serviceaccounts get-token image-puller )"
$ auth="$( base64 --wrap=0 <<<"serviceaccount:${token}" )"
$ cat<<EOF
{
  "registry.ci.openshift.org": {
    "username": "serviceaccount",
    "password": "${token}",
    "email": "serviceaccount@example.org",
    "auth": "${auth}"
  }
}
EOF
```

This data can be added to a `.docker/config` authentication file to provide programmatic access with the `ServiceAccount`
credentials.

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

**Warning:** Only `vSphere` system administrators can access the images on [registry.apps.build01-us-west-2.vmc.ci.openshift.org](registry.apps.build01-us-west-2.vmc.ci.openshift.org).

## How do I access the latest published images for my component?

If the `ci-operator` configuration for your component configures image [`promotion`](/docs/architecture/ci-operator/#publishing-container-images),
output container images will be published to the central CI registry when changes are merged to your repository. Two main
configurations are possible for promotion: configuring an `ImageStream` name and namespace or a namespace and a target tag.

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