---
title: "Retester"
description: An overview of the retester implementation.
---
## What Is Retester?
Retester is a tool that evaluate which pull requests should be retested, and then retest 
by [@openshift-ci-robot](https://github.com/openshift-ci-robot) 's commenting `/retest-required` on the pull requests.

{{< alert title="Info" color="info" >}}
The old retester is implemented by a periodic job [periodic-retester](https://github.com/openshift/release/blob/05dd9a1ab5881e55165a0cc0f40d5513e2e2fd11/ci-operator/jobs/infra-periodics.yaml#L260-L300) which uses a GitHub query to filter out the pull requests with failing jobs and a Prow tool [commenter](https://github.com/kubernetes/test-infra/tree/master/robots/commenter) to comment on those pull requests. The same query is applied to all GitHub repos and thus it does not recognize any criteria for Prow's auto-merging tool, [Tide](https://github.com/kubernetes/test-infra/tree/master/prow/cmd/tide).
{{< /alert >}}

## How Do We Set up Retester?
Retester completely reuses [`tide`](https://github.com/kubernetes/test-infra/blob/master/prow/cmd/tide/README.md) 
configuration, whatever onboards to Tide, gets onboarded to retester too.
Retester is aware of Prow and the concept of optional and required jobs. It only triggers retests on PRs 
where at least one required Prow job is failing.

We can enable the retester on a repository or for the entire organization in [its configuration file](https://github.com/openshift/release/blob/master/core-services/retester/_config.yaml) and exclude it from [the old retester](https://github.com/openshift/release/blob/05dd9a1ab5881e55165a0cc0f40d5513e2e2fd11/ci-operator/jobs/infra-periodics.yaml#L260-L300) by `-repo:<org>/<repo>` in the `query`. 

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