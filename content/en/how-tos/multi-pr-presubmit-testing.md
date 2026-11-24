---
title: "Multi-PR Presubmit Testing"
description: Testing changes from multiple pull requests
---

## Testing Dependent Changes Prior to Merge
The `multi-pr-prow-plugin` allows for the merging and testing of changes from either the same or dependent repositories via triggering `presubmits` or `periodics`.
Including PRs from different component repositories is useful for the presubmit tests of OpenShift release payload. When mega change from a single repository is divided into several small PRs, this plugin also helps test them together.

### Prerequisites
In order to utilize the plugin, you must ensure that it is added to your org or repo configuration as in the `openshift` [_pluginconfig.yaml](https://github.com/openshift/release/blob/29721a824a755f2ec8b2e3cd94f7d4ac35a2a4b6/core-services/prow/02_config/openshift/_pluginconfig.yaml#L41-L44).

### /testwith Command
The `/testwith` command can be utilized to trigger the presubmit tests. The basic structure is as follows:
```
/testwith <org>/<repo>/<branch>/<?variant>/<test-name> [<org>/<repo>#<number> ...]
```
The command accepts one required test selector and an optional list of additional PR references:
1. The first argument contains the: `org`, `repo`, `branch`, optionally `variant`, and `test-name` (the `as` in the ci-operator config).
2. Zero to twenty additional PR references can follow, each in `<org>/<repo>#<number>` format, to include additional changes in the code under test.

When this command is issued in a comment on a PR, the plugin automatically includes that PR, along with any additional PRs specified in the command. You do not need to repeat the originating PR as an argument.

The specified test does not require an included PR in its repository. If an included PR targets the test's repository and branch, the plugin uses that PR-backed source reference. Otherwise, it uses the requested branch at its resolved commit SHA, without PR changes in that repository, and retains the included PRs as additional source references. If you need to test changes through a release payload, use the `/payload` [command](/release-oversight/pull-request-testing/#payload) instead.

Including a PR makes its sources available to the job. Whether a test exercises those changes depends on the build and dependency configuration; including sources alone does not establish that they are consumed by the test.

The plugin will trigger the test, and then create a GitHub [check_run](https://docs.github.com/en/rest/checks/runs?apiVersion=2022-11-28) to track its progress and provide a link to the `spyglass` logs within it. This check run is **never** required to succeed in order to merge the originating PR.

#### Examples
The following command would trigger the `e2e` test from the `openshift/kubernetes` `master` configuration against sources built from: the originating PR, `openshift/kubernetes#1234`, and `openshift/installer#999`:
```
/testwith openshift/kubernetes/master/e2e openshift/kubernetes#1234 openshift/installer#999
```

#### Abort Active Multi-PR Presubmits
In order to abort all active multi-pr presubmit jobs for a given _orign_ PR, the command: `/testwith abort` can be utilized.
