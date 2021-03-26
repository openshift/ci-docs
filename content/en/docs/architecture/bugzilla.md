---
title: "Bugzilla Integration"
description: An overview of the integration of Bugzilla with the Openshift CI
---

Many automated processes exist to help you navigate the OpenShift Bugzilla workflow when you're fixing a Bugzilla bug with a
GitHub Pull Request. Read up on the overall process [here][6] before diving into the specifics of automation.

## Linking Pull Requests to Bugzilla bugs

In order to declare that your pull request will fix a Bugzilla bug, all you need to do is add the bug number as a prefix to your pull
request title, like `Bug 123: Rest of the PR title`. A PR can at most reference one Bugzilla bug.

This will make the integration run a couple of validations. It will comment on GitHub with a detailed explanation of the
validations it ran and their result, so you can easily fix issues if needed. It will also add a label that indicates the success
of those validations to integrate with the merge automation.

You can always comment with `/bugzilla refresh` to re-run the validations. This is mostly useful if the Bugzilla bug was changed.

You can find a detailed list of the Bugzilla plugin settings for your repo in the [Prow Plugins][5] page by first selecting your
repository in the top left and then clicking on `details` of the Bugzilla plugin.

## Cherry Picking/Backporting

The Bugzilla automation can also assist in the backporting process by integrating with the cherry picking automation. To do an
automated cherry-pick, simply comment on GitHub `/cherrypick <<target-branch-name>>`. This will result in the PR being cherrypicked
onto `<<target-branch-name>>` after it merged and the new cherrypick-PR being assigned to you. After an automated cherry-pick was
created for a Pull Request that referenced a Bugzilla bug, the automation will clone the original bug with the new target release
and retitle the PR to correctly reference that new Bug. The new bug will also be marked as dependent on the original bug.

In order to get the backports to more then one past release right, you need to do it serially, i.E. cherrypick from the current release
to current-release-1, then from current-release-1 to current-release-2 and so on. This is important because a bugfix must always been
made in newer releases first, otherwise upgrades can lead to running into already-fixed bugs which should never happen.

You can use the [Bugzilla Backporter][8] app to see an overview of all clones and parents for a given bug and to create Bugzilla Bugs
before you are able to cherry-pick (i.E. before the original change merged).

## Integration with QE verification

Normally, QE will verify that a fix correctly resolves a Bugzilla bug once the bug transitions to the `ON_QA` state, which happens after
the PR merges and the release-controller has assembled a new release payload containing the code.

However, if a QE engineer is assigned to the Bugzilla bug, they will also get notified when a pull request is created to fix the bug. The
QE engineer can leave an approving review on the pull request to indicate that the fix has been verified before the PR even merges. In this case
when the nightly release containing the fix is accepted, the Bugzilla bug automatically transitions past the `ON_QE` state and into `VERIFIED`.

## Configuration

The configuration for the Bugzilla integration is versioned in the [openshift/release][0] repository.

Sample config overriding the `target_release` for the `release-4.6` branch of the openshift/ceph-csi repository:
{{< highlight yaml >}}
  orgs:
    openshift:
      # All bugs in all repos in the Openshift GitHub organization must have one of the following states, unless
      # a repo or branchconfiguration for valid_states exists.
      valid_states:
      - status: NEW
      - status: ASSIGNED
      - status: ON_DEV
      - status: POST
      repos:
        ceph-csi:
          # If we reference a bug in openshift/ceph-csi and that bug has a dependeng_bug, it must be in one of the following
          # states.
          dependent_bug_states:
          - status: MODIFIED
          - status: VERIFIED
          branches:
            release-4.6:
              # Bugs for PRs that target the release-4.6 branch in the openshift/ceph-csi repo must have OCS 4.6.0
              # as target_release.
              target_release: OCS 4.6.0
{{< / highlight >}}

A complete reference with all possible configuration options can be found [here][7].

[0]: https://github.com/openshift/release/blob/8568b711c7374cd765c75d3086c92140e21a49d8/core-services/prow/02_config/_plugins.yaml#L456-L799
[1]: https://github.com/openshift/release/blob/8568b711c7374cd765c75d3086c92140e21a49d8/core-services/prow/02_config/_plugins.yaml#L663-L667
[2]: https://github.com/openshift/release/blob/8568b711c7374cd765c75d3086c92140e21a49d8/core-services/prow/02_config/_plugins.yaml#L672
[3]: https://github.com/openshift/release/blob/8568b711c7374cd765c75d3086c92140e21a49d8/core-services/prow/02_config/_plugins.yaml#L656
[4]: https://github.com/openshift/release/blob/8568b711c7374cd765c75d3086c92140e21a49d8/core-services/prow/02_config/_plugins.yaml#L659-L660c
[5]: https://prow.ci.openshift.org/plugins
[6]: https://source.redhat.com/groups/public/atomicopenshift/atomicopenshift_wiki/openshift_bugzilla_process
[7]: https://github.com/kubernetes/test-infra/blob/96e55b3887c574f897052f722022ebe5acf35675/prow/plugins/plugin-config-documented.yaml#L49
[8]: https://bugs.ci.openshift.org/
