---
title: "Multi-PR Presubmit Testing"
description: Testing changes from multiple pull requests
---

## Testing Dependent Changes Prior to Merge
The `multi-pr-prow-plugin` allows for the merging and testing of changes from either the same or dependent repositories via triggering `presubmits`.

### Prerequisites
In order to utilize the plugin, you must ensure that it is added to your org or repo configuration as in the `openshift` [_pluginconfig.yaml](https://github.com/openshift/release/blob/29721a824a755f2ec8b2e3cd94f7d4ac35a2a4b6/core-services/prow/02_config/openshift/_pluginconfig.yaml#L41-L44).

### /testwith Command
The `/testwith` command can be utilized to trigger the presubmit tests. The basic structure is as follows:
```
/testwith <org>/<repo>/<branch>/<?variant>/<test-name> [<org>/<repo>#<number>]+
```
As shown above this command expects two arguments: 
1. The first argument contains the: `org`, `repo`, `branch`, optionally `variant`, and `test-name` (the `as` in the ci-operator config).
2. The second argument can be included up to twenty times, and specifies an additional PR to include in the code under test in `<org>/<repo>#<number>` format.

Given this command, the plugin will include the PR that the comment originates from, as well as each additional PR in the built sources for which the specified test will run against.
Note that it is required for at least one of the included PRs to originate from the same repo as the requested test. Otherwise, the test wouldn't be actually testing any of the included changes. If you think you need this, you probably want to try the `/payload` [command](/docs/release-oversight/pull-request-testing/#payload) instead.

The plugin will trigger the test, and then create a GitHub [check_run](https://docs.github.com/en/rest/checks/runs?apiVersion=2022-11-28) to track its progress and provide a link to the `spyglass` logs within it. This check run is **never** required to succeed in order to merge the originating PR.

#### Examples
The following command would trigger the `e2e` test from the `openshift/kubernetes` `master` configuration against sources built from: the originating PR, `openshift/kubernetes#1234`, and `openshift/installer#999`:
```
/testwith openshift/kubernetes/master/e2e openshift/kubernetes#1234 openshift/installer#999
```
