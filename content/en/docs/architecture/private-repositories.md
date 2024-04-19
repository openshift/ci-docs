---
title: "Private Repositories and Fixing Embargoed CVEs"
description: An overview of the workflows surrounding embargoed CVEs and private repository forks.
---

OpenShift CI supports setting up CI jobs for private repositories mainly to allow temporary non-public development on
the forks of the otherwise public repositories. The CI jobs executed for these forks are not shown in the public Deck
instance, and all their artifacts are not public. Access to these jobs is limited to engineers who need it.

Unfortunately, such access cannot be granted to developers of other private repositories. Therefore, OpenShift CI only
allows setting up public CI jobs for private repositories -- the logs and artifacts executed for such private repository
will be public. **Only set up such jobs when you are absolutely sure your jobs would not leak any sensitive information.**

To allow the CI jobs to access a private repo, drop a following file to the directory in `openshift/release` holding the
`ci-operator` configuration for your repository (usually `ci-operator/config/$org/$repo`):

`.config.prowgen`
{{< highlight yaml >}}
private: true
expose: true
{{< / highlight >}}

## `openshift-priv` organization

The `openshift-priv` organization holds private forks of selected repositories. The purpose of these forks is to allow
temporary non-public development. Their presence, content, settings, and all CI configuration are managed automatically.

*Automated tools manage all CI configuration for repositories in openshift-priv organization. Humans should not change
any CI configuration related to these repositories. All manual changes to this configuration will be overwritten.*

### Involved Repositories

The set of repositories that are managed automatically in `openshift-priv` is dynamic and consists of the following two subsets:

1. Repositories with existing CI configuration promoting `images` to the `ocp/4.X` namespace (same criteria like for
   enrollment into the centralized release branch management)
1. Repositories explicitly listed in the
   [allowlist](https://github.com/openshift/release/blob/master/core-services/openshift-priv/_whitelist.yaml)

### Automation Architecture

When a repository is identified to be included in `openshift-priv` by having the appropriate promoting configuration or by
being present in the allowlist, the following jobs and tools maintain the existence, repository settings, repository
content, and all necessary CI configuration of the fork in `openshift-priv`:

1. The
   [periodic-auto-private-org-peribolos-sync](https://deck-internal-ci.apps.ci.l2s4.p1.openshiftapps.com/?job=periodic-auto-private-org-peribolos-sync)
   job runs the
   [private-org-peribolos-sync](https://github.com/openshift/ci-tools/tree/master/cmd/private-org-peribolos-sync) tool to
   maintain the GitHub settings for the fork. These settings are asynchronously consumed by the
   [periodic-org-sync](https://prow.ci.openshift.org/?job=periodic-org-sync) job running the
   [peribolos](https://github.com/kubernetes-sigs/prow/tree/main/cmd/peribolos) tool to create the fork on GitHub
   and maintain its settings
1. The
   [periodic-openshift-release-private-org-sync](https://deck-internal-ci.apps.ci.l2s4.p1.openshiftapps.com/?job=periodic-openshift-release-private-org-sync)
   job runs the [private-org-sync](https://github.com/openshift/ci-tools/tree/master/cmd/private-org-sync) tool to
   synchronize the `git` content of the fork with the source repository.
1. The [periodic-prow-auto-config-brancher](https://prow.ci.openshift.org/?job=periodic-prow-auto-config-brancher) runs
   the [`ci-operator-config-mirror`](https://github.com/openshift/ci-tools/tree/master/cmd/ci-operator-config-mirror) tool
   to create and maintain the CI configuration for the fork (`ci-operator` configuration files). The same job then generates
   the CI jobs from the `ci-operator` files. This has a caveat of not carrying over handcrafted (non-generated) jobs and also
   manual changes to the generated jobs.
1. The [periodic-prow-auto-config-brancher](https://prow.ci.openshift.org/?job=periodic-prow-auto-config-brancher) also
   runs the
   [private-prow-configs-mirror](https://github.com/openshift/ci-tools/tree/master/cmd/private-prow-configs-mirror) tool to
   mirror the repository-specific Prow configuration, like merging criteria, plugin enablement, etc.
