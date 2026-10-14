---
title: "Interacting With CI Image Registries"
description: How to interact with the CI image registries, set up service account access and interact with images for a specific job.
datatables: true
custom_js:
  - registries
---

# Summary of Available Registries
All the CI images used by OpenShift CI are stored in the repository in quay.io: `quay.io/openshift/ci`, called _QCI_ for short.
It is the authoritative CI registry and the source of truth for all CI images.
Any image stream tag `<namespace>/<name>:<tag>` e.g., referenced in ci-operator's configuration is saved as `quay.io/openshift/ci:<namespace>_<name>_<tag>`. Its namespace, name, and tag are connected with "_" to form the tag in QCI as the images in different namespaces are converged into a monorepo on `quay.io`.

Besides QCI, the OpenShift CI system runs on OpenShift clusters. Each cluster hosts its own image registry. Therefore, a number of
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
The registry `registry.svc.ci.openshift.org` has been decommissioned. If there is any reference to its image, e.g., in your Dockerfile,
please use the corresponding image in QCI instead.
{{< /alert >}}

# Container Image Data Flows

Today, two major data flows exist for container images in the OpenShift CI ecosystem. First, when a job executes on
one of the build farm clusters, container images that need to be [built](/architecture/ci-operator/#building-container-images)
for the execution will exist only on that cluster. Second, when changes are merged to repositories under test, updated
images are built on a build farm and [promoted](/architecture/ci-operator/#publishing-container-images) to QCI. Users should always pull any images they interact with from this registry. When an image changes on QCI, that change is propagated to all build farm clusters as the images there are imported from QCI when the job is executed and thus the
copies they hold are up-to-date and jobs that run there run with the correct container image versions.

{{< alert title="Info" color="info" >}}
Images are promoted to QCI. Payload namespaces keep `app.ci` ImageStream tags as source-refs for Release Controllers and related automation. See [How promotion works](#how-promotion-works).

ART still pushes builder images for CI to `app.ci` and they are [mirrored to QCI](https://github.com/openshift/release/blob/main/core-services/image-mirroring/_config.yaml).

**Rule of thumb for humans and integrations:** do not hardcode `registry.ci.openshift.org` for CI-published images. Pull from QCI via `quay-proxy.ci.openshift.org` instead.
{{< /alert >}}

# How promotion works

Quay holds the image bits for CI (`quay.io/openshift/ci`). `app.ci` is not a second full copy of every promoted image.

## For component owners

| Task | Details |
|---|---|
| Declare `promotion:` in `ci-operator` config | Same YAML shape (`namespace` / `name` / `tag`). No special QCI fields. |
| Pull published images via quay-proxy | `quay-proxy.ci.openshift.org/openshift/ci:<namespace>_<name>_<tag>` after logging in with an `app.ci` token (see below). |
| Reference ImageStream-style names in config | `base_images`, `from:`, Dockerfile `FROM registry.ci…` entries resolve through CI to the QCI float. |
| Debug a live job’s builds | Ephemeral build-farm registries (`registry.buildNN…`) for `ci-op-*` namespaces. |

## Where images go

Think of three buckets of images:

1. **Payload / release-facing images** (namespaces such as `ocp`, `ocp-priv`, and OKD’s `origin`)  
   Promotion pushes the image **to QCI**. On `app.ci`, ImageStream tags remain so Release Controllers and related automation can keep working — but those tags are **references** (source-refs) to the QCI digest, not a second full blob store of every layer on `registry.ci.openshift.org`.

2. **Everything else (non-payload CI images)**  
   Promotion is **QCI-only**. No new ImageStream tags / blob copies are created on `app.ci` for those images. Pull via quay-proxy / QCI instead of `registry.ci.openshift.org/<your-ns>/…`.

3. **Emergency backfill (platform only)**  
   If something must temporarily reappear on `app.ci`, Test Platform can mirror **from QCI only** onto `registry.ci.openshift.org` via the `qciToAppCIImages` list in [image-mirroring `_config.yaml`](https://github.com/openshift/release/blob/main/core-services/image-mirroring/_config.yaml). Arbitrary registries are not allowed as sources for that reverse path.

```text
  Your merge
      │
      ▼
  images job builds on a build farm
      │
      ▼
  promote ──► quay.io/openshift/ci   ◄── authoritative bits (QCI)
      │
      ├── payload ns ──► app.ci ImageStream tag (points at QCI digest)
      └── other ns   ──► QCI float only (no new app.ci copy)
      │
      ▼
  You / jobs pull via quay-proxy.ci.openshift.org
```

## How user interaction looks (walkthrough)

### Component owner who promotes images

1. Merge a PR that builds and promotes (or wait for the periodic / postsubmit `images` job).  
2. Wait for the promote step to finish successfully on QCI (failures show up in the Prow job log).  
3. Pull what you need:

```bash
podman login -u=$(oc --context app.ci whoami) -p=$(oc --context app.ci whoami -t) quay-proxy.ci.openshift.org --authfile /tmp/t.c
podman pull quay-proxy.ci.openshift.org/openshift/ci:<namespace>_<name>_<tag> --authfile /tmp/t.c
```

4. **Do not** assume a fresh `oc get istag -n <ns>` on `app.ci` exists for non-payload images. For payload namespaces, the ImageStream tag may still exist, but the storage behind it is QCI.

### Someone writing a Dockerfile or `base_images` entry

Keep using the familiar names (`ocp/4.x:…`, `ci/…`, builder tags, and so on). CI rewrites / imports those to the QCI float at job time. Prefer documenting quay-proxy pullspecs in READMEs and runbooks aimed at humans.

### Someone integrating automation (bots, mirrors, dashboards)

- **Read path:** authenticate to quay-proxy with an `app.ci` ServiceAccount (same RBAC model as elsewhere on `app.ci`).  
- **Write path to QCI:** reserved for CI promotion and Test Platform tooling — not for ad-hoc user pushes.  
- **Write path to `registry.ci.openshift.org` for “put this QCI image back on app.ci”:** only through the controlled reverse-mirror config, not by pointing promotion at an arbitrary external registry.

### Release / payload consumers

Release Controllers and similar consumers use `app.ci` ImageStreams in payload namespaces. Those streams track QCI rather than hosting a duplicate blob tree for every tag.

Related deeper background: [Images in CI](/internals/images-in-ci/) (platform internals).

# Common Questions

## How do I gain access to QCI?
The access control to the images in QCI is delegated to the [RBACs](/how-tos/rbac/) on `app.ci`.
This is done to reduce the effort of managing users in different places.
The access to QCI has to be through a reverse proxy serving `quay-proxy.ci.openshift.org` and only pull permission is granted.

### Human Users
Create a pull request to include a Rover group that the user belongs to as a subject in the rolebinding `qci-image-puller` in [the release repo](https://github.com/openshift/release/blob/main/clusters/app.ci/assets/admin_qci-image-puller_rbac.yaml). 
```yaml
- kind: Group
  name: <rover-group>
  apiGroup: rbac.authorization.k8s.io
```
The change will be applied automatically to the `app.ci` cluster after merging. Note that the group has to be on `app.ci` cluster, i.e., `app.ci` is included `clusters` if it
is specified in [this config file](https://github.com/openshift/release/blob/main/core-services/sync-rover-groups/_config.yaml).
```yaml
  <rover-group>:
    clusters:
    - app.ci
```
Provided that `oc` has logged in to the [app.ci](https://console-openshift-console.apps.ci.l2s4.p1.openshiftapps.com/) cluster and context set as app.ci, the user may pull images from QCI such as `quay-proxy.ci.openshift.org/openshift/ci:ci_ci-operator_latest`
by the following commands:

```console
$ podman login -u=$(oc --context app.ci whoami) -p=$(oc --context app.ci whoami -t) quay-proxy.ci.openshift.org --authfile /tmp/t.c
$ podman pull quay-proxy.ci.openshift.org/openshift/ci:ci_ci-operator_latest --authfile /tmp/t.c --platform linux/amd64
```
Note: if you do not wish to set/rename the context to `app.ci`, you will need to remove `--context app.ci` from above command.

### Token For Programmatic Access to QCI
If you're developing an integration with QCI, an OpenShift `ServiceAccount` on `app.ci` should be used. Write a
pull request to the [`openshift/release`](https://github.com/openshift/release) repository that adds a new directory under
the `release/clusters/app.ci/registry-access` directory. In this directory, provide an `OWNERS` file to allow your team
to make changes to your manifests and an `admin_manifest.yaml` file that creates your `ServiceAccount` and associated
[RBAC](/how-tos/rbac/):

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

After the pull request is merged, the manifests will be automatically applied to `app.ci`.
Members of group `my-project-admins` can then [create a bound token](https://docs.redhat.com/en/documentation/openshift_container_platform/4.13/html/authentication_and_authorization/bound-service-account-tokens#bound-sa-tokens-configuring-externally_bound-service-account-tokens) for the ServiceAccount and log in to quay-proxy.

Prefer short-lived tokens. Avoid long-lived ServiceAccount secrets when possible ([Kubernetes guidance](https://kubernetes.io/docs/reference/access-authn-authz/service-accounts-admin/#create-token)). Admins own token rotation if a token leaks.

```bash
# mint a short-lived token for the ServiceAccount on app.ci
TOKEN=$(oc --context app.ci -n my-project create token image-puller --duration=24h)

# IMPORTANT: do NOT use -u="$(oc whoami)" for a ServiceAccount.
# oc whoami returns system:serviceaccount:<ns>:<name>, which contains ":" and breaks
# HTTP Basic Auth (the proxy sees username "system" and a mangled password).
# Use any colon-free username; the password must be the ServiceAccount token.
podman login -u image-puller -p "$TOKEN" quay-proxy.ci.openshift.org --authfile /tmp/qci.json
podman pull quay-proxy.ci.openshift.org/openshift/ci:ci_ci-operator_latest --authfile /tmp/qci.json
```

`quay-proxy` validates that `-p` is a valid `app.ci` token. For ServiceAccounts it does not require the `-u` value to match `system:serviceaccount:…`.


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
an image from a test namespace, you must be logged in to the registry, e.g., by `oc registry login` and be the author of the pull request. Pull the
image with any normal container engine:

```bash
$ podman pull registry.build02.ci.openshift.org/ci-op-2c2tvgti/pipeline:src
```

**Warning:** Only `vSphere` system administrators can access the images on [registry.apps.build02.vmc.ci.openshift.org](https://registry.apps.build02.vmc.ci.openshift.org).

## How do I access the latest published images for my component?

If the `ci-operator` configuration for your component configures image [`promotion`](/architecture/ci-operator/#publishing-container-images),
output container images will be published to QCI when changes are merged to your repository. Two main
configurations are possible for promotion: configuring an `ImageStream` name and namespace or a namespace and a target tag.

### Publication of New Tags

A configuration that specifies the `ImageStream` name looks like the following and results in new tags on that stream
for each image that is promoted:

```yaml
images:
  items:
  - dockerfile_path: images/my-component
    from: base
    to: my-component
promotion:
  to:
  - name: "4.7"
    namespace: ocp
```

The `my-component` image can be pulled from the authoritative registry with:

```bash
$ podman pull quay-proxy.ci.openshift.org/openshift/ci:ocp_4.7_my-component
```

### Publication of New Streams

A configuration that specifies the `ImageStream` tag looks like the following and results in new streams in the namespace
for each image that is promoted, with the named tag in each stream:

```yaml
images:
  items:
  - dockerfile_path: images/my-component
    from: base
    to: my-component
promotion:
  to:
  - namespace: my-organization
    tag: latest
```

The `my-component` image can be pulled from the authoritative registry with:

```bash
$ podman pull quay-proxy.ci.openshift.org/openshift/ci:my-organization_my-component_latest
```

## Why I am getting an authentication error?

An authentication error may occur both in the case where you have not yet logged in to a registry and in the case where
you logged in to the registry in the past.

### I have not yet logged in to the registry.

Please follow [the directions](#how-do-i-gain-access-to-qci) to log in to the registry.

### I have logged in to the registry in the past.

An unfortunate side-effect of the architecture for container image registry authentication results in authentication
errors when your authentication token expired, even if the image you are attempting to pull requires no authentication.
Authentication tokens expire once a month. All you'll need to do is follow [the directions](#how-do-i-gain-access-to-qci)
to log in to the registry again.

{{< alert title="Warning" color="warning" >}}
Note that `podman logout` will not consider or modify `~/.docker/config.json`
(the default target of `oc registry login`) even though `podman pull` uses that
file for authentication.  Some versions will print an alert message, others will
not:

```console
$ cat ~/.docker/config.json
{"auths":{"quay-proxy.ci.openshift.org":{"auth": "…"}}}
$ podman --version
podman version 4.1.1
$ podman logout quay-proxy.ci.openshift.org
Not logged into quay-proxy.ci.openshift.org with current tool. Existing credentials were established via docker login. Please use docker logout instead.
```

To clear an expired token in order to be able to pull public images again, use
either `docker logout` or indicate the target file via `--authfile` or
`$REGISTRY_AUTH_FILE`:

```console
$ podman logout --authfile ~/.docker/config.json quay-proxy.ci.openshift.org
Removed login credentials for quay-proxy.ci.openshift.org
```
{{< /alert >}}
