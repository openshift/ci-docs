---
title: "Contributing CI Configuration to the openshift/release Repository"
description: How to self-service contribute or change configuration for jobs or the broader CI system.
---

The [openshift/release](https://github.com/openshift/release) repository holds CI configuration for OpenShift component
repositories (for both OKD and OCP) and for many repositories that interact with OpenShift, like operators. The
repository also contains manifests and configuration for various services that together form the OpenShift CI system.

# Pull Requests

The `openshift/release` repository contains plenty of different types of configuration with various impact and different
owners. This section provides the main guidelines for filing and merging pull requests to this repository.

## Reviews and Approvals

This repository heavily uses Prow review and approval plugins together with code ownership as encoded in `OWNERS` files.
Although the repository's root `OWNERS` is the DPTP team, specific content may be owned by different people or teams.
After a PR is filed, the bot assigns two reviewers who should be suitable to review the PR and are expected to do so.
These people are also the ones to bug when a PR sits there without a review. Teams are expected to own their CI config,
including reviews, and therefore `OWNERS` file presence is enforced for some sections of the repository.

During the PR lifetime, the bot maintains a comment that summarizes the pull request's approval status, including the
links to the `OWNERS` files whose members need to approve the PR. Please pay attention to this comment when asking for
approvals.

Due to the pull request volume in the repository, DPTP team members review the pull requests asynchronously when
assigned by a bot. Please do not expect a PR to be reviewed immediately. Unless urgent, do not ping about reviews via
Slack. If a PR sits unreviewed for more than a day, ping via GitHub first via a mention. If a pull request spends some
time in WIP or draft state, it is helpful to mention the reviewers when the PR is ready for review.

## Checks

### Formatting and Generated Content

Parts of the repository content are partially or entirely managed by automation , and there are checks in place,
enforcing that the repo stays consistent with respect to this automation. When these checks fail, they usually advise
how to run the tooling (using containers) to bring the repo to the desired state:

{{< highlight make >}}
...
ERROR: This check enforces Prow Job configuration YAML file format (ordering,
ERROR: linebreaks, indentation) to be consistent over the whole repository. We have
ERROR: automation in place that manipulates these configs and consistent formatting
ERROR: helps reviewing the changes the automation does.

ERROR: Run the following command to re-format the Prow jobs:
ERROR: $ make jobs
{{< / highlight >}}

While there are individual `make` targets for different parts of the repository, it is easiest to run the `make` `update`
that runs all these tools before a pull request submission:

{{< highlight make >}}
$ make update
make jobs
docker pull registry.ci.openshift.org/ci/ci-operator-prowgen:latest
docker run --rm <...> registry.ci.openshift.org/ci/ci-operator-prowgen:latest <...>
docker pull registry.ci.openshift.org/ci/sanitize-prow-jobs:latest
docker run --rm <...> registry.ci.openshift.org/ci/sanitize-prow-jobs:latest <...>
make ci-operator-config
docker pull registry.ci.openshift.org/ci/determinize-ci-operator:latest
docker run --rm -v <...> registry.ci.openshift.org/ci/determinize-ci-operator:latest <...>
make prow-config
docker pull registry.ci.openshift.org/ci/determinize-prow-config:latest
docker run --rm <...> registry.ci.openshift.org/ci/determinize-prow-config:latest <...>
make registry-metadata
docker pull registry.ci.openshift.org/ci/generate-registry-metadata:latest
<...>
docker run --rm -v <...> registry.ci.openshift.org/ci/generate-registry-metadata:latest <...>
{{< / highlight >}}

### Rehearsals

In addition to the "normal" checks executed against pull requests on `openshift/release`, so-called "rehearsals" trigger
whenever a pull request would affect one or more CI jobs. Jobs affected by such PR are executed as if run against a
target component repository after the changes would be merged. This provides pull request authors early feedback about
how config changes impact CI setup.

#### Reheare a job on another cluster

The [dynamic scheduler](https://docs.ci.openshift.org/docs/internals/dynamic-scheduling/) automatically defines the cluster on which the job will run, and does not always honor the `cluster` field. We can work around this by changing the `cluster` and the job `name` fields to manually create a cache miss in order for the `cluster` field to be honored.

> _The `name` change is a temporary workaround only to run rehearsals and doesn't need to be merged after the rehearsals are completed._

#### External Prow Plugin

All pull requests trigger a `pj-rehearse` external prow plugin. It checks the changes in a pull request and comments a list of jobs that are relevant to them. It also supplies directions for interacting with itself. The user can comment, one or more of the following commands, in either the PR body or as a seperate comment:
* `/pj-rehearse` to run up to 10 rehearsal jobs from the list
* `/pj-rehearse {test-name}` rehearse, one or more, specific jobs from the list of affected jobs. See [Rehearse Specific Jobs](#rehearse-specific-jobs) for more info.
* `/pj-rehearse auto-ack` to run up to 10 rehearsal jobs, and automatically apply the `rehearsals-ack` label if they all succeed
* `/pj-rehearse more` to run up to 20 rehearsal jobs from the list
* `/pj-rehearse max` to run up to 35 rehearsal jobs from the list
* `/pj-rehearse abort` to abort all active rehearsals
* `/pj-rehearse skip` to opt-out of rehearsals for the PR, and add the `rehearsals-ack` label
* `/pj-rehearse ack` to acknowledge the rehearsals (pass or fail), and add the `rehearsals-ack` label
* `/pj-rehearse reject` to remove the `rehearsals-ack` label and re-block merging

Once the `rehearsals-ack` label is present on the PR it will be able to be merged provided that all additional merge criteria are met. If a new push is made to a PR the label will be removed, and need to be reapplied using either `/pj-rehearse ack` or `/pj-rehearse skip` prior to merge.

##### Rehearse Specific Jobs
It is possible to **only** rehearse specific, affected jobs from a PR. This can be done by commenting `/pj-rehearse` followed by a, space separated, list of one or more jobs. These job names can be found in the list that the plugin comments on the PR upon creation. Note that the job must be found to be affected by the change in the PR in order to be rehearsed. For example:
* `/pj-rehearse a-unit-test-job` will rehearse only the job named 'a-unit-test-job'
* `/pj-rehearse a-unit-test-job some-other-test` will trigger rehearsals for both: 'a-unit-test-job' and 'some-other-test'

#### Rehearsal Logic
When the plugin is asked to rehearse it submits rehearsal jobs for execution and will report to the pull request
the results via the GitHub contexts named with the `ci/rehearse/$org/$repo/$branch/$test` pattern.
The rehearsal jobs do not block merges. 
This allows merging changes to CI configuration that affect jobs that fail for reasons
unrelated to the change (like flakes or infrastructure issues). Also, merging a failing job can be useful when it gives
correct signal so that such merge can be followed up in the target repo with a pull request fixing the failing job.

The following changes are considered when triggering rehearsals:

1. Changes to Prow jobs themselves (`ci-operator/jobs`)
1. Changes to `ci-operator` configuration files (`ci-operator/config`)
1. Changes to multi-stage steps (`ci-operator/step-registry`)
1. Changes to cluster profiles (`cluster/test-deploy`)

Rerunning rehearsals can be done by re-triggering the plugin: `/pj-rehearse`, which then triggers all rehearsals of jobs currently
affected by the PR, including the rehearsals that passed before. Individual rehearsals can also be re-triggered by utilizing the [Rehearse Specific Jobs](#rehearse-specific-jobs) functionality.

Certain changes affect many jobs. For example, when a template or a step used by many jobs is changed, in theory all
these jobs could be affected by the change, but it is unrealistic to rehearse them all. In some of these cases,
rehearsals samples from the set of affected jobs. Unfortunately, the sampled jobs are sometimes not stable between
retests, so it is possible that in a retest, different jobs are selected for rehearsal than in the previous run. In this
case, results from the previous runs stay on the pull request and, unless they are individually re-triggered,
they cannot be rid of. This is especially inconvenient when these "stuck" jobs failed. Rehearsals do not block merges,
so these jobs do not prevent configuration changes from merging, but they can lead to confusing situations.

#### Marking a Job as "Rehearsable"
Only the jobs with `pj-rehearse.openshift.io/can-be-rehearsed: "true"` label are rehearsed. 
Handcrafted jobs can opt to be rehearsable by including this label.
All presubmits and periodics generated by `make jobs` have this label by default. Generated postsubmits will not contain 
it because generated postsubmits are used for promoting `images`. 

In order to opt-out of rehearsals for generated presubmits and periodics, prowgen must be configured to disable rehearsals. 
To do this your org or repo's `.config.prowgen` file can be configured to either disable **all** rehearsals:

{{< highlight yaml >}}
rehearsals:
    disable_all: true
{{< / highlight >}}

Or to disable them for specific tests:

{{< highlight yaml >}}
rehearsals:
    disabled_rehearsals:
    - unit # only disable rehearsals on the job named "unit"
{{< / highlight >}}

Either of the preceding configurations will result in the `pj-rehearse.openshift.io/can-be-rehearsed: "true"` label not 
being added to the affected jobs when running `make jobs`.

{{< alert title="Warning" color="warning" >}}
Jobs that are marked as `hidden: true` will never be rehearsed, regardless of the presence of the `pj-rehearse.openshift.io/can-be-rehearsed: "true"` label.
{{< /alert >}}


## Component CI Configuration

As an owner of a repository for which you want to maintain CI configuration in `openshift/release`, you mostly need to
interact with the following locations:

* `ci-operator/config/$org/$repo/$org-$repo-$branch.yaml`: contains your `ci-operator` definition, which describes how the
  `images` and tests in your repo work.
* `ci-operator/jobs/$org/$repo/$org-$repo-$branch-(presubmits|postsubmits|periodics).yaml`: contains Prow job
  definitions for each repository that are run on PRs, on merges, or periodically. In most cases, these files are
  generated from the `ci-operator` configuration, and you do not need to touch them. There are exceptions to this, which are
   described below.
* `core-services/prow/02_config/_{config,plugins}.yaml`: contains the configuration for Prow, including
  repository-specific configuration for automated merges, plugin enablement and more. This configuration is usually set
  up once when a repository is on-boarded, and then rarely needs to be changed.

# Adding CI Configuration for New Repositories

When adding CI configuration for new repositories, instead of manually modifying the files in the locations described
above or copy-pasting existing configuration for other repos, you should use the `make new-repo` target. It walks you
through the necessary steps and generates the configuration for you:

{{< highlight make >}}
make new-repo
docker pull registry.ci.openshift.org/ci/repo-init:latest
<...>
docker run --rm -it <...> registry.ci.openshift.org/ci/repo-init:latest --release-repo <...>
Welcome to the repository configuration initializer.
In order to generate a new set of configurations, some information will be necessary.

Let's start with general information about the repository...
Enter the organization for the repository: openshift
Enter the repository to initialize: new-repo-example
Enter the development branch for the repository: [default: master]

Now, let's determine how the repository builds output artifacts...
Does the repository build and promote container `images`?  [default: no] yes
Does the repository promote `images` as part of the OpenShift release?  [default: no] yes
Do any `images` build on top of the OpenShift base image?  [default: no] yes
Do any `images` build on top of the CentOS base image?  [default: no] no

Now, let's configure how the repository is compiled...
What version of Go does the repository build with? [default: 1.13] 1.15
[OPTIONAL] Enter the Go import path for the repository if it uses a vanity URL (e.g. "k8s.io/my-repo"):
[OPTIONAL] What commands are used to build binaries in the repository? (e.g. "go install ./cmd/...") `make` awesome
[OPTIONAL] What commands are used to build test binaries? (e.g. "go install -race ./cmd/..." or "go test -c ./test/...") `make` awesome-test
{{< / highlight >}}

## `ci-operator` Configuration

The `ci-operator` configuration files for a repository live in `ci-operator/config/$org/$repo` directories. For details
about the configuration itself, see this [document](https://steps.ci.openshift.org/ci-operator-reference). There is a
separate configuration file per branch, and the configuration files follow the `$org-$repo-$branch.yaml` pattern:

{{< highlight make >}}
$ ls -1 ci-operator/config/openshift/api/
openshift-api-master.yaml
openshift-api-release-3.11.yaml
openshift-api-release-4.1.yaml
openshift-api-release-4.2.yaml
openshift-api-release-4.3.yaml
openshift-api-release-4.4.yaml
openshift-api-release-4.5.yaml
openshift-api-release-4.6.yaml
openshift-api-release-4.7.yaml
OWNERS
{{< / highlight >}}

For the repositories involved in the [Centralized Release Branching and Config
Management](https://docs.google.com/document/d/1USkRjWPVxsRZNLG5BRJnm5Q1LSk-NtBgrxl2spFRRU8/edit#heading=h.3myk8y4544sk),
(this includes all OCP components and some others, see the linked document for details) the configuration for release
branches for the future releases are managed by automation and should not be changed or added by humans.

## Feature Branches

Any branch whose name matches a `$base-$suffix` pattern, where `$base` is a branch with a `ci-operator` configuration
file, is considered a "feature branch". Pull requests to feature branches trigger the same CI `presubmit` jobs (but not
postsubmits) like configured for the base branch, without any additional configuration. This also means that such
"feature branches" cannot have a separate, different `ci-operator` configuration. For example, if a repo has an
`org-repo-release-2.0.yaml` config (specifying CI config for the `release-2.0` branch of that repository), the same CI
presubmits will trigger on pull requests to a `release-2.0-feature` branch, and the repo cannot have an
`org-repo-release-2.0-feature.yaml` configuration file. It can still have a separate `org-repo-release-2.0.1.yaml` file,
because branches are only considered to be feature branches if their suffix is separated from the base name with `-`
separator (so `release-2.0-bump` is a feature branch of `release-2.0`, but `release-2.0.1` is not).

## Variants

It is possible to have multiple `ci-operator` configuration files for a single branch. This is useful when a component
needs to be built and tested in multiple different ways from a single branch. In that case, the additional configuration
files must follow the `org-repo-branch__VARIANT.yaml` pattern (note the double underscore separating the branch from the
variant).

## Prowjob Configuration

Most jobs are generated from the `ci-operator` configuration, so the need to interact with actual Prowjob configuration
should be quite rare. Modifying the Prowjob configuration is discouraged unless necessary, and can result in increased
fragility and maintenance costs.

### Tolerated Changes to Generated Jobs

Generated jobs are enforced to stay in the generated form, so when you attempt to change them, a check will fail on the
pull requests, requiring the jobs to be regenerated and changed back. However, the generator tolerates these
modifications to allow some commonly needed customizations:

|Field | Description |Presubmit |Postsubmit|Periodic|
|:---|:---|:---|:---|:---|
|`.always_run` | 	Set to `false` to disable automated triggers of the job on pull requests.|✓|||
|`.run_if_changed`|Set to trigger the job based on the set of files changed by PRs (see the [documentation](https://docs.prow.k8s.io/docs/jobs#triggering-jobs)).|✓|✓||
|`.skip_if_only_changed`|Set to trigger the job based on the set of files changed by PRs (see the documentation link above).|✓|✓||
|`.skip_report`|Set to `true` to `make` the job not report its result to the pull request.|✓|||
|`.max_concurrency`|Set to limit how many instances of the job can run simultaneously.|✓|✓|✓|
|`.reporter_config`|Add this stanza to configure Slack alerts (see the [upstream doc](https://docs.prow.k8s.io/docs/components/core/crier#slack-reporterhttpsgithubcomkubernetestest-infratreemasterprowcrierreportersslack)).|||✓|

### The Cluster Where A Job Runs
In general, a job can be executed on any build farm clusters.
There are automations that dispatch the jobs among the clusters to keep the workload even and fail the jobs over to others upon a cluster's outage.
For most cases, the test owners should not be aware of any difference if a job is moved from one cluster to another.

Although the `cluster` field in a `test` or `step` could be used to specify where it runs, it is **not** recommended to use it
as it would block the automations from searching for any cluster to run the corresponding job even if the underlying cluster is completely available.
The `cluster` field fits the use cases that the job does not work in any other cluster because the job has the restrictions e.g., on the hardware of the cluster and as a result failover would not be possible in the first place.


{{< alert title="Warning" color="warning" >}}
Nightly jobs run using the [release-controller](https://github.com/openshift/release-controller) do **not** honor the `cluster` setting. They have their own [load balancing system](https://github.com/sshnaidm/release-controller/blob/6b7f7b2e92f49d417ce54ec7b037fbede09c2301/cmd/release-controller/sync_verify_prow.go#L26) which will set the cluster accordingly.
{{< /alert >}}

### Handcrafted Jobs

It is possible to add entirely handcrafted Prowjobs. The Prowjob configuration files' content is a YAML list, so adding
a job means adding an item to one of these lists. Creating handcrafted jobs assumes knowledge of Prow, takes you out of
the well-supported path, and is therefore discouraged. You are expected to maintain and fully own your handcrafted jobs.
