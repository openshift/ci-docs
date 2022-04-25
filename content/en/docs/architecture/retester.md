---
title: "Retester"
description: An overview of the retester implementation.
---
## What Is Retester?
Retester is a tool that evaluate which pull requests should be retested, and then retest. 

## How Do We Set up Retester?
No configuration needed. Retester completely reuses [`tide`](https://github.com/kubernetes/test-infra/blob/master/prow/cmd/tide/README.md) configuration, whatever onboards to Tide,
 gets onboarded to retester too.
Retester is aware of Prow and the concept of optional and required jobs. It only triggers retests on PRs
 where at least one required Prow job is failing.

### General configuration

The following configuration fields are available:

* `dry-run`: Dry run for testing. Uses API tokens but does not mutate. Defaults to true.
* `run-once`: If true, run only once then quit. Defaults to false.
* `interval`: Parseable duration string that specifies the sync period. Defaults to 1h.
* `cache-file`: File to persist cache. No persistence of cache if not set. Defaults to not set.
* `cache-record-age`: Parseable duration string that specifies how long a cache record lives in cache after the last time it was considered. Defaults to 168h.
* `enable-on-repo`: Repository is saved in list. It can be used more than once, the result is a list of repositories where we start commenting instead of logging.

### Back-off
Retests are paused after three attempts against one base/PR HEAD combination, and the PR is explicitly held (`/hold`) after nine retests of a single PR HEAD.