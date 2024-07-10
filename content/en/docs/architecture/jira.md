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

When backporting to more than one release, users may specify all releases they which to backport to separated by spaces
in their comment. For instance, if a bugfix needs to be backported to `release-4.15`, `release-4.14`, and `release-4.13`,
the comment `/cherrypick release-4.15 release-4.14 release-4.13` can be made. When this is done, the automation will create
a cherrypick for the first listed branch and include the remaining branches in the description. Once the new cherrypick is merged,
the next branch will be handled the same and so on, without need for further cherrypcik comments to be manually made.

Another option for backporting is the `/jira backport` command. This is similar to the above command but will instead
create all of the backport issues immediately and then queue the cherrypick bot to create all specified cherrypick
branches after the PR is merged, instead of one by one. This can be useful for repositories with very long running
tests, as the tests for all backports will start immediately once the original PR is merged. These individual PRs must
still be merged in the correct order. To be able to merge PRs for older releases after the release above it has merged,
you will need to run `/jira refresh` on the PR to have the PR be marked as containing a valid issue. The format for the
backport command is slightly different than the `/cherrypick` command, as instead of using spaces, the branches must be
comma separated.  And example of a valid command is `/jira backport release-4.15,release-4.14,release-4.13`.

If the `/cherrypick` command fails to run correctly due to conflicts, the Jira automation can still be used to assist in
backporting. After manually creating the cherrypick PR, you can comment `/jira cherrypick OCPBUGS-XXX` to cherrypick a
bug and link it to the PR. The automation will clone the provided bug and link the clone to the PR by adding it to the
beginning of the PR's title. This command also supports cherrypicking multiple bugs (e.g.  `/jira cherrypick
OCPBUGS-123,OCPBUGS-124`).

## Non-bug Jira References

Some repos or projects may wish to require PRs to have a valid Jira reference but not follow the full `OCPBUGS`
lifecycle management and use their own Jira project instead. The Jira automation can handle this as well. The issue must
be added as a prefix to the PR title as with the usual `OCPBUGS` issues. For instance, `PROJECT-123: fix this issue`. In
these scenarios, the only validation that the Jira automation will perform is validating that the issue exists. If the
issue exists, the PR will receive a `jira/valid-ref` label. If the issue does not exist, the PR will receive a
`jira/invalid-ref` label. This allows teams to gate PR merges to require a Jira reference to merge by requiring a label
to exist or not exist. However, some PRs may not require a jira reference. To add the `jira/valid-ref` label to a PR
without requiring a Jira reference, users can use the `NO-ISSUE` or `NO-JIRA` title prefixes. For instance, `NO-ISSUE:
fix a typo`.

Note: While Jira references do not get validated in the same way as `OCPBUGS` issues, the automation will still check
whether the issue's `Target Version` matches what is expected for the branch. If it does not match, the PR will still
get the `jira/valid-ref` label, but the mismatch will be mentioned in the comment that the automation makes on the PR.

## Integration with QE verification

Normally, QE will verify that a fix correctly resolves a Jira bug once the bug transitions to the `ON_QA` state, which
happens after the PR merges and the `release-controller` has assembled a new release payload containing the code.

However, if a QE engineer is assigned to the Jira bug, they will also get notified when a pull request is created to fix
the bug. The QE engineer can add the `qe-approved` label on the pull request to indicate that the fix has been verified
before the PR even merges. In this case, when the nightly release containing the fix is accepted, the Jira bug will
automatically transition from the `ON_QA` state to the `VERIFIED` state.

### Premerge Bugs

New features may also be tracked by QE via an `OCPBUGS` issue. In these situations, the PR is created before the bug, so
the PR will not contain a prefix when it is first created. Once QE creates a bug, they will need to retitle the PR using
the `retitle` GitHub comment command. For instance, if a bug is called `OCPBUGS-123` and the PR's current title is `Bug
Fix`, QE can update the title by commenting `/retitle OCPBUGS-123: Bug Fix` on the command. For PRs that have other bugs
already linked, the bugs are listed as comma-separated values. For instance, if the title is `PROJECT-123: Bug Fix`, QE
can commment `/retitle PROJECT-123,OCPBUGS-123: Bug Fix`.

Premerge bugs have different requirements and a different lifecycle than normal `OCPBUGS` issues, so they are treated as
jira references rather than full bugs. This means that the usual validations for `Target Version` and dependent bugs are
not run. For a bug to be considered a premerge bug, it must have `premerge` as a value in both its `Affects Version(s)`
and `Fix Version(s)` and the PR must be labelled as `qe-approved`. In these cases, the bugs will be immediately updated
to `POST` upon being linked to the PR and will then be updated to `VERIFIED` once the PR is merged (this is configurable
via the configuration file in the openshift/release repo and may change in the future if QE decides to use a different
workflow).

## Automatic Fix Version(s)

Another Jira automation that is part of the `release-controller` is the automatic setting of the `Fix Version(s)` field.
When a Jira issue lands in an `Accepted` nightly release, the automation will set the appropriate value for `Fix
Version(s)` to the issue and its parent Epic. It will also set the `Fix Version(s)` value to the parent Feature if every
Epic that is linked to the feature has had its `Fix Version(s)` field set. The value that is set will match the
`Major.Minor` version of the nightly that the issue is included in and the micro value will be `.0` if the release has
not become GA and `.z` if the release has become GA.

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
