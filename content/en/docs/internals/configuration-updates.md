---
title: "Configuration Updates"
description: The process by which changes to files in the `openshift/release` repository are propagated to the CI clusters.
---

Various long-running services deployed in the CI clusters operate on the
configuration files in the `openshift/release` repository.  This document
describes how that information is made available to those services and updated
when changes are made.  This information can be used as a guide for writing
services that consume those files.  It also describes the problems with previous
strategies and the solutions adopted.

## `ConfigMap` mounts

The primary mechanism used to give services access to the contents of the
repository are Kubernetes [volumes](https://kubernetes.io/docs/concepts/storage/volumes/),
specifically [`ConfigMap` volume mounts](https://kubernetes.io/docs/concepts/configuration/configmap/).
The update process for these mounts involves several Kubernetes and `test-infra`
components and is divided in the following steps:

0. A pull request is merged in `openshift/release` in Github.
1. The [`updateconfig`]({{< relref "#updateconfig" >}}) Prow plugin is triggered
   by the merge event delivered via a web hook.  It updates the `ConfigMap`s in
   the cluster with the new contents of the files according to its
   configuration.
2. The [`kubelet`]({{< relref "#kubelet" >}}) in the node where the service
   instances are deployed sees the `ConfigMap`s have been updated and recomputes
   the contents of the mount directory.
3. The [`AtomicWriter`]({{< relref "#atomicwriter" >}}) component of the
   `kubelet` updates the contents of the directory to match the new contents of
   the mount.
4. The service somehow (e.g. using the [`test-infra` configuration agent
   package](https://github.com/kubernetes-sigs/prow/blob/main/prow/config/agent.go))
   watches the mount directory and responds to those changes.

### `updateconfig`

This [plugin](https://github.com/kubernetes-sigs/prow/tree/main/prow/plugins/updateconfig)
is configured by files under the Prow configuration directory,
[`core-services/prow/02_config`](https://github.com/openshift/release/tree/master/core-services/prow/02_config).
The [`openshift/release/_pluginconfig.yaml`](https://github.com/openshift/release/blob/master/core-services/prow/02_config/openshift/release/_pluginconfig.yaml)
file enables it for the repository:

{{< highlight yaml >}}
# …
plugins:
  openshift/release:
    plugins:
    - config-updater
    - approve
{{< / highlight >}}

while [`_plugins.yaml`](https://github.com/openshift/release/blob/master/core-services/prow/02_config/_plugins.yaml)
configures it via the top-level `config_updater` key.  It is configured to
populate several `ConfigMap`s in the clusters from the contents of the
repository:

{{< highlight yaml >}}
# …
config_updater:
  # …
  maps:
    # …
    ci-operator/config/**/*master*.yaml:
      clusters:
        app.ci:
        - ci
      gzip: true
      name: ci-operator-master-configs
    # …
    ci-operator/step-registry/**/*:
      clusters:
        app.ci:
        - ci
      gzip: true
      name: step-registry
    # …
{{< / highlight >}}

The [process](https://github.com/kubernetes/test-infra/blob/e3a85b0fae71a5d47b2b9c6dafdcfa38384c19ca/prow/plugins/updateconfig/updateconfig.go#L295-L356)
by which `ConfigMap`s in the cluster are reconciled with the PR changes is:

0. calculate the list of changes made by the PR
1. determine whether changes were made to files listed in the configuration
2. for each `ConfigMap` whose input files were changed
    0. fetch the existing content from the cluster, if it already exists
    1. merge the content of the changed files with the existing one
    2. update the `ConfigMap` in the cluster

### `config-bootstrapper`

A second process, the [`openshift-release-master-config-bootstrapper`](https://prow.ci.openshift.org/job-history/gs/origin-ci-test/logs/openshift-release-master-config-bootstrapper)
periodic Prow job, also performs this procedure every hour using the
[`config-bootstrapper`](https://github.com/kubernetes-sigs/prow/tree/main/prow/cmd/config-bootstrapper)
program, which shares most of its code with the plugin.  The job is not
triggered by a PR, so all configured files are loaded as if the repository had
just been created (hence its name).  It is meant to continually ensure the
content in `openshift/release` can be used to recreate the clusters from
nothing.

Note that there are race conditions inherent to how the `updateconfig` plugin
works and interacts with other executions of itself and with the periodic job.
However, they haven't been observed in production so far, in part because of how
Tide generally operates.  Details are documented in
[this](https://issues.redhat.com/browse/DPTP-2531) Jira issue and its associated
links.

### `kubelet`

The [`kubelet`](https://kubernetes.io/docs/concepts/overview/components/#kubelet)
is the Kubernetes process present in each physical node responsible for
creating/monitoring/managing containers according to the `Pod` specifications in
the cluster.  It is the intermediary between the Kubernetes core and the
container runtime in each node.

Its general mode of operation is to monitor `Pod` resources in the cluster (and
its own static `Pod`s) and constantly reconcile the containers in the node to
reflect the specification in `etcd` received from the API server.  One aspect of
this responsibility is to configure volume mounts according to the configuration
in the specification and the latest contents of its inputs.

Several types of volumes are available to be mounted in a container.  Volume
types are implemented as _plugins_ in Kubernetes and the `kubelet`:

- https://github.com/kubernetes/kubernetes/blob/v1.23.4/pkg/volume/plugins.go#L141
- https://github.com/kubernetes/kubernetes/blob/v1.23.4/pkg/volume/volume.go#L30
- https://github.com/kubernetes/kubernetes/blob/v1.23.4/pkg/volume/configmap/configmap.go#L44

Beyond the initial volume mount setup, the `kubelet` also keeps dynamic volume
mounts [updated](https://kubernetes.io/docs/concepts/configuration/configmap/#mounted-configmaps-are-updated-automatically).
These include `ConfigMap`, `Secret`, projected, and other types of mounts, which
are all implemented similarly.  These updates happen at a predefined frequency
specified in the [`kubelet` configuration](https://kubernetes.io/docs/reference/config-api/kubelet-config.v1beta1/#kubelet-config-k8s-io-v1beta1-KubeletConfiguration).
The default, used in all of our clusters, is `1m`.

{{< alert title="Note" color="info" >}}
The `kubelet` configuration for cluster nodes can be displayed with a script
such as:

{{< highlight bash >}}
$ oc --context app.ci get machineconfig 01-worker-kubelet -o json \
    | jq --raw-output '.spec.config.storage.files[]|select(.path == "/etc/kubernetes/kubelet.conf").contents.source' \
    | cut -d , -f 2- \
    | python -c 'import sys, urllib.parse; sys.stdout.write(urllib.parse.unquote(sys.stdin.read()))' \
    | head -n 3
kind: KubeletConfiguration
apiVersion: kubelet.config.k8s.io/v1beta1
authentication:
{{< / highlight >}}
{{< / alert >}}

That is, at regular intervals the `kubelet` looks at its view of the cluster
resources and decides whether volume mounts reflect the desired state or have to
be updated.  It uses its own local cache to make this decision, whose update is
also configurable but always happens asynchronously with respect to this
process.

### `AtomicWriter`

Eventually, all plugins which expose volumes as a directory
[make use](https://github.com/kubernetes/kubernetes/blob/v1.23.4/pkg/volume/configmap/configmap.go#L247-L257)
of the `AtomicWriter` component, which propagates the changes in an atomic
manner (for some definition of "atomic") to the container's file system.  The
plugins fetch the information required and assemble it in the form of a
directory, passing it to the writer for the final file system update.

The update algorithm is described in detail in the [source code](
https://github.com/kubernetes/kubernetes/blob/v1.23.4/pkg/volume/util/atomic_writer.go#L87-L123):

{{< highlight go >}}
//  1.  The payload is validated; if the payload is invalid, the function returns
//  2.  The current timestamped directory is detected by reading the data directory
//      symlink
//  3.  The old version of the volume is walked to determine whether any
//      portion of the payload was deleted and is still present on disk.
//  4.  The data in the current timestamped directory is compared to the projected
//      data to determine if an update is required.
//  5.  A new timestamped dir is created
//  6.  The payload is written to the new timestamped directory
//  7.  A symlink to the new timestamped directory ..data_tmp is created that will
//      become the new data directory
//  8.  The new data directory symlink is renamed to the data directory; rename is atomic
//  9.  Symlinks and directory for new user-visible files are created (if needed).
//
//      For example, consider the files:
//        <target-dir>/podName
//        <target-dir>/user/labels
//        <target-dir>/k8s/annotations
//
//      The user visible files are symbolic links into the internal data directory:
//        <target-dir>/podName         -> ..data/podName
//        <target-dir>/usr -> ..data/usr
//        <target-dir>/k8s -> ..data/k8s
//
//      The data directory itself is a link to a timestamped directory with
//      the real data:
//        <target-dir>/..data          -> ..2016_02_01_15_04_05.12345678/
// 10.  Old paths are removed from the user-visible portion of the target directory
// 11.  The previous timestamped directory is removed, if it exists
{{< / highlight >}}

Processes interested in updates to the volume mount can watch the `..data`
symbolic link to be notified when the directory is updated.  The update to that
file is done using the [`rename(2)`](https://www.man7.org/linux/man-pages/man2/rename.2.html)
system call, which guarantees the atomicity of the update process (this is what
is referred to as "atomic" in the documentation).

One implicit assumption in this scheme is that the application responding to
updates will be able to process the contents of the new directory in time.  If a
`ConfigMap` is updated in rapid succession, it may happen that the mount is
updated while the old contents are still being used (this may happen even for
well-behaved programs, e.g. if there is sufficient load in the node where it is
being executed).

There is no provision to guarantee that the contents of the mount survive long
enough for an application to process them in time before a new update removes
the files.  Even worse, this grace period during which the process can process
the mount is a configurable parameter of the `kubelet`, as described previously,
so it cannot in general be determined.  It is not difficult (and has happened in
the past) to make innocent changes to the code which loads and processes these
configuration files and inadvertently increase the runtime by an order of
magnitude.  It may even happen gradually (as has also happened), without notice,
as the size of the input grows with the number of repositories supported.

{{< alert title="Note" color="info" >}}
The problem of concurrent updates and resource reclamation in particular is a
known "hard" computer science problem, and certainly requires two cooperating
processes (not unlike advisory file locking in Unix systems).  See this
[article on Wikipedia](https://en.wikipedia.org/wiki/ABA_problem#Deferred_reclamation)
for a general discussion and this
[LWN article](https://lwn.net/Articles/262464/#Wait%20For%20Pre-Existing%20RCU%20Readers%20to%20Complete)
for an example of how this type of problem can be solved.
{{< / alert >}}

### Projected volumes

An additional problem is present when multiple `ConfigMap`s are assembled into a
single mount, as is done for [`ci-operator-configresolver`]({{< relref "configresolver" >}}),
stemming from the fact that Kubernetes in general operates under an _eventually
consistent_ concurrency model.

This is because there is no guarantee of the order in which the updates to each
of the constituents of the mount will be perceived.  The `kubelet` update loop,
dictated by its configured update frequency, establishes a point in time where
the external state is collected and propagated to the volume mounts.  It may
decide to do so *between* updates to the various objects used to assemble the
mount.  There is furthermore no guarantee that updates will be seen in the
same order they were originally made in.

## `git-sync`

More recently, [`git-sync`](https://github.com/kubernetes/git-sync.git) has been
used for configuration updates.  It is a collocated container inside the main
service `Pod` which maintains a local `git` repository clone synchronized with a
remote, and its mode of operation is very similar to the [`kubelet`]({{< ref
"#kubelet" >}})/[`AtomicWriter`]({{< ref "#atomicwriter" >}}) process described
above.  However, it has significant advantages over `ConfigMap`-based updates:

- The entirety of the local contents of the repository are updated atomically,
  eliminating the problems caused by trying to aggregate data from multiple
  `ConfigMap`s.
- It bypasses the size limitation of `ConfigMap`s, eliminating the need to fetch
  data from multiple sources in the first place.

File system updates are done using a variation of the [`AtomicWriter`]({{< ref
"#atomicwriter" >}}) protocol:

0. The remote history for the selected _refs_ is checked for updates using `git
   ls-remote`.
1. New revisions are pulled using `git fetch`.
2. A work tree directory based on the latest revision is created using `git
   worktree add`.
3. The primary path (a symlink) is replaced using the same process used by
   `AtomicWriter`: a temporary link is created and moved into place atomically
   using `rename(2)`.  Services can monitor changes to this link in the same
   manner.
4. The previous work tree is removed.

The interval between each update cycle is controlled by the `--wait` parameter,
which is analogous to the `kubelet`'s `syncFrequency` configuration.  Because of
this, it suffers from the same directory reclamation problem.
