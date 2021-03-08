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
docker pull registry.svc.ci.openshift.org/ci/ci-operator-prowgen:latest
docker run --rm <...> registry.svc.ci.openshift.org/ci/ci-operator-prowgen:latest <...>
docker pull registry.svc.ci.openshift.org/ci/sanitize-prow-jobs:latest
docker run --rm <...> registry.svc.ci.openshift.org/ci/sanitize-prow-jobs:latest <...>
make ci-operator-config
docker pull registry.svc.ci.openshift.org/ci/determinize-ci-operator:latest
docker run --rm -v <...> registry.svc.ci.openshift.org/ci/determinize-ci-operator:latest <...>
make prow-config
docker pull registry.svc.ci.openshift.org/ci/determinize-prow-config:latest
docker run --rm <...> registry.svc.ci.openshift.org/ci/determinize-prow-config:latest <...>
make registry-metadata
docker pull registry.svc.ci.openshift.org/ci/generate-registry-metadata:latest
<...>
docker run --rm -v <...> registry.svc.ci.openshift.org/ci/generate-registry-metadata:latest <...>
{{< / highlight >}}

### Rehearsals

In addition to the "normal" checks executed against pull requests on `openshift/release`, so-called "rehearsals" trigger
whenever a pull request would affect one or more CI jobs. Jobs affected by such PR are executed as if run against a
target component repository after the changes would be merged. This provides pull request authors early feedback about
how config changes impact CI setup.

All pull requests trigger a `ci/prow/pj-rehearse` job that inspects the changes in the PR and detects affected jobs. It
then submits these jobs for execution, and they will report to the pull request results via the GitHub contexts named
with the `ci/rehearse/$org/$repo/$branch/$test` pattern. Both the "driver" job (`ci/prow/pj-rehearse`) and the individual
rehearsals do not block merges. This allows merging changes to CI configuration that affect jobs that fail for reasons
unrelated to the change (like flakes or infrastructure issues). Also, merging a failing job can be useful when it gives
correct signal so that such merge can be followed up in the target repo with a pull request fixing the failing job.

The following changes are considered when triggering rehearsals:

1. Changes to Prow jobs themselves (`ci-operator/jobs`)
1. Changes to `ci-operator` configuration files (`ci-operator/config`)
1. Changes to multi-stage steps (`ci-operator/step-registry`)
1. Changes to templates (`ci-operator/templates`)
1. Changes to cluster profiles (`cluster/test-deploy`)

The affected jobs are further filtered down so that jobs are only rehearsed when it is safe. Only the jobs with
`pj-rehearse.openshift.io/can-be-rehearsed: "`true`"` label are rehearsed. All presubmits and periodics generated by `make
jobs` have this label by default. Generated postsubmits will not contain it because generated postsubmits are used for
promoting `images`. Handcrafted jobs can opt to be rehearsable by including this label.

It is not possible to rerun individual rehearsal jobs. They do not react to any trigger commands. Rerunning rehearsals
must be done by rerunning the "driver" job: `ci/prow/pj-rehearse`, which then triggers all rehearsals of jobs currently
affected by the PR, including the rehearsals that passed before.

Certain changes affect many jobs. For example, when a template or a step used by many jobs is changed, in theory all
these jobs could be affected by the change, but it is unrealistic to rehearse them all. In some of these cases,
rehearsals samples from the set of affected jobs. Unfortunately, the sampled jobs are sometimes not stable between
retests, so it is possible that in a retest, different jobs are selected for rehearsal than in the previous run. In this
case, results from the previous runs stay on the pull request and because rehearsals cannot be individually triggered,
they cannot be rid of. This is especially inconvenient when these "stuck" jobs failed. Rehearsals do not block merges,
so these jobs do not prevent configuration changes from merging, but they can lead to confusing situations.

### `ci-operator` Configuration Sharding

The configuration files under `ci-operator/config` need to be stored in the CI cluster before jobs can use them. That is
done using the [updateconfig](https://github.com/kubernetes/test-infra/tree/master/prow/plugins/updateconfig) Prow
plugin, which maps file path globs to `ConfigMap`s.

Because of size constraints, files are distributed across several ConfigMaps based on the name of the branch they
target. Patterns for the most common names already exist in the plugin configuration, but it may be necessary to add
entries when adding a file for a branch with an unusual name. The
[`correctly-sharded-config`](https://prow.ci.openshift.org/job-history/gs/origin-ci-test/pr-logs/directory/pull-ci-openshift-release-master-correctly-sharded-config)
pre-submit job guarantees that each file is added to one (and only one) `ConfigMap`, and will fail in case a new entry is
necessary. To add one, edit the top-level `config_updater` key in the [plugin
configuration](https://github.com/openshift/release/blob/master/core-services/prow/02_config/_plugins.yaml). Most
likely, the new entry will be in the format:

{{< highlight yaml >}}
config_updater:
  # …
  maps:
    # …
    ci-operator/config/path/to/files-*-branch-name*.yaml:
      clusters:
        app.ci:
        - ci
      name: ci-operator-misc-configs
{{< / highlight >}}

The surrounding entries that add files to `ci-operator-misc-configs` can be used as reference. When adding a new glob,
be careful that it does not unintentionally match other files by being too generic.

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
docker pull registry.svc.ci.openshift.org/ci/repo-init:latest
<...>
docker run --rm -it <...> registry.svc.ci.openshift.org/ci/repo-init:latest --release-repo <...>
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

Any branch whose name has a prefix matching to any branch with a `ci-operator` configuration file is considered a "feature
branch". Pull requests to feature branches trigger the same CI `presubmit` jobs (but not postsubmits) like configured for
the base branch, without any additional configuration. This also means that such "feature branches" cannot have a
separate, different `ci-operator` configuration. For example, if a repo has an `org-repo-release-2.0.yaml` config
(specifying CI config for the `release-2.0` branch of that repository), the same CI presubmits will trigger on pull
requests to a `release-2.0.1` branch, and the repo cannot have an `org-repo-release-2.0.1`.yaml configuration file.

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
|`.run_if_changed`|Set a regex to `make` the job trigger only when a pull request changes a certain path in the repository.|✓|||
|`.optional`|Set to `true` to `make` the job not block merges.|✓|||
|`.skip_report`|Set to `true` to `make` the job not report its result to the pull request.|✓|||
|`.max_concurrency`|Set to limit how many instances of the job can run simultaneously.|✓|✓|✓|
|`.reporter_config`|Add this stanza to configure Slack alerts (see the [upstream doc](https://github.com/clarketm/kubernetes_test-infra/blob/master/prow/cmd/crier/README.md#slack-reporter)).|||✓|

### Handcrafted Jobs

It is possible to add entirely handcrafted Prowjobs. The Prowjob configuration files' content is a YAML list, so adding
a job means adding an item to one of these lists. Creating handcrafted jobs assumes knowledge of Prow, takes you out of
the well-supported path, and is therefore discouraged. You are expected to maintain and fully own your handcrafted jobs.
