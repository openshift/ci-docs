---
title: "Interacting With Running CI Jobs"
description: How to interact with jobs currently running on the CI cluster for your pull requests.
---

## Overview

When tests are executed for proposed changes to a repository in a PR, a number of OpenShift clusters may be involved.
End-to-end tests for a component of OpenShift Container Platform or any operator deployed on OpenShift require a running
OCP cluster to host them. Colloquially, these are known as _ephemeral test clusters_ as they are created to host the test
and torn down once it's over. Furthermore, in OpenShift CI, all test workloads themselves run as `Pods` on a fleet of
long-running OpenShift clusters known as _build farm clusters_. Developers may also launch short-lived _development
clusters_ that incorporate changes from their pull requests but that run outside of CI.

For most end-to-end tests, the code that manages the lifecycle of the ephemeral test cluster and the code that orchestrates
the test suite run on the build farm cluster. It is possible to follow the logs of test `Pods` in the build farm clusters
and to even interact with the ephemeral test cluster that was launched for a pull request. When a repository builds some
component of OpenShift Container Platform itself, the ephemeral test cluster runs a version of OCP that incorporates the
changes to that component in the PR for which the test is running. Interacting with the test logs or ephemeral test cluster
itself is useful when debugging test failures or to diagnosing and confirming OCP behavior due to your changes.

{{< alert title="Warning" color="warning" >}}
Once your pull request is no longer a work in progress, you should no longer interact with the CI system as it is possible
to alter test outcomes in this way. In most cases it's more useful to run tests against a development cluster for which
you have a `$KUBECONFIG` from your local system rather than hijacking the PR's running jobs. For this, follow the
[directions](#how-to-run-the-test-suites-outside-of-ci) on how to run the test suites outside of CI.
{{< /alert >}}

## How and Where Do the Tests Run?

For each set of unique inputs (like the commits being tested, the version of the tests being run, and the versions of
dependencies) a unique `Namespace` in the build farm clusters is created that has a name like `ci-op-<hash>`. In this
project, `ci-operator` launches `Pods` that administer the test suites. For example, with a pull request in the
`openshift-apiserver` repository, several jobs are triggered. The initial tests such as `ci/prow/images`, `ci/prow/unit`,
and `ci/prow/verify` clone and validate your changes to build the `openshift-apiserver` artifacts (running `make build`,
`make test`, for example) and also build an ephemeral release payload that merges the latest versions of other OCP images
with those built from this pull request. For more details, see the
[`ci-operator` documentation](/docs/architecture/ci-operator#describing-inclusion-in-an-openshift-release).

Once the images are built, jobs that require a test cluster will start. These jobs, such as `e2e-aws`, `e2e-cmd`,
`e2e-*-upgrade` run the OpenShift installer extracted from the updated release payload to launch an ephemeral test cluster
in the configured cloud (GCP, AWS, Azure, or other). All repositories that publish components of OCP will run the same
central end-to-end conformance suites for OpenShift and Kubernetes. With this testing strategy, a change in any repository
making up OpenShift is ensured to be compatible with the over 100 other repositories that make up OpenShift. With every
merge in every repository, the integration streams are updated to contain the latest version of each component image.
Merges for every repository happen in small pools and undergo a final run of tests to ensure pull requests merging
simultaneously are also compatible.

## Access the Namespace on Cluster/Project of the Running CI Job

It is possible to authenticate to CI build farms with Red Hat Single-Sign-On:
The corresponding Red Hat kerberos ID to the author of a pull request
is permitted to accessing the `Namespace` that run jobs.

{{< alert title="Info" color="info" >}}
To access the `Namespace`, it is required that *GITHUB* at *PROFESSIONAL SOCIAL MEDIA* is set up at Rover People.
It takes 24 hours to synchronize the modification at Rover People to the build farms.
{{< /alert >}}

From a pull request page on GitHub, you can access the build logs from the `Details` link next to each job listed in the
checkbox at the bottom of the PR description page. This gives an overall picture of the test output, but you might want
to follow each job and test more closely while it runs. It is especially useful to follow a PR through the CI system if
it is updating a test workflow or adding a new test. In that case, you can access the CI cluster console. From the job
`Details`, grep for this line near the top of the `Build Logs` to locate the `Namespace` on the build farm cluster where
your test is running:

```bash
2021/02/04 04:37:08 Using namespace https://console.build02.ci.openshift.org/k8s/cluster/projects/ci-op-mtn6xs34
```

As the pull request author, you are the administrator of the project (`ci-op-mtn6xs34` in example above). You will
therefore have access to the link above. From the console, to login, choose `GitHub`. Once in the console, you can follow
the logs from the running pods _or_ you can grab the login command from the upper right `?` -> `Command Line Tools` ->
`Copy Login Command`. Again, choose the `GitHub` authentication, then `Display Token`. Copy in your terminal to access
the CI build farm cluster. Before running the login command, you might run `unset KUBECONFIG` if you currently have an
active development cluster and local `$KUBECONFIG`, since this login command will either update the currently set
`$KUBECONFIG` or write/update to `~/.kube/config`. The login command will look similar to this:

```bash
oc login --token=sha256~dMKQv... --server=https://api.build02.gcp.ci.openshift.org:6443
```

As the project administrator, you may give access to your project to other users.
After logging into the project with `oc`, use this command to give other members access to the project running your pull
request:

```bash
$ oc adm policy add-role-to-user admin <username> -n ci-op-xxxxxxx
```

{{< alert title="Info" color="info" >}}
An hour after your job completes whether due to success or failure, the project as well as the ephemeral test cluster
launched from this project will be torn down and terminated.
{{< /alert >}}

## Access Test Logs

From GitHub, you can access the build logs from the `Details` link next to each job listed in the checkbox at the bottom
of the pull request description page. This gives an overall picture of the test output, but you might want to follow each
job and test more closely while it runs. In that case, from the CI build farm cluster console accessed above, you have a
choice between `Administrator` and `Developer` menu. Choose `Administrator` if it is not already chosen. You can access
the `Pods` running the tests from `Workloads` -> `Pods` and then the `Logs` tab across the top. Pods usually have multiple
containers, and each container can be accessed from the dropdown menu above the logs terminal. This is equivalent to running
the following from your local terminal, if you are currently logged into the CI cluster:

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
If you are debugging a job during which a test cluster was launched (`e2e-aws`, `e2e-*`), you might find it useful to
access the ephemeral test cluster. After the installer pod has successfully completed (usually this is ~30 min after the
job was triggered), an `e2e-*-test` pod will launch. From the project accessed above, (`Home`->`Projects`) you can grab
the `KUBECONFIG` for the test cluster and copy it to your local system, to access the test cluster against which the
extended test suites are running. Below is how to access the `$KUBECONFIG` file from the installer pod. Access the
`Terminal` tab of the running test pod (`Workloads` -> `Pods` -> `Terminal`). Find the `kubeconfig` file in the
`*-install-install` pod's `/tmp/installer/auth` directory. Or, from your local system, if currently logged into the CI
cluster, create the following script as `extract-kubeconfig.sh`:

```bash
#!/bin/bash

set -o errexit
set -o nounset
set -o pipefail

function cleanup() {
	for job in $( jobs -p ); do
		kill -SIGTERM "${job}"
		wait "${job}"
	done
}

trap cleanup EXIT

namespace="${1:-}"
test="${2:-}"
if [[ -z "${namespace}" || -z "${test}" ]]; then
	echo "USAGE: $0 <namespace> <test>"
	exit 1
fi

echo "Scanning ${namespace} for the \$KUBECONFIG for the ${test} test..."
output="$( mktemp -d /tmp/kubeconfig.XXXXX )"
cat <<EOF >"${output}/extract.sh"
#!/bin/bash

if [[ "\${2}" != "${test}" ]]; then
	# we saw a change to an unrelated secret, nothing to do
	exit 0
fi

oc extract --namespace "${namespace}" "secret/${test}" --keys=kubeconfig --to="${output}" >/dev/null
if [[ -s "${output}/kubeconfig" ]]; then
	exit 0
fi
echo "No \\\$KUBECONFIG for the ${test} test has been created yet, waiting..." 1>&2
EOF
chmod +x "${output}/extract.sh"

if ! oc --namespace "${namespace}" get secrets >/dev/null; then
	echo "You do not have permissions to see secrets for this namespace. Did you enter the namespace correctly?"
	exit 1
fi
oc --namespace "${namespace}" observe secrets --no-headers -- "${output}/extract.sh" &

while true; do
	if [[ -s "${output}/kubeconfig" ]]; then
		echo "\$KUBECONFIG saved to ${output}/kubeconfig"
		exit 0
	fi
	sleep 1
done
```

Then, run the script:

```shell
$ extract-kubeconfig.sh ci-op-xxxxxxx e2e-aws
```

The following files should be copied to your local system:

```bash
$ ls /tmp/kubeconfig.Z7SNI
kubeconfig
```

{{< alert title="Info" color="info" >}}
It may take some time for the ephemeral test cluster to be installed and ready. The above script will wait when necessary.
{{< /alert >}}

Once copied to your local system, you can proceed to run `oc` commands against the test cluster by setting `$KUBECONFIG`
environment variable or passing `--kubeconfig` to `oc`. Again, this is intended for work-in-progress pull requests only.
The test cluster will be terminated whenever the job completes. It is usually more productive to launch a development
cluster using `cluster-bot` through Slack and manually run `openshift-tests` suites against that, rather than through a
pull request job's cluster. For how to run the `openshift-tests` binary and to find more information about the test
suites, see the [documentation](#how-to-run-the-test-suites-outside-of-ci) on how to run the test suites outside of CI.

## How Do I Know What Tests Will Run?

It can be quite confusing to find the test command that is running in CI. Jobs are configured in
[the release repository](https://github.com/openshift/release).
The YAML job definitions are generated from the step-registry workflow and/or the `ci-operator`/config files.
For jobs that aren't configured with the `ci-operator`/step-registry, you can find test commands in
[release/ci-operator/config/openshift](https://github.com/openshift/release/tree/master/ci-operator/config).
For example, the `ci/prow/unit` test command for `openshift-apiserver` is
[make test-unit](https://github.com/openshift/release/blob/8ccb2b1c17387920b3de0180c52052c535603855/ci-operator/config/openshift/openshift-apiserver/openshift-openshift-apiserver-master.yaml#L60-#L62).

For jobs configured with the step-registry workflow, such as all the jobs that require test clusters, you can get more
information with the [step-registry viewer](https://steps.ci.openshift.org/). There you'll find detailed overviews of
the workflows with a search toolbar for locating specific jobs. The viewer provides links to the code in GitHub, or you
can locate the OWNERS of the workflows if you have further questions.

## How To Run the Test Suites Outside of CI

While iterating upon a work-in-progress pull request, for those jobs that install and run tests against a test cluster,
it's useful to run the `openshift-tests` binary against a development cluster you have running rather than follow a pull
request job in the CI cluster. You can run the `openshift-tests` binary against any development cluster for which you
have a `KUBECONFIG` file. CoreOS Slack offers a `cluster-bot` tool you can utilize to launch a cloud-based development
cluster from one or more pull requests. For more information on what `cluster-bot` can do, find `cluster-bot` under
`Apps` in `CoreOS Slack` _or_ direct message cluster-bot `"help"` to list its functions. For example, to launch a
development cluster in AWS from a release payload that includes `openshift-apiserver` pull request #400, direct message
`cluster-bot` in Slack the following:

```
/msg @cluster-bot launch openshift/openshift-apiserver#400 aws
```
or, to launch from release payload that includes multiple pull requests:

```
/msg @cluster-bot launch openshift/openshift-apiserver#400,openshift/cluster-authentication-operator#501 aws
```

Upon successful install, you will receive login information with a downloadable `kubeconfig` for the development cluster.

If you are not modifying or adding tests to the openshift-tests binary and simply want to run a test suite or single test
against a development cluster, you can do the following:

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

## Running Test Suites On A Manually Provisioned Cluster

There are times when you want to run the `openshift-tests` binary to test or debug a new test without having
to use Prow/CI.  To achieve this goal, we use the logs from Prow jobs to find out how it runs suites of tests,
set up minimal local environment, and then run the `openshift-tests` binary locally.  The following sections
show how to do this.

### Looking at Prow Logs For `openshift-tests`

Prow jobs that run suites of tests using `openshift-test` produce a log called `build-log.txt` that shows
exactly how the `openshift-tests` binary was executed.  We can use this information to determine how to
run the test suites against a development cluster (e.g., one created by cluster-bot).

The `build-log.txt` file usually resides in a path similar to:

```bash
https://<GCSPrefix>/logs/<jobName>/<jobID>/artifacts/<e2eJob>/openshift-e2e-test/build-log.txt
```

In that log, you can see how `openshift-tests` was run.  For example:

```bash
openshift-tests run openshift/conformance/serial
                    --provider '{"type":"aws",...}'
                    -o /logs/artifacts/e2e.log
                    --junit-dir /logs/artifacts/junit
```

Given how prow runs `openshift-tests`, we will mimic this except run it manually.

When `openshift-tests` is run in prow, the paths for `-o` and `--junit-dir` lead to local directories
residing in a pod where `openshift-tests` is run.  Those contents are then copied to a GCS bucket and
then end up in a location accessible from a link as shown above. When you look at artifacts in a prow
job, the links will look similar to this:

```bash
https://<GCSPrefix>/logs/<jobName>/<jobID>/artifacts/<e2eJob>/openshift-e2e-test/artifacts/e2e.log
https://<GCSPrefix>/logs/<jobName>/<jobID>/artifacts/<e2eJob>/openshift-e2e-test/artifacts/junit/*
```

For running `openshift-tests` locally, we will create directories on our local disk and maintain the same
directory structure and relative placement of files.


### Requirements (Minimal Setup)

Before attempting to run `openshift-tests`, ensure these requirements are met:

* Build the `openshift-tests` executable using the [existing documentation](https://github.com/openshift/origin//blob/cdd6e3a94594a56d15e25ea02e9ecd391060d50a/test/extended/README.md#prerequisites) or run `podman` as above to run an already built
`openshift-tests` binary in a container.

* Create an OpenShift development cluster via any means preferred, but you will need cluster admin level permissions.
  OpenShift developers can use the slack cluster-bot for this.  For upgrade tests, it might be
  useful to create a development cluster using a specific version of openshift using slack text like this:

    ```bash
    /msg @cluster-bot launch 4.11.0-0.nightly-2022-06-14-172335 gcp
    ```

  or:

    ```bash
    /msg @cluster-bot launch 4.11 gcp
    ```

  OpenShift versions (and valid upgrade versions) can be found from the [Release Status](https://amd64.ocp.releases.ci.openshift.org/) page.

* Install the [`oc` command line tool](https://docs.openshift.com/container-platform/4.10/cli_reference/openshift_cli/getting-started-cli.html).

* Download the kubeconfig that cluster-bot generated and set the `KUBECONFIG` environment variable:

  ```bash
  export KUBECONFIG=/path/to/cluster-bot-2022-06-17-200119.kubeconfig.txt
  ```

* Create the `artifacts` and `junit` directories.  Below is an example of creating a `./tmp` directory in
  the current directory and then creating the two directories as used in the `openshift-tests` command
  above but you can create the two directories anywhere where you have access.

  ```bash
  mydir=`pwd`/tmp
  mkdir -p $mydir/logs/artifacts/junit
  ```

* For aws, do these:

  * determine the region and zone of your cluster so you can use those values in your `--provider` parameter on the `openshift-tests` command:

    ```bash
    $ oc get node -o json | jq '.items[]|.metadata.labels'|grep topology.kubernetes.io/region|cut -d : -f 2| sort -u
    "us-west-1",

    $ oc get node -o json | jq '.items[]|.metadata.labels'|grep topology.kubernetes.io/zone|cut -d : -f 2| sort -u
    "us-west-1a"
    "us-west-1b"
    ```

  * Use this for the `--provider` when running the `openshift-tests` command:

    ```bash
    --provider '{"type":"aws", "region":"us-west-1", "zone":"us-west-1a","multizone":true,"multimaster":true}'
    ```


* For gcp, do these:

  * create a gcp credentials file (if you are using a cluster-bot generated cluster, you can extract the credentials
    like this):

    ```bash
    export KUBECONFIG=/path/to/cluster-bot-2022-06-17-200119.kubeconfig.txt
    oc -n kube-system get secret gcp-credentials -o json|jq -r '.data|to_entries[].value'|base64 -d > /tmp/gcp-cred.json
    ```

    If you are not using a cluster-bot generated cluster, you'll have to obtain your gcp credentials file by going to
    the gcp UI or other means.

  * setup the environment variable so openshift-tests can find it:

    ```bash
    export GOOGLE_APPLICATION_CREDENTIALS=/path/to/<your gce credentials file>
    ```

  * determine the region of your cluster so you can use it in your `--provider` paramater on the `openshift-tests` command:

    ```bash
    $ oc get node -o json |jq '.items[]|.metadata.labels'|grep topology.kubernetes.io/region|cut -d : -f 2| sort -u
    "us-west-1",
    ```

  * determine your project ID.  For a cluster-bot cluster, the project ID can be obtained like this (using the `/tmp/gcp-cred.json` obtained earlier):

    ```bash
    project_id=$(cat /tmp/gcp-cred.json |jq .project_id /tmp/gcp-cred.json)
    ```

  * Use this for the `--provider` when running the `openshift-tests` command:

    ```bash
    --provider '{"type":"gce", "region":"us-west-1","multizone": true,"multimaster":true,"projectid":"<yourProjectID>"}'
    ```

* For azure do these:

  * create the azure credentials file by saving this text as `extract_azure.sh` and then running it as shown below:

    ```bash
    export KUBECONFIG=/path/to/cluster-bot-2022-06-23-175417.kubeconfig.txt ;# set this to the correct file
    oc -n kube-system get secret azure-credentials -o json > j.json

    echo "{"
    echo "  \"azure_client_id\": \"$(cat j.json       | jq .data.azure_client_id|sed 's/\"//g'|base64 -d)\","
    echo "  \"azure_client_secret\": \"$(cat j.json   | jq .data.azure_client_secret|sed 's/\"//g'|base64 -d)\","
    echo "  \"azure_region\": \"$(cat j.json          | jq .data.azure_region|sed 's/\"//g'|base64 -d)\","
    echo "  \"azure_resource_prefix\": \"$(cat j.json | jq .data.azure_resource_prefix|sed 's/\"//g'|base64 -d)\","
    echo "  \"azure_resourcegroup\": \"$(cat j.json   | jq .data.azure_resourcegroup|sed 's/\"//g'|base64 -d)\","
    echo "  \"azure_subscription_id\": \"$(cat j.json | jq .data.azure_subscription_id|sed 's/\"//g'|base64 -d)\","
    echo "  \"azure_tenant_id\": \"$(cat j.json       | jq .data.azure_tenant_id|sed 's/\"//g'|base64 -d)\""
    echo "}"
    ```

    Then run it like this:

    ```bash
    chmod a+x extract_azure.sh
    ./exract_azure.sh > /tmp/azure.json
    ```

  * Set the `AZURE_AUTH_LOCATION` enviroment variable:

    ```bash
    export AZURE_AUTH_LOCATION=/tmp/azure.json
    ```

  * Use this for the `--provider` when running the `openshift-tests` command:

  ```
  --provider azure
  ```

### Running `openshift-tests`

Once the above requirements are met, run the `openshift-tests` binary for one of these scenarios:

* Running the "openshift/conformance/serial" conformance suite

  Using an aws cluster, here's an example command to run the openshift/conformance/parallel tests:

  ```bash
  ~/openshift-tests run openshift/conformance/parallel \
         --provider '{"type":"aws", "region":"us-west-1", "zone":"us-west-1","multizone":true,"multimaster":true}' \
         -o $mydir/logs/artifacts/e2e.log --junit-dir $mydir/logs/artifacts/junit
  ```

  Using an aws cluster, here's an example command to run the openshift/conformance/serial tests:

  ```bash
  ~/openshift-tests run openshift/conformance/serial \
         --provider '{"type":"aws", "region":"us-west-1", "zone":"us-west-1","multizone":true,"multimaster":true}' \
         -o $mydir/logs/artifacts/e2e.log --junit-dir $mydir/logs/artifacts/junit
  ```

* Run the upgrade test:

  Using an aws cluster, here's an example command to run an upgrade tests:

  ```bash
  ~/openshift-tests run-upgrade all --to-image registry.ci.openshift.org/ocp/release:4.11.0-0.nightly-2022-06-15-161625 \
         --options '' \
         --provider '{"type":"aws", "region":"us-west-1", "zone":"us-west-1","multizone":true,"multimaster":true}' \
         -o $mydir/logs/artifacts/e2e.log --junit-dir $mydir/logs/artifacts/junit
  ```

  Using an gcp cluster, here's an example command to run an upgrade tests:

  ```bash
  ~/openshift-tests run-upgrade all --to-image registry.ci.openshift.org/ocp/release:4.11.0-0.nightly-2022-06-15-161625 \
         --options '' \
         --provider '{"type":"gce", "region":"us-west-1","multizone": true,"multimaster":true,"projectid":"<yourProjectID>"}' \
         -o $mydir/logs/artifacts/e2e.log --junit-dir $mydir/logs/artifacts/junit
  ```

  NOTE: be careful to use `"type":"gce"` and not`"type":"gcp"`; the latter is wrong and will result in errors.

Here are more suites to choose from (including their descriptions):

* [static suites](https://github.com/openshift/origin/blob/cf6d28314f42fdb6724f38e8d7bd82f3a22642ee/cmd/openshift-tests/e2e.go#L75-L428)
* [upgrade suites](https://github.com/openshift/origin/blob/cf6d28314f42fdb6724f38e8d7bd82f3a22642ee/cmd/openshift-tests/upgrade.go#L20-L72)

When your test run finishes, you will see familiar files (similar to a prow job) in the output directories:

```bash
$ tree tmp/logs
 artifacts
 ├── e2e.log
 └── junit
     ├── AdditionalEvents__sig_api_machinery_Kubernetes_APIs_remain_available_for_new_...
     ├── AdditionalEvents__sig_api_machinery_Kubernetes_APIs_remain_available_with_reused_...
	 ...
     ├── AdditionalTest_cluster-upgrade_2022-06-17T08:53:51-04:00.json
     ├── alerts_20220617-124636.json
     ├── backend-disruption_20220617-124636.json
     ├── e2e-events_20220617-124636.json
     ├── e2e-timelines_e2e-namespaces_20220617-124636.html
     ├── e2e-timelines_e2e-namespaces_20220617-124636.json
	 ...
     ├── junit_e2e_20220617-125422.xml
     ├── junit_upgrade_1655470431.xml
     ├── pod-placement-data.json
     ├── pod-transitions.txt
     ├── resource-events_20220617-124636.zip
     └── resource-pods_20220617-124636.zip
```

### Tips

This section contains tips and notes to keep in mind when running the tests suites.

* Before running your tests, ensure the `artifacts` and `junit` directories are empty; if you don't, you may have a hard time
  distinguishing what output files belong to what invocation of `openshift-tests`.
* An upgrade tends to take close to an hour.  To confirm an upgrade is happening and progressing, use these commands:

  ```bash
  $ export KUBECONFIG=/path/to/cluster-bot...txt
  $ oc get clusterversion version
  NAME      VERSION                              AVAILABLE   PROGRESSING   SINCE   STATUS
  version   4.11.0-0.nightly-2022-06-14-172335   True        True          11m     Working towards 4.11.0-0.nightly-2022-06-15-161625: 126 of 802 done (15% complete)
  ```
  You should see the `STATUS` text change as the upgrade progresses.

  You can also add use the `-w` option to see the progress as it happens:

  ```bash
  $ oc get -w clusterversion version
  ```

* If you see this message:

  ```bash
  Jun 23 06:19:31.765: INFO: Warning: gce-zone not specified! Some tests that use the AWS SDK may select the wrong region and fail.
  ```

  You need to provide the zone in the `--provider option`

* vscode users can insert this into their `launch.json` file so you can run the `openshift-tests` binary in debug mode:
  ```bash
  {
    "version": "0.2.0",
    "configurations": [
      {
        "name": "openshift-tests-debug",
        "type": "go",
        "request": "launch",
        "mode": "auto",
        "program": "cmd/openshift-tests/",
        "env": {
          "KUBECONFIG": "/tmp/Downloads/cluster-bot-2022-06-22-120748.kubeconfig.txt"
        },
        "args": [ "run-upgrade", "all",
        "--to-image", "registry.ci.openshift.org/ocp/release:4.11.0-0.nightly-2022-06-21-094850",
        "-o", "/tmp/logs/artifacts/e2e.log",
        "--provider", "{\"type\":\"aws\"}",
        "--junit-dir", "/tmp/logs/artifacts/junit"
        ],
        "showGlobalVariables": true
      }
    ]
  }
  ```

  Change the `KUBECONFIG` value to use your cluster-bot kubeconfig, change the `--to-image` value to a version
  you want to upgrade to, change the value of the `--provider` parameter to use the correct values (for example,
  `type`, `region`, `zone`, etc.)
