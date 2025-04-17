---
title: Onboarding a New Component for Testing and Merge Automation
description: How to onboard a new component repository to the CI system for testing and merge automation.
---

## Overview

This document overviews the workflow for onboarding new public component repositories to the Openshift CI. Private
repositories are also supported with a few caveats. More information can be found [here](/docs/architecture/private-repositories).

If you are thinking about adding new images to OpenShift release payloads, read [this section](#product-builds-and-becoming-part-of-an-openshift-release) first, to avoid doing work you might have to adjust later.

## Granting Robots Privileges and Installing the GitHub App

In order to add labels, move PRs and issues into milestones, merge PRs, etc, the robots will need write access to your repository.

If your repository is in the OpenShift github organization and it was created by the 'Products & Global Engineering Cloud Operations' team, it probably has Team
OpenShift Robots added by default as part of the repo creation process. To check if your repo has the robots added,
please ask in slack in #forum-pge-cloud-ops or open a ticket in the DPP JIRA project via their [GitHub Support Portal](https://devservices.dpp.openshift.com/support/#id_github_support_section) [VPN Required]. If your repo is managed by DPP, but does not have robots, then open a new ticket
in that Jira Project with the details about the missing bots.

If your component repository is **not** in the OpenShift github organization:

1. Invite `openshift-ci-robot` and `openshift-merge-robot` into your organization or add them as [collaborators](https://docs.github.com/en/github/setting-up-and-managing-your-github-user-account/managing-access-to-your-personal-repositories/inviting-collaborators-to-a-personal-repository) for the repository.
1. The invitations will be accepted automatically via the `periodic-openshift-release-master-accept-invitations-ci-robot` and `periodic-openshift-release-master-accept-invitations-merge-robot` jobs in _no more_ than 4 hours.
1. The `openshift-merge-robot` **must** be given `admin` permissions to support either of the following use cases:
   1. In order for `tide` to automatically merge PRs it must be allowed to verify the repo's allowed merge methods. 
   1. By default, we enable [branch-protection](/docs/architecture/branch-protection) for all prow-controlled repos. We can disable it in prow’s [config.yaml](https://github.com/openshift/release/blob/master/core-services/prow/02_config/_config.yaml)
1. If a repository is [enrolled in centralized branch management](https://docs.ci.openshift.org/docs/architecture/branching/) and no write permissions is granted to `openshift-merge-robot`, ensure that the `tide/merge-blocker` label exists on the repository. Otherwise, [the periodic-openshift-release-merge-blockers job](https://prow.ci.openshift.org/?job=periodic-openshift-release-merge-blockers) would fail. See how to create a label at [Github's documentation](https://docs.github.com/en/free-pro-team@latest/github/managing-your-work-on-github/creating-a-label).
1. All repositories need the [Openshift CI](https://github.com/apps/openshift-ci) and the [Openshift Merge Bot](https://github.com/apps/openshift-merge-bot) GitHub Apps installed. Go to the [app](https://github.com/apps/openshift-ci) and click Configure. Repeat the process for the [second app](https://github.com/apps/openshift-merge-bot). We plan to eventually replace the bot accounts entirely with these apps, but that work is not yet done.
Both of them are required for automations to work properly, if one is missing you might experience failures in tests like [pull-ci-openshift-release-check-gh-automation](https://github.com/openshift/release/blob/cd6d9f44031fad0fc9a50aab17cd79e4d8099654/ci-operator/jobs/openshift/release/openshift-release-master-presubmits.yaml#L1-L66)


## Prow Configuration

[Prow](https://docs.prow.k8s.io/docs/overview/) is the k8s-native upstream CI system, source
code hosted in the [kubernetes-sigs/prow](https://github.com/kubernetes-sigs/prow) repository. Prow interacts with
GitHub to provide the automation UX that developers use on their pull requests, as well as orchestrating test workloads
for those pull requests.

### Bootstrapping Configuration for a new Repository

From the root of the [openshift/release](https://github.com/openshift/release) repository, run the following target and
use the interactive tool to bootstrap a configuration for your repository:

{{< highlight bash >}}
make new-repo
{{< / highlight >}}

This should fully configure your repository, so the changes that it produces are ready to be submitted in a pull
request. The resulting YAML file called `$org-$repo-$branch.yaml`
will be found in the `ci-operator/config/$org/$repo` directory.


### Enabling Plugins

Plugins implement many portions of CI system functionality. These must be configured before they can be used. They can
be enabled as-needed and configured for your repository independently of other repositories in the organization. After
your repository is configured to deliver webhooks to Prow, those webhooks will be ignored until plugins are configured
to consume and react to them. A live list of plugins and their descriptions is hosted on [our
website](https://prow.ci.openshift.org/plugins), please consult that list while reading the following section for more
detail.

After initializing your repository with the `make new-repo` target, you can create a new Plugin configuration for your repository with the following target:

{{< highlight bash >}}
make prow-config
{{< / highlight >}}

This will place a new `_pluginconfig.yaml` file in the `/core-services/prow/02_config/$org/$repo` directory.
This file is used to configure the specific plugins for your repository.

Default plugin configuration is stored in
[`_plugins.yaml`](https://github.com/openshift/release/blob/master/core-services/prow/02_config/_plugins.yaml) in the
[openshift/release](https://github.com/openshift/release) repository. Plugins are enabled for a repository or
organization under the `plugins` key. Plugin-specific configuration is under keys like `label` or `owners`. The set of a
repository’s enabled plugins is the union of plugins configured for the repository’s organization (found at the
`plugins.yaml["plugins"]["$org"]` key) and the repository itself (found in the `/core-services/prow/02_config/$org/$repo/_pluginconfig.yaml` file).

Most individual plugins can be configured to change their behavior; only some plugins allow for granular configuration
at a repository level, many only expose global configuration options for all repositories that Prow monitors. If you
think you need to configure an individual plugin, consult a CI administrator. While we work on a better solution,
documentation for these options lives in the `type Configuration struct`
[here.](https://github.com/kubernetes-sigs/prow/blob/main/pkg/plugins/plugins.go)

#### Repositories Under Existing Organizations

If you are onboarding a repository in an organization for which plugins are already configured, you will only need to
enable plugins that you do not already inherit from the organization by adding those plugins under a new
`plugins.yaml["plugins"]["$org/$repo"]` key. The one plugin you may want to configure at a repository-scoped level is:

|Name|Description|
|:---|:---|
|`approve`|enables the `/approve` functionality with `OWNERS` files|

Review the list of plugins enabled for your owning organization and the live [plugin
catalog](https://prow.ci.openshift.org/plugins) when choosing which plugins you want on your repo.

If your repository does not have `OWNERS files`, you will not be able to opt into the `/approve` process or automatic pull
request review assignment. `OWNERS` file format and interaction details can be found
[upstream.](https://docs.prow.k8s.io/docs/components/plugins/approve/approvers/) You will also
need to add bugzilla component information to your `OWNERS` file. Format can be found
[here.](https://docs.google.com/document/d/1V_DGuVqbo6CUro0RC86THQWZPrQMwvtDr0YQ0A75QbQ/edit?usp=sharing)

#### Repositories Under New Organizations

If you are onboarding a component not in any organization we already have configured, consider copying the openshift
organization’s plugin configuration for your organization under a new `plugins.yaml["plugins"]["$org"]` key, or/ setting
your repo’s configuration without adding any organization-wide configuration by adding the full list of plugins you
require under a new `plugins.yaml["plugins"]["$org/$repo"]` key.

### Describing Tests

Prow provides the following test trigger types:

|Type Name|Trigger|Target|Purpose|
|:---|:---|:---|:---|
|`presubmit`|Push to a PR|A single PR merged into the branch it is targeting|Testing commits within a PR before they are merged|
|`postsubmit`|Push/merge to a branch|User specified set of branches|Integration tests after a PR is merged|
|`periodic`|`cron`-like schedule|User-specified set of branches|Scheduled test runs|

Configuration for your repository’s tests live in YAML files in the
[openshift/release](https://github.com/openshift/release) repository. Jobs are stored in
many files, sharded by branch and job type, found under: `ci-operator/jobs/$org/$repo/$org-$repo-$branch-$jobtype.yaml`.
The org and repo name redundancy is because of a requirement that the basename of your YAML file is unique under the
`ci-operator/jobs` tree. More detailed Prow job configuration documentation lives
[upstream.](https://docs.prow.k8s.io/docs/jobs#how-to-configure-new-jobs)

#### Generating Prow jobs from ci-operator configuration files

The Test Platform team created a [tool](https://github.com/openshift/ci-tools/tree/master/cmd/ci-operator-prowgen) to generate Prow
job configuration files out of ci-operator configuration files. The generator has knowledge of the naming and directory structure conventions in
[`openshift/release`](https://github.com/openshift/release) repository. Provided you have put the `ci-operator`
configuration file to `ci-operator/config/$org/$repo` directory in it (as described by [Containerized Tests
section](#containerized-tests)), you can generate the needed Prow files by running this command from the root of the
[`openshift/release`](https://github.com/openshift/release) repository:

{{< highlight bash >}}
make jobs
{{< / highlight >}}

This will create all necessary files under `ci-operator/jobs/$org/$repo`, creating a good default set of Prow jobs.

{{< alert title="Note" color="info" >}}
This will, however, completely regenerate jobs for all configuration files in
`openshift/release`, which can take a long time due to the size of the
repository.  Generating jobs for one or a few repositories is fast, and can be
done by specifying a subdirectory of `ci-operator/config` using the `WHAT`
parameter:

{{< highlight bash >}}
make jobs WHAT=openshift
# or
make jobs WHAT=openshift/release
{{< / highlight >}}
{{< /alert >}}

#### Setting up team ownership of ci-operator and Prow config files

While the initial PR to [`openshift/release`](https://github.com/openshift/release) will need to be reviewed and
approved by [root approvers](https://github.com/openshift/release/blob/master/OWNERS), once the component config is in
place, it should be owned by the component team. To achieve this, an `OWNERS` file mirroring what exists upstream should
be placed into both `ci-operator/config/$org/$repo` and `ci-operator/jobs/$org/$repo` directories.

Shortly following the merge of the onboarding PR, the `periodic-prow-auto-owners` job will sync the `OWNERS` file from the component repository to the relevant directories.
Assumming this file exists in the repo's base directory, this sync is performed periodically, and will sync all members in that file that are also members of the `openshift` GitHub org.
This means that the component's `OWNERS` file is the only one that needs to be manually updated.
See `#forum-pge-cloud-ops` to gain membership in the `openshift` org.

### Enabling Automatic Merges

Prow’s [`tide`](https://github.com/kubernetes-sigs/prow/tree/main/pkg/tide) component
periodically searches for pull requests that fit merge criteria (for instance, presence of a `lgtm`
label and absence of the `do-not-merge/hold` label) and merges them. `Tide` furthermore requires not only that all required
tests in the Prow configuration succeed and all posted statuses on the GitHub pull request are green but also that the
tests tested the latest commit in the pull request on top of the latest commit in the branch that the pull request is
targeting before a pull request is considered for merging.

To enable Tide, place a new `_prowconfig.yaml` file in the
`/core-services/prow/02_config/$org/$repo` directory and configure Tide under
the top-level `["tide"]` key. The easiest way to get the correct config is to
copy it from an existing repo with similar requirements. Tide’s configuration
options are documented
[upstream](https://docs.prow.k8s.io/docs/components/core/tide/config/).

If your repository does not have `OWNERS` files, or if you have not chosen to
opt into the `/approve `process, it is suggested that you require only the
`lgtm` label and not `approve` also.

{{< alert title="Note" color="info" >}}
Due to github's rate limiting it is possible that the `Tide` check will not appear on any given PR. The PR will still merge with Tide, and this is purely a cosmetic issue.
{{< /alert >}}

#### Who can `/approve`?

Repo’s `OWNERS` and `OWNERS_ALIASES` define the list. It is a concept of Prow workflow. Those files also define who
could get selected as reviewers of PRs in that repo. See [Prow's
doc](https://docs.prow.k8s.io/docs/components/plugins/approve/approvers#approval-handler-and-the-approved-label)
on this topic.

#### Who can `/lgtm`?

Github’s users who are the repo’s collaborators. It is a [concept of
github.](https://developer.github.com/v3/projects/collaborators/) Contributors should follow this
[source page](https://source.redhat.com/groups/public/openshift/openshift_wiki/openshift_onboarding_checklist_for_github) to become a collaborator for repositories
in openshift org. See [Prow’s
doc](https://docs.prow.k8s.io/docs/components/plugins/approve/approvers/#lgtm-label) on this
topic.

## CI Operator Configuration

CI-Operator is a second-level orchestrator which translates Prow’s testing requests into OpenShift-native test
workloads. Think translating “run integration tests on my PR” into “trigger an OpenShift `Build` to create a container
with test artifacts and a `Pod` to run the integration test using that container image”.

While the Prow configuration describes *when* to run a test, the CI Operator configuration describes the test’s content.

Consult the [`ci-operator` configuration reference document](https://steps.ci.openshift.org/ci-operator-reference) for
information on specific fields.

### Containerized Tests

Adding a containerized test is as simple as adding an entry to the `tests` array in the CI Operator configuration file
and a Prow job configuration that runs the test with `--target=$target`. Consult the [documentation](/docs/architecture/ci-operator/#declaring-tests)
for more details on how to configure containerized tests and test them locally.

We recommend breaking up your tests into logical sections when adding tests here. More granular test reporting will
allow for higher parallelism during test execution and more efficient re-testing if one suite fails.

Containerized tests are configured first-class in CI Operator configuration files in the
[`openshift/release`](https://github.com/openshift/release) repository, sharded by branch, at:
`ci-operator/config/$org/$repo/$org-$repo-$branch.yaml`. The org and repo name redundancy is due to
a requirement that all filenames be unique under `ci-operator/config`.

### End-to-End Tests

Tests that require a running Openshift cluster should use one of the provided step registry workflows, more details
[here](https://docs.ci.openshift.org/docs/architecture/step-registry/).

{{< alert title="Non-Openshift organization users" color="info" >}}
Please read the section about creating your own [cluster profile](https://docs.ci.openshift.org/docs/how-tos/adding-a-cluster-profile/). It is needed for all parties outside of OpenShift organization to operate on test platform using cloud accounts provided by your organization. Alternatively, you may be interested in creating your own [cluster pool](https://docs.ci.openshift.org/docs/how-tos/cluster-claim/).
{{< /alert >}}

### Image Publishing and Mirroring

When container images are declared as release artifacts for a repository in the CI Operator configuration file under the
`images` list (like
[this](https://github.com/openshift/release/blob/52b67a8df670129a188f6be99c1b64ac8e85a2a5/ci-operator/config/openshift/origin/openshift-origin-master.yaml#L26-L54)),
a synthetic `[images]` target is available for CI Operator execution that will simply build all
release images. In order for the container images built from your repository to be published, the
Prow job generator will configure a Prow postsubmit job that uses the CI Operator `--target=[images]` and `--promote` flags.
Information on how to publish images to an external registry can be found in a [separate document](/docs/how-tos/mirroring-to-quay/).

### Product builds and becoming part of an OpenShift release

Some images become part of the OpenShift release because they are core to the platform. To be part of the release, there are additional requirements (beyond those described in the previous section).
Adding images to releases is a significant addition, and requires [an enhancement][enhancements] to explain why the new functionality is important, and why it should be delivered via OpenShift releases (instead of via [an OLM-installed operator][operator-lifecycle-manager]).
It also requires [the approval of image names for mirroring](/docs/how-tos/mirroring-to-quay/#mirroring-images).
You can delay the enhancement proposal and image naming discussion if you need to get through some later steps in order to figure out what to put in the enhancement, but that it's good to round with likely enhancement and image naming approvers about that, and it comes with the risk that you sink in some work and then enhancement or image-name review ends up rejecting your idea or requesting invasive changes.

There are two types of component images in the release payloads:
1. Operators managed by the CVO - known as second level operators. If a [Dockerfile contains](https://github.com/openshift/cloud-credential-operator/blob/c2bec26d3734e444666024858e76d4ca80dd31cf/Dockerfile#L12) `LABEL io.openshift.release.operator true`, the component is a second level operator.
2. Operands managed by second level operators. These images are pulled into the release payload by virtue of being [specified in an image-references file by a second level operator](https://github.com/openshift/cloud-credential-operator/blob/c2bec26d3734e444666024858e76d4ca80dd31cf/manifests/image-references#L9-L12). 

All product teams that will ship an image to product must ensure their image is built in OSBS at least once and
published back to the nightly test jobs BEFORE you reference them from another component (via the image-references
file), or before you set the image label `io.openshift.release.operator` to get automatically included.

1. To include the build version, you can consume [environment variables like `OS_GIT_VERSION` and `BUILD_VERSION` set by ART's Doozer][doozer-environment-variables] in your Dockerfile.
    For example, [here is build-machinery-go passing `OS_GIT_VERSION`, `SOURCE_GIT_COMMIT`, and `SOURCE_GIT_TREE_STATE` through to Go][build-machinery-go-version-ldflags].

    CVO manifests may also use [the `0.0.1-snapshot` placeholder][cluster-version-manifest-version-placeholder] to have the OCP release version injected at release-assembly time.
1. Ensure you have successfully published your image to the CI integration stream
1. Follow the [ART instructions](https://source.redhat.com/groups/public/atomicopenshift/atomicopenshift_wiki/guidelines_for_requesting_new_content_managed_by_ocp_art) to have them build your image
    * On the [dist-git part of the process](https://source.redhat.com/groups/public/atomicopenshift/atomicopenshift_wiki/requesting_a_new_image_or_rpm_to_be_managed_by_art#jive_content_id_Naming) it is critical that you ensure your component/image names match as described in the bulleted criteria
1. Ensure a single successful build is run (sync with ART to confirm).  You can also check for your new image name in both ART and CI ImageStreams by checking [CI registries](/docs/how-tos/use-registries-in-build-farm/#how-do-i-gain-access-to-qci):

    ```console
    $ podman login -u=$(oc --context app.ci whoami) -p=$(oc --context app.ci whoami -t) quay-proxy.ci.openshift.org --authfile /tmp/t.c
    $ oc image info quay-proxy.ci.openshift.org/openshift/ci:ocp_4.15_cluster-config-api -a /tmp/t.c | head -n2  # looking for the 'cluster-config-api' name in the CI ImageStream for 4.15
    Name:          quay-proxy.ci.openshift.org/openshift/ci:ocp_4.15_cluster-config-api
    Digest:        sha256:59ec20828d39a8b7c971d2d6e6142d2b3c4a45996038fe0d19ada0372a775598
    $ oc image info registry.ci.openshift.org/ocp/4.15-art-latest:cluster-config-api | head -n2  # looking for the 'cluster-config-api' name in the ART ImageStream for 4.15
    Name:        registry.ci.openshift.org/ocp/4.15-art-latest:cluster-config-api
    Digest:      sha256:aefb9a83bac984a1bb54d3976f38ff25c60bc101a40117e63396bfb8891f190a
    ```

1. Open the PR to add `LABEL io.openshift.release.operator true` or to add your new image to another component (your operator, usually)
1. Once the PR is merged, verify that the [nightly builds](https://amd64.ocp.releases.ci.openshift.org/) continue to pass (usually 2-3 hours after your PR merges) and that you didn’t break the OCP CI test

### Renaming or removing components in the OpenShift release payload

It is occasionally necessary to rename or remove existing components in the OpenShift release payload. This must be done
with care. Missteps may cause production and CI automation to be unable to create new release payloads -- impacting the
entire organization. Observing the process as it unfolds and maintaining good communication with the ART team is
crucial.

{{< alert title="Note" color="info" >}}
Before proceeding, it is important to understand the name you are changing. This remainder of this section describes how to 
change the component names used within the release payload (i.e. the names listed as a result of running `oc adm release info ...`).
This procedure will _not_ change the repository to which an image is published on registry.redhat.io (e.g. [registry.redhat.io/openshift4/ose-cluster-etcd-rhel8-operator...](https://catalog.redhat.com/software/containers/openshift4/ose-cluster-etcd-rhel8-operator/5f6d313f4fcb1bc3f0425fd5?container-tabs=gti)) . 
To change the registry.redhat.io repository name, create a copy of [this ART team template](https://issues.redhat.com/browse/ART-1443)  
describing the desired change. The repository on registry.redhat.io is called the "Comet Repo" and has no impact on the 
content / construction of the release payload.
{{< /alert >}}

#### Changing the component name of a second level operator
It is uncommon for other components to directly reference the release payload component name of a second level operator. However,
if your second level operator is referenced, follow the procedure for changing the component name of an operand. 

{{< alert title="Note" color="info" >}}
To detect if another component references the component about to be changed via an `image-references` file, you can use `oc` and `--exclude` the
old name of the component. 
```shell
$ oc adm release new --from-release {latest-4.x-nightly-pullspec} --exclude etcd --to-file output.yaml
.....
error: unable to create a release: operator "cluster-etcd-operator" contained an invalid image-references file: no input image tag named "etcd"
```
In this example, `cluster-etcd-operator` references `etcd`. 
{{< /alert >}}

Failure to follow all steps can lead to important and difficult to detect disparities between what is tested in CI 
and what is shipped to customers.

**Steps**:
1. If a name change was not directly requested by a staff engineer, ensure that a staff engineer agrees on the name change (`@aos-staff-engineers` on Slack).
2. Open and `/hold` a pull request, PR1, against github.com/openshift/release to change the component's name in CI. In virtually all cases, this will be a PR against the component's ci-config for its main branch. A component's name should be specified in the [`images.to:`](https://github.com/openshift/release/blob/784b1d65e985e19b94fd65bb26c6c5a4fecc2ea8/ci-operator/config/openshift/cluster-etcd-operator/openshift-cluster-etcd-operator-master.yaml#L37-L47) stanza of a component's CI configuration. The new tag name should match exactly what will appear in `oc adm release info` when the component is listed.  
3. Open and `/hold` a pull request, PR2, against github.com/openshift/ocp-build-data in the openshift-4.x branch of the targeted release(s). Note that ART may have already cut a new release branch, meaning you need to open a PR for openshift-4.x+1 as well. The PR should change the `name` field in the component's metadata. Note that in ART metadata, the desired name should be prefixed with `ose-`. For example, the `cluster-etcd-operator` payload component name is defined [here, for openshift-4.11](https://github.com/openshift/ocp-build-data/blob/129ef9fb8335991d88ce9f41a61057c6ab2bb08e/images/cluster-etcd-operator.yml#L23).  
4. Submit a copy of [this ART team template](https://issues.redhat.com/browse/ART-1443) to communicate to ART that a component name change is desired. Include the PRs in the Jira ticket.
5. All PRs should be passing tests and ready to merge. No PRs other than PR1 should be merged in the component's github.com repository during the following process. In a synchronous chat with an ART team member or release manager (`@release-artists` in `#aos-art` on Slack) the following should be performed:
   1. On the central app.ci CI cluster, a release-artist should check the current registry.ci.openshift.org image associated with the component in the `-n ocp is/4.{minor}` release image stream. For example, `oc -n ocp get istag 4.11:{old-component-name} -o=json | jq .tag.from.name` should output a pullspec like `registry.ci.openshift.org/ocp/4.11@sha256:...` for 4.11. 
   2. Unhold PR1 and allow it to merge.
   3. Once PR1 merges, the release-artist should run `oc -n ocp tag {existing-registry.ci-openshift-org@sha26..} 4.{minor}:{new-component-name}` followed immediately by `oc -n ocp tag 4.{minor}:{old-component-name} -d` to remove the old component name from CI.
   4. Unhold PR2 and have the release-artist merge it.
6. Monitor the subsequent CI payloads on amd64 OpenShift release controller. Continue to do so until you see a CI payload produced which reports the new component name in `oc adm release info <ci-release-payload-pullspec>`. If steps in this process were missed, following the hyperlink for a payload name in the release controller will simply display an error message stating that the release controller was `unable to create a release` with a few details about the problem's cause. If this error is displayed, immediately report the issue to `@team-technical-release` and `@release-artists` so that the incident can be recovered as quickly as possible.

#### Changing the component name of an operand
Release payload operand component names are referenced in second level operator github.com repositories. A change must merge in the second level 
operator's `image-references` file, or release payloads will fail to assemble after the operand component name is changed.

**Steps**:
1. If a name change was not directly requested by a staff engineer, ensure that a staff engineer agrees on the name change (`@aos-staff-engineers` on Slack).
2. Open and `/hold` a pull request, PR1, against github.com/openshift/release to change the operand component's name in CI. In virtually all cases, this will be a PR against the component's ci-config for its main branch. A component's name should be specified in the [`images.to:`](https://github.com/openshift/release/blob/784b1d65e985e19b94fd65bb26c6c5a4fecc2ea8/ci-operator/config/openshift/cluster-etcd-operator/openshift-cluster-etcd-operator-master.yaml#L37-L47) stanza of a component's CI configuration. The new tag name should match exactly what will appear in `oc adm release info` when the component is listed.  
3. Open and `/hold` a pull request, PR2, against the repo(s) of the operator(s) which references the old operand component name in its `image-references` file. PR2 should update `image-references` to use the new component name.
4. Open and `/hold` a pull request, PR3, against github.com/openshift/ocp-build-data in the openshift-4.x branch of the targeted release(s). Note that ART may have already cut a new release branch, meaning you need to open a PR for openshift-4.x+1 as well. The PR should change the `name` field in the component's metadata. Note that in ART metadata, the desired name should be prefixed with `ose-`. For example, the `etcd` operand component is name definition [can be seen here, for openshift-4.11](https://github.com/openshift/ocp-build-data/blob/129ef9fb8335991d88ce9f41a61057c6ab2bb08e/images/cluster-etcd-operator.yml#L23).  
5. Submit a copy of [this ART team template](https://issues.redhat.com/browse/ART-1443) to communicate to ART that a component name change is desired. Include the PRs in the Jira ticket.
6. PR1 and PR3 should be passing tests and ready to merge (PR2 will be failing at this point). No PRs other than PR1 and PR2 should be merged in their respective github.com repositories during the following process. In a synchronous chat with an ART team member or release manager (`@release-artists` in `#aos-art` on Slack) the following should be performed:
   1. On the central app.ci CI cluster, a release-artist should check the current registry.ci.openshift.org image associated with the component in the `-n ocp is/4.{minor}` release image stream. For example, `oc -n ocp get istag 4.11:{old-component-name} -o=json | jq .tag.from.name` should output a pullspec like `registry.ci.openshift.org/ocp/4.11@sha256:...` for 4.11.
   2. The release-artist should run `oc -n ocp tag {existing-registry.ci-openshift-org@sha26..} 4.{minor}:{new-component-name}` to establish a tag with the new operand component name for CI.
   3. Run `/retest` on PR2(s). Tests should now pass.
   4. Unhold and merge PR1.
   5. Unhold and merge PR2(s).
   6. Unhold and have the release-artist merge PR3. The time between PR2 and PR3 merging should be kept to a minimum to avoid ART nightlies failing to assemble. 
   7. It is not time sensitive, but before the ART Jira ticket is closed, the release-artist must remove the old component name from CI: `oc -n ocp tag 4.{minor}:{old-component-name} -d`.
7. Monitor the subsequent [CI payloads on amd64 OpenShift release controller](https://amd64.ocp.releases.ci.openshift.org/#4.11.0-0.ci). Continue to do so until you see a CI payload produced which reports the new component name in `oc adm release info <ci-release-payload-pullspec>`. If steps in this process were missed, following the hyperlink for a payload name in the release controller will simply display an error message stating that the release controller was `unable to create a release` with a few details about the problem's cause. If this error is displayed, immediately report the issue to `@team-technical-release` and `@release-artists` so that the incident can be recovered as quickly as possible.
8. During the ensuing work day, check [ART nightlies on the s390x release controller](https://s390x.ocp.releases.ci.openshift.org/#4.11.0-0.nightly-s390x). Continue to do so until you see an ART nightly produced which reports the new component name in `oc adm release info <art-s390x-nightly-release-payload-pullspec>`. If steps in this process were missed, following the hyperlink for a payload name in the release controller will simply display an error message stating that the release controller was `unable to create a release` with a few details about the problem's cause. If this error is displayed, immediately report the issue to `@team-technical-release` and `@release-artists` so that the incident can be recovered as quickly as possible. Changes will also eventually be apparent on the [amd64 release controller](https://amd64.ocp.releases.ci.openshift.org/#4.11.0-0.nightly), but, due to differences in acceptance testing, they will be evident in the s390x release controller much sooner.

### Removing a component from the OpenShift release payload

**Steps**:
1. Submit a copy of [this ART team template](https://issues.redhat.com/browse/ART-1443) to communicate to ART that a component change is desired. Take care to mention whether the image should also be removed from the 4.x+1 branch of ART's metadata in case it has already been branched.
2. Open and `/hold` pull request, PR1, removing references to the old component from any second level operator which includes the component in its `image-references` file.
3. Open and `/hold` a pull request, PR2, to github.com/openshift/release which, minimally, removes the `promotion:` stanza from the ci-operator configuration for the component & affected release(s). If the component is being completely removed from CI, PR2 can be the complete deletion of the ci-operator configuration file for the component / branch.
4. Via the ART Jira ticket, have a release-artist prepare a github.com/openshift/ocp-build-data pull request, PR3, which either removes the component metadata or prevents its inclusion in the release payload (`for_payload: false`). 
5. In a synchronous chat with an ART team member or release manager (`@release-artists` in `#aos-art` on Slack) the following should be performed:
   1. Unhold and merge PR1.
   2. Unhold and merge PR2.
   3. Unhold and have the release-artist merge PR3.
   4. The release-artist should then remove the old component name from CI: `oc -n ocp tag 4.{minor}:{old-component-name} -d`.

[doozer-environment-variables]: https://github.com/openshift/doozer/blob/57721c72b3ddd08e6493323fcce065f55327fd69/doozerlib/distgit.py#L1975-L1985
[build-machinery-go-version-ldflags]: https://github.com/openshift/build-machinery-go/blob/e25cf57ea46d9ce17de894b1a00dcf43ba12ee1a/make/lib/golang.mk#L57-L69
[cluster-version-manifest-version-placeholder]: https://github.com/openshift/enhancements/blob/master/dev-guide/cluster-version-operator/dev/clusteroperator.md#what-should-be-the-contents-of-clusteroperator-custom-resource-in-manifests
[enhancements]: https://github.com/openshift/enhancements
[operator-lifecycle-manager]: https://olm.operatorframework.io/
