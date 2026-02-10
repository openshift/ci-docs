---
title: "Retester"
description: An overview of the retester implementation.
---
## What Is Retester?
Retester is a tool that evaluate which pull requests should be retested, and then retest 
by [@openshift-ci-robot](https://github.com/openshift-ci-robot) 's commenting `/retest-required` on the pull requests.

## How Do We Set up Retester?
Retester completely reuses [`tide`](https://docs.prow.k8s.io/docs/components/core/tide/)
configuration, whatever onboards to Tide, gets onboarded to retester too.
Retester is aware of Prow and the concept of optional and required jobs. It only triggers retests on PRs 
where at least one required Prow job is failing.

We can enable the retester on a repository or for the entire organization in [its configuration file](https://github.com/openshift/release/blob/main/core-services/retester/_config.yaml).

### Config file
There are 3 levels of policy in the configuration file: retester (global), org, repo. If a field of policy is defined at two levels, the value at the more specific level precedes. The values in the more generic level are inherited if they are not defined in the more specific level.

```yaml
`enabled`:
  - `true`: enable retester
  - `false`: disable retester
  - not defined: use the value in the above level
`max_retests_for_sha_and_base`: the number of retesting for each sha and base
`max_retests_for_sha`: the number of retesting for each sha
```

Retests are paused after `max_retests_for_sha_and_base` attempts against one base/PR HEAD combination, and the PR is explicitly held (`/hold`) after `max_retests_for_sha` retests of a single PR HEAD.
