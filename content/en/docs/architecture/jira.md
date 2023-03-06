---
title: "Jira Integration"
description: An overview of the integration of Jira with the Openshift CI
---

Many automated processes exist to help you navigate the OpenShift Jira workflow when you're fixing a Jira bug with a
GitHub Pull Request. Read up on the overall process [here][1] before diving into the specifics of automation. There is
also a more general overview of the process in this [Google Doc][3].

## Linking Pull Requests to Jira bugs

In order to declare that your pull request will fix a Jira bug, the issue key must be added as a prefix to the pull
request title, like `OCPBUGS-123: Rest of the PR title`. To link multiple bugs to a single PR, list the bugs separated
by commas, like `OCPBUGS-123,OCPBUGS-124: Rest of the PR title`.

This will make the integration run a couple of validations. It will comment on GitHub with a detailed explanation of the
validations it ran and their result, so you can easily fix issues if needed. It will also add a label that indicates the
success of those validations to integrate with the merge automation.

To rerun the validations, comment `/jira refresh` on the PR. This is mostly useful if the Jira bug was changed.

All Openshift bugs must be made in the `OCPBUGS` project. For PRs referencing issues from other projects, a link will be
created but the rest of the lifecycle management will not be performed for the issue.

## Cherrypicking/Backporting

The Jira automation can also assist in the backporting process by integrating with the cherrypicking automation. To
trigger an automated cherrypick, make a comment on the PR in this format: `/cherrypick <<target-branch-name>>`. This
will result in the PR being cherrypicked onto `<<target-branch-name>>` after it merges and the new cherrypick PR will be
assigned to you. After an automated cherrypick is created for a Pull Request that references a Jira bug, the automation
will clone the original bug with the new target release and retitle the PR to correctly reference that new bug. The new
bug will also be marked as dependent on the original bug.

In order to backport a bugfix to more then one past release, it must be done serially (i.e. cherrypick from the
`current-release` to `current-release - 1`, then from `current-release - 1` to `current-release - 2`, and so on). This
is important because a bugfix must always been made in newer releases first, otherwise openshift cluster upgrades can
lead to running into already fixed bugs which should never happen.

If the `/cherrypick` command fails to run correctly due to conflicts, the Jira automation can still be used to assist in
backporting. After manually creating the cherrypick PR, you can comment `/jira cherrypick OCPBUGS-XXX` to cherrypick a
bug and link it to the PR. The automation will clone the provided bug and link the clone to the PR by adding it to the
beginning of the PR's title. This command also supports cherrypicking multiple bugs (e.g.  `/jira cherrypick
OCPBUGS-123,OCPBUGS-124`).

## Integration with QE verification

Normally, QE will verify that a fix correctly resolves a Jira bug once the bug transitions to the `ON_QA` state, which
happens after the PR merges and the `release-controller` has assembled a new release payload containing the code.

However, if a QE engineer is assigned to the Jira bug, they will also get notified when a pull request is created to fix
the bug. The QE engineer can add the `qe-approved` label on the pull request to indicate that the fix has been verified
before the PR even merges. In this case, when the nightly release containing the fix is accepted, the Jira bug will
automatically transition from the `ON_QA` state to the `VERIFIED` state.

## Configuration

The configuration for the Jira integration can be found in the [openshift/release][0] repository.

Sample config overriding the `target_version` for the `release-4.6` branch of the openshift/ceph-csi repository:
{{< highlight yaml >}}
  orgs:
    openshift:
      validate_by_default: true
      # All bugs in all repos in the Openshift GitHub organization must have one of the following states, unless
      # a repo or branchconfiguration for valid_states exists.
      valid_states:
      - status: NEW
      - status: ASSIGNED
      - status: ON_DEV
      - status: POST
      repos:
        ceph-csi:
          # If we reference a bug in openshift/ceph-csi and that bug has a dependent_bug, it must be in one of the following
          # states.
          dependent_bug_states:
          - status: MODIFIED
          - status: VERIFIED
          branches:
            release-4.8:
              # Bugs for PRs that target the release-4.8 branch in the openshift/ceph-csi repo must have OCS 4.6.8
              # as target_version.
              target_version: OCS 4.6.8
              validate_by_default: true
{{< / highlight >}}

The file defining all of the possible configuration options can be found [here][2].

[0]: https://github.com/openshift/release/blob/master/core-services/jira-lifecycle-plugin/config.yaml
[1]: https://source.redhat.com/groups/public/atomicopenshift/atomicopenshift_wiki/openshift_bugzilla_process
[2]: https://github.com/openshift-eng/jira-lifecycle-plugin/blob/main/cmd/jira-lifecycle-plugin/config.go
[3]: https://docs.google.com/document/d/1sxuq3f3dzhjt8mqYGL5_K4-2avhQwWC7gjEfZoABfEE/edit
