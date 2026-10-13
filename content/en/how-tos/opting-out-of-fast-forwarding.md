---
title: "Opting Out of Fast-Forwarding from release-5.0 to release-4.23"
description: How optional operator teams can opt out of automated fast-forwarding from release-5.0 to release-4.23 and maintain the release-4.23 branch independently.
---

This document describes how optional operator teams can opt out of the automated fast-forwarding
that keeps `release-4.23` in sync with `release-5.0`. After opting out, your team is responsible
for maintaining the `release-4.23` branch directly.

## Background

The `repo-brancher-controller` (source in [openshift/ci-tools](https://github.com/openshift/ci-tools/tree/main/cmd/repo-brancher-controller/))
automatically fast-forwards content between release branches. Under the current configuration,
`release-5.0` is forwarded to `release-4.23` so that both branches stay in sync without manual
intervention. Direct merges to fast-forwarded branches are blocked by CI.

Some optional operator teams need to ship different content on the `release-4.23` branch than what
lands on `release-5.0`. For these teams, the forwarding can be disabled by adding the repository
to the controller's ignore list.

{{< alert title="Important" color="warning" >}}
Opting out is **all-or-nothing**. There is no partial forwarding mode — once you opt out,
no content from `release-5.0` is forwarded to `release-4.23` for your repository. Your team
becomes solely responsible for maintaining the `release-4.23` branch, including backporting
any fixes that should appear in both branches.
{{< /alert >}}

## Timeline

The branch cut is scheduled for **August 14, 2026**. The behavior differs before and after the cut:

### Before branch cut

| Branch | Forwards to | Direct merges |
|-|-|-|
| `main` | `release-5.0` and `release-4.23` | blocked on release branches |
| `release-5.0` | `release-4.23` | blocked |

### After branch cut

| Branch | Behavior |
|-|-|
| `main` | opens for 5.1 development |
| `release-5.0` | detaches from `main`; accepts direct merges |
| `release-4.23` (opted-out repos) | accepts direct merges; your team maintains it |
| `release-4.23` (default repos) | still fast-forwarded from `release-5.0` |

## How to opt out

### 1. Locate the forwarding configuration

The forwarding configuration lives in the
[openshift/release](https://github.com/openshift/release) repository at:

{{< highlight text >}}
clusters/app.ci/repo-brancher-controller/repo-brancher-controller.yaml
{{< / highlight >}}

Inside that file, a `ConfigMap` contains the controller's `config.yaml`. The section you need to
modify is `release_branches`, which controls forwarding between release branches.

### 2. Add your repository to the ignore list

Find the `release_branches` section and add your org/repo to the `ignore` list under the
appropriate `forward` block. For most optional operators, this is the `family: release` block
with `source: "5.0"` and `target: "4.23"`:

{{< highlight yaml >}}
release_branches:
  - source: "5.0"
    forward:
      - family: release
        targets:
          - "4.23"
        ignore:
          - org: Azure
            repo: ARO-HCP
          - org: openshift-eng
          # Add your repository here:
          - org: your-github-org
            repo: your-repo-name
{{< / highlight >}}

### 3. Submit a pull request

Submit a pull request to [openshift/release](https://github.com/openshift/release) with this
change. Once the PR merges, the configuration is **hot-reloaded** — no controller restart is
needed. Forwarding for your repository will stop on the next cycle.

## Ignore list matching

Each entry in the `ignore` list can match on any combination of the following fields:

| Field | Effect |
|-|-|
| `org` | Matches all repositories in the given GitHub organization |
| `repo` | Matches a specific repository (must be combined with `org`) |
| `source` | Matches forwarding from a specific source branch version |
| `target` | Matches forwarding to a specific target branch version |

For example, to ignore an entire organization:

{{< highlight yaml >}}
ignore:
  - org: my-org
{{< / highlight >}}

To ignore a single repository:

{{< highlight yaml >}}
ignore:
  - org: openshift
    repo: my-operator
{{< / highlight >}}

When both an `only` (allowlist) and an `ignore` (blocklist) entry match a repository,
**`ignore` wins** and the repository is excluded from forwarding.

## What happens after opting out

Once your repository is on the ignore list and the change has merged:

1. The `repo-brancher-controller` stops fast-forwarding `release-5.0` to `release-4.23` for
   your repository.
2. CI no longer blocks direct merges to `release-4.23` on your repository (after branch cut).
3. Your team is responsible for cherry-picking or merging any changes that should appear on
   `release-4.23`.

{{< alert title="Warning" color="warning" >}}
Once you opt out, there is no automated mechanism to keep `release-4.23` up to date with
`release-5.0`. If a critical fix lands on `release-5.0`, your team must manually apply it
to `release-4.23`.
{{< /alert >}}

## Tracking

This process is tracked under [DPTP-4980](https://issues.redhat.com/browse/DPTP-4980). If you
have questions or run into issues, reach out on the `#forum-ocp-crt` Slack channel or comment
on the tracking issue.
