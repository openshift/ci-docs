---
title: "Interacting With CI Job Currently Running and Tests Binary"
date: 2020-12-15T16:08:01-04:00
draft: false
description: How to interact with the CI cluster to follow a job currently running your Work In Progress (WIP) Pull Request (PR).
---

## Overview

The OpenShift CI system runs on OpenShift clusters and many jobs that run in OpenShift repository PRs install
external test clusters installed with a release payload that is built with code changes from the PR. Test suites are then
run against the test clusters from a running pod within the CI cluster. It is possible to follow the logs of
the tests running in your PR and to even interact with the cluster that was launched with your proposed changes.
This is useful when debugging test failures or to diagnose and confirm behavior due to your changes. Once the PR
is no longer a WIP, you should no longer interact with the CI system as it is possible to alter test outcomes in this way.
In most cases it's more useful to run tests against a development cluster for which you have a kubeconfig from your local
system rather than hijacking the PR's running jobs. For this, follow the
[How to Run the Test Suites Outside of CI.](#how-to-run-the-test-suites-outside-of-ci)

**Note:** Throughout this document `CI cluster` refers to the central CI cluster, `test cluster` refers to the external OpenShift cluster
launched during a CI job _from_ the CI cluster, and `development cluster` is a cluster that is outside of the CI system.

## How and Where Do the Tests Run?

With each test and/or job, within the CI cluster a project is created. That project launches pods that administer the test
suites. For example, with a PR in the `openshift-apiserver` repository, several jobs are triggered. The initial tests
such as `ci/prow/images`, `ci/prow/unit`, and `ci/prow/verify` clone and validate your changes to build the
openshift-apiserver artifacts (`make build`, `make test`, for example) and also build the release payload updated with the PR modifications.
Once the images are built from the PR, the jobs that require a test cluster will start. These jobs, such as `e2e-aws`, `e2e-cmd`,
`e2e-*-upgrade` run the OpenShift installer extracted from the updated release payload in a pod running
in the CI cluster to launch a test cluster in the configured cloud (gcp, aws, azure, or other). It is in this way,
with each repository running OpenShift and Kubernetes conformance suites with every PR, that a change in any repository is ensured to be
compatible with the over 100 other repositories that make up OpenShift. With every merge in every repository, the base release
payload is updated so that the next PR in any repository starts with the latest merged change from any other repository. Merges
happen in small pools and undergo a final run of tests to ensure PRs merging simultaneously are also compatible.

## Access the Cluster/Project of the Running CI Job

**Note:** Authentication to the CI cluster is delegated to GitHub and requires that you are a member of the
`OpenShift` organization.

From GitHub, you can access the build logs from the `Details` link next to each job listed in the checkbox at the bottom of the PR description
page. This gives an overall picture of the test output, but you might want to follow each job and test more closely while it runs. It is 
especially useful to follow a PR through the CI system if it is updating a test workflow or adding a new test. In that case,
you can access the CI cluster console. From the job `Details`, grep for this line near the top of the `Build Logs` to locate the cluster/project
where your test is running:

```bash
2021/02/04 04:37:08 Using namespace https://console.build02.ci.openshift.org/k8s/cluster/projects/ci-op-mtn6xs34
```
As the PR author, you are the administrator of the project (`ci-op-mtn6xs34` in example above). You will therefore have access to
the link above. From the console, to login, choose `github`. Once in the console, you can follow the logs from the running pods _or_
you can grab the login command from the upper right `?` -> `Command Line Tools` -> `Copy Login Command`. Again, choose the `github` 
authentication, then `Display Token`. Copy in your terminal to access the CI cluster. Before running the login
command, you might run `unset KUBECONFIG` if you currently have an active development cluster & local kubeconfig, since this login command
will either update the currently set KUBECONFIG or write/update to ~/.kube/config.
The login command will look similar to this:

```bash
oc login --token=sha256~dMKQv... --server=https://api.build02.gcp.ci.openshift.org:6443
```

As the project administrator, you may give access to your project to other members of the GitHub OpenShift organization. Afer logging into the
project with `oc`, use this command to give other members access to the project running your PR:

```bash
$ oc adm policy add-role-to-user admin <github_user> -n ci-op-xxxxxxx
```

**Note:** Shortly after your job completes whether due to success or failure, the project as well as the test cluster launched from
this project will be torn down and terminated.

## Where Are the Logs?

From GitHub, you can access the build logs from the `Details` link next to each job listed in the checkbox at the bottom of the PR description
page. This gives an overall picture of the test output, but you might want to follow each job and test more closely while it runs. In that case,
from the CI cluster console accessed above, you have a choice between `Administrator` and `Developer` menu. Choose `Administrator` if it is not
already chosen. You can access the `pods` running the tests from `Workloads` -> `Pods` and then the `Logs` tab across the top. Pods
usually have multiple containers, and each container can be accessed from the dropdown menu above the logs terminal.
This is equivalent to running the following from your local terminal, if you are currently logged into the CI cluster:

```bash
$ oc project ci-op-xxxxxxx
$ oc get pods
$ oc logs -f <pod-name> -c <container-name>
```

## Access the Terminal of the Pod Running the Tests

From the console, you can access the running pod through the `Terminal` tab across the top of the selected pod.
(`Workloads` -> `Pods` -> `Terminal`). This will give you a shell from which you can check expected file locations,
configurations, volume mounts, etc. This is useful when setting up a new test workflow to get everything working.
This is roughly equivalent to the following from your local terminal, if you are currently logged into the CI cluster:

```bash
$ oc -n ci-op-xxxxxxx rsh <pod-name> -c <container-name>
```

## Access the External Cluster Launched With Your Changes
If you are debugging a job during which a test cluster was launched (`e2e-aws`, `e2e-*`), you might find it useful to access the test cluster.
After the installer pod has successfully completed (usually this is ~30 min after the job was triggered), an `e2e-*-test` pod will launch.
From the project accessed above, (`Home`->`Projects`) you can grab the `KUBECONFIG` for the test cluster and copy it to your local system,
to access the test cluster against which the extended test suites are running. Below is how to access the kubeconfig file from the installer pod.
Access the `Terminal` tab of the running test pod (`Workloads` -> `Pods` -> `Terminal`). Find the `kubeconfig` file in the `*-install-install` pod's
`/tmp/installer/auth` directory.
Or, from your local system, if currently logged into the CI cluster:

```bash
$ oc project ci-op-xxxxxxx
$ mkdir ci-cluster-auth
$ oc rsync e2e-*-install-install:/tmp/installer/auth/ test-ci-auth
```
The following files should be copied to your local system:

```bash
$ ls test-ci-auth
kubeadmin-password    kubeconfig
```

**Note:** The test pods are named descriptively, with keywords such as `e2e-*-install|test`. Use the pod names to infer where the install is happening
to find where the kubeconfig file is located.

Once copied to your local system, you can proceed to run `oc` commands against the test cluster by setting `KUBECONFIG` environment variable
or passing `--kubeconfig` to `oc`. Again, this is intended for WIP PRs only. The test cluster will be terminated whenever the job completes.
It is usually more productive to launch a development cluster using `cluster-bot` through `Slack` and manually run `openshift-tests` suites against
that, rather than through a PR job's cluster. For how to run `openshift-tests` binary and to find more information about the test suites, see
[How To Run the Test Suites Outside of CI.](#how-to-run-the-test-suites-outside-of-ci)

## How Do I Know What Tests Will Run?

It can be quite confusing to find the test command that is running in CI. Jobs are configured in
[the release repository](https://github.com/openshift/release).
The job definitions (yaml) are generated from the step-registry workflow and/or the ci-operator/config files.
For jobs that aren't configured with the ci-operator/step-registry, you can find test commands in
[release/ci-operator/config/openshift](https://github.com/openshift/release/tree/master/ci-operator/config).
For example, the `ci/prow/unit` test command for `openshift-apiserver` is
[make test-unit](https://github.com/openshift/release/blob/8ccb2b1c17387920b3de0180c52052c535603855/ci-operator/config/openshift/openshift-apiserver/openshift-openshift-apiserver-master.yaml#L60-#L62).

For jobs configured with the step-registry workflow, such as all the jobs that require test clusters, you can get more information with
the [ci step-registry viewer](https://steps.ci.openshift.org/). There you'll find detailed overviews of the workflows with a search toolbar for
locating specific jobs. The viewer provides links to the code in GitHub, or you can locate the OWNERS of the workflows if you have further questions.

## How To Run the Test Suites Outside of CI

While iterating upon a WIP PR, for those jobs that install and run tests against a test cluster, it's useful to run the `openshift-tests` binary
against a development cluster you have running rather than follow a PR job in the CI cluster.
You can run the `openshift-tests` binary against any development cluster for which you have a kubeconfig file.
`CoreOS Slack` offers a `cluster-bot` tool you can utilize to launch a cloud-based development cluster from one or more PRs.
For more information on what `cluster-bot` can do, find `cluster-bot` under `Apps` in
`CoreOS Slack` _or_ direct message cluster-bot `"help"` to list its functions. For example, to launch a development cluster in aws from a release
payload that includes a single openshift-apiserver PR (#400),

`direct message cluster-bot` in `Slack` the following:

```bash
launch openshift/openshift-apiserver#400 aws
```
or, to launch from release payload that includes multiple PRs:

```bash
launch openshift/openshift-apiserver#400,openshift/cluster-authentication-operator#501 aws
```

Upon successful install, you will receive login information with a downloadable `kubeconfig` for the development cluster.

If you are not modifying or adding tests to the openshift-tests binary and simply want to run a test suite or single test against a development cluster,
you can do the following:

```bash
$ podman pull registry.ci.openshift.org/ocp/4.7:tests --authfile ~/path-to-pull-secret
$ podman run -it --rm -v ~/path/to/local/auth/kubeconfig:/tmp/kubeconfig registry.ci.openshift.org/ocp/4.7:tests sh
# export KUBECONFIG=/tmp/kubeconfig
# openshift-tests run
```

`openshift-tests run` will list all the suites in the binary. You can find individual tests with something like:

```bash
$ openshift-tests run openshift/conformance --dry-run
```
You can run an individual test or subset with the following (remove the last portion to only list first):

```bash
$ openshift-tests run all --dry-run | grep -E "<REGEX>" | openshift-tests run -f -
```
If you _are_ adding a test or modifying a test suite, the test binary can be built from
[openshift/origin repository](https://github.com/openshift/origin) and all of the `e2e` individual tests are found
in [origin/test/extended](https://github.com/openshift/origin/tree/master/test/extended). First, clone the origin repository with:

```bash
$ git clone git@github.com:openshift/origin
$ cd origin
$ make
```

Then from your local system and origin directory:

```bash
$ export KUBECONFIG=~/kubeconfig
(add openshift-tests to PATH or can run ./openshift-tests)
$ openshift-tests run
```

See the [openshift-tests README](https://github.com/openshift/origin/blob/master/test/extended/README.md) for more information.
