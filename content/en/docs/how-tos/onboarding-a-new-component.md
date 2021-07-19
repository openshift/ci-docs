---
title: Onboarding a New Component for Testing and Merge Automation
description: How to onboard a new component repository to the CI system for testing and merge automation.
---

## Overview

This document overviews the workflow for onboarding new public component repositories to the Openshift CI. Private
repositories are not supported at this time, but will be in the future

## Granting Robots Privileges and Installing the GitHub App

In order to add labels, move PRs and issues into milestones, merge PRs, etc, the robots will need write access to your repository.

If your repository is in the OpenShift organization and it was created by Dev Productivity team, it probably has Team
OpenShift Robots added by default as part of the repo creation process. To check if your repo has the robots added,
please ask in slack in #forum-dp-platform or open a ticket. If your repo does not have robots, then open a new ticket
in their [JIRA project](https://issues.redhat.com/projects/DPP/summary) with the details.

If your component repository is **not** in this organization:

1. Invite `openshift-ci-robot` and `openshift-merge-robot` into your organization or add them as [collaborators](https://docs.github.com/en/github/setting-up-and-managing-your-github-user-account/managing-access-to-your-personal-repositories/inviting-collaborators-to-a-personal-repository) for the repository.
1. Contact a CI administrator to accept the invitation. Otherwise, This will happen automatically after some time.
1. By default, we enable [branch-protection](/docs/architecture/branch-protection) for
	 all prow-controlled repos. This requires `openshift-merge-robot` to be an admin of the repo. We can disable it in
   prow’s [config.yaml](https://github.com/openshift/release/blob/master/core-services/prow/02_config/_config.yaml)
1. If a repository is [enrolled in centralized branch management](https://docs.ci.openshift.org/docs/architecture/branching/) and no write permissions is granted to `openshift-merge-robot`, ensure that the `tide/merge-blocker` label exists on the repository. Otherwise, [the periodic-openshift-release-merge-blockers job](https://prow.ci.openshift.org/?job=periodic-openshift-release-merge-blockers) would fail. See how to create a label at [Github's documentation](https://docs.github.com/en/free-pro-team@latest/github/managing-your-work-on-github/creating-a-label).

Additionally, all repositories need the [Openshift CI](https://github.com/apps/openshift-ci) GitHub App installed. We plan to eventually replace the bot accounts entirely
with that app, but that work is not yet done.


## Prow Configuration

[Prow](https://github.com/kubernetes/test-infra/blob/master/prow/README.md) is the k8s-native upstream CI system, source
code hosted in the [kubernetes/test-infra](https://github.com/kubernetes/test-infra) repository. Prow interacts with
GitHub to provide the automation UX that developers use on their pull requests, as well as orchestrating test workloads
for those pull requests.

### Bootstrapping Configuration for a new Repository

From the root of the [openshift/release](https://github.com/openshift/release) repository, run the following target and
use the interactive tool to bootstrap a configuration for your repository:

{{< highlight bash >}}
make new-repo
{{< / highlight >}}

This should fully configure your repository, so the changes that it produces are ready to be submitted in a pull
request. The resulting yaml file called `$org-$repo-$branch.yaml`
will be found in the `ci-operator/config/$org/$repo` directory.


### Enabling Plugins

Plugins implement many portions of CI system functionality. These must be configured before they can be used. They can
be enabled as-needed and configured for your repository independently of other repositories in the organization. After
your repository is configured to deliver webhooks to Prow, those webhooks will be ignored until plugins are configured
to consume and react to them. A live list of plugins and their descriptions is hosted on [our
website](https://prow.ci.openshift.org/plugins), please consult that list while reading the following section for more
detail.

In order to create a new Plugin configuration for your repository the following target can be used:

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
[here.](https://github.com/kubernetes/test-infra/blob/master/prow/plugins/plugins.go)

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
[upstream.](https://github.com/kubernetes/test-infra/blob/master/prow/plugins/approve/approvers/README.md) You will also
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
[upstream.](https://github.com/kubernetes/test-infra/tree/master/prow#how-to-add-new-jobs)

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

#### Setting up team ownership of ci-operator and Prow config files

While the initial PR to [`openshift/release`](https://github.com/openshift/release) will need to be reviewed and
approved by [root approvers](https://github.com/openshift/release/blob/master/OWNERS), once the component config is in
place, it should be owned by the component team. To achieve this, an `OWNERS` file mirroring what exists upstream should
be placed into both `ci-operator/config/$org/$repo` and `ci-operator/jobs/$org/$repo` directories.

### Enabling Automatic Merges

Prow’s [`tide`](https://github.com/kubernetes/test-infra/tree/master/prow/tide) component
periodically searches for pull requests that fit merge criteria (for instance, presence of a `lgtm`
label and absence of the `do-not-merge/hold` label) and merges them. `Tide` furthermore requires not only that all required
tests in the Prow configuration succeed and all posted statuses on the GitHub pull request are green but also that the
tests tested the latest commit in the pull request on top of the latest commit in the branch that the pull request is
targeting before a pull request is considered for merging.

If you want to configure automatic merges for your component repository, you can either write a new merge criterion for
the repository or add your repository to one of the existing configurations. Tide’s configuration is documented
[upstream](https://github.com/kubernetes/test-infra/blob/master/prow/cmd/tide/README.md). The existing Tide
configuration for our CI system lives in
[`config.yaml`](https://github.com/openshift/release/blob/master/core-services/prow/02_config/_config.yaml) in the
[openshift/release](https://github.com/openshift/release) repository under the `config.yaml["tide"]["queries"]` key. If
your repository does not have `OWNERS` files, or if you have not chosen to opt into the `/approve `process, it is
suggested that you add your repository to the merge criterion that requires only `/lgtm`.

#### Who can `/approve`?

Repo’s `OWNERS` and `OWNERS_ALIASES` define the list. It is a concept of Prow workflow. Those files also define who
could get selected as reviewers of PRs in that repo. See [Prow's
doc](https://github.com/kubernetes/test-infra/blob/master/prow/plugins/approve/approvers/README.md#approval-handler-and-the-approved-label)
on this topic.

#### Who can `/lgtm`?

Github’s users who are the repo’s collaborators. It is a [concept of
github.](https://developer.github.com/v3/projects/collaborators/) Contributors should follow this
[mojo](https://mojo.redhat.com/docs/DOC-1081313#jive_content_id_Github_Access) to become a collaborator for repositories
in openshift org. See [Prow’s
doc](https://github.com/kubernetes/test-infra/blob/master/prow/plugins/approve/approvers/README.md#lgtm-label) on this
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

### Image Publishing and Mirroring

When container images are declared as release artifacts for a repository in the CI Operator configuration file under the
`images` list (like
[this](https://github.com/openshift/release/blob/52b67a8df670129a188f6be99c1b64ac8e85a2a5/ci-operator/config/openshift/origin/openshift-origin-master.yaml#L26-L54)),
a synthetic `[images]` target is available for CI Operator execution that will simply build all
release images. In order for the container images built from your repository to be published, the
Prow job generator will configure a Prow postsubmit job that uses the CI Operator `--target=[images]` and `--promote` flags.
Information on how to publish images to an external registry can be found in a [separate document.](/docs/how-tos/mirroring-to-quay/).

### Product builds and becoming part of an OpenShift release image

Some images become part of the OpenShift release image because they are core to the platform. To be part of the release
image, there are additional requirements (beyond those described in the previous section).  All product teams that will
ship an image to product must ensure their image is built in OSBS at least once and published back to the nightly test
jobs BEFORE you reference them from another component (via the image-references file), or before you set the image label
`io.openshift.release.operator` to get automatically included.

1. Ensure you have successfully published your image to the CI integration stream
1. Follow the [ART instructions](https://mojo.redhat.com/docs/DOC-1179058) to have them build your image
    * On the [dist-git part of the process](https://mojo.redhat.com/docs/DOC-1168290) it is critical that you ensure your component/image names match as described in the bulleted criteria
1. Ensure a single successful build is run (sync with ART to confirm)
1. Open the PR to add your new image to another component (your operator, usually)
1. Once the PR is merged, verify that the [nightly builds](https://openshift-release.apps.ci.l2s4.p1.openshiftapps.com/) continue to pass (usually 2-3 hours after your PR merges) and that you didn’t break the OCP CI test

### Removing or renaming an image from an OpenShift release image

Sometimes we rename or remove images from a given release.  To rename an image you must generally perform the following:

1. Open but do not merge PRs to
    1. `openshift/release` to change the name you create
    1. to components that reference that image (in `image-references`)
    1. to `ocp-build-data` to change the name that ART will publish as
1. Once all PRs are reviewed and the new name is approved
    1. merge the `openshift/release` PR
    1. If this breaks, revert the `openshift/release` PR and delete the `NEW_NAME` `ImageStreamTag`
1. Merge the `ocp-build-data` PR and wait until a build succeeds and it is published to the `4.$VERSION-art-latest` `ImageStream` at `NEW_NAME`
1. Merge the component PRs
1. Verify that all components build and a new CI release image is built and succeeds
1. Locally test that removing the component succeeds.  Run
    * `oc adm release new --from-image-stream 4.2 -n ocp --exclude=OLD_NAME`
1. Get someone from ART or a release architect to delete the image stream tag for the old component name: `oc delete istag -n ocp 4.$VERSION:OLD_NAME`
    1. This should trigger a new CI release image job - ensure it passes
