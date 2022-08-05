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

{{< highlight yaml >}}
  # retester-config.yaml
  retester:
    max_retests_for_sha_and_base: 9
    max_retests_for_sha: 3
    orgs:
      openshift:
        enabled: false
        repos:
          ci-tools:
            enabled: true
            max_retests_for_sha_and_base: 9
            max_retests_for_sha: 3
{{< / highlight >}}

{{< highlight yaml >}}
  spec:
    containers:
    - image: retester:latest
      name: retester
      command:
      - retester
      args:
      ...
      - --config-file=retester-config.yaml       # Enable the retester on repo openshift/ci-tools
{{< / highlight >}}

{{< highlight yaml >}}
  name: periodic-retester
  spec:
    containers:
    - args:
      - --query=is:pr state:open label:lgtm label:approved status:failure comments:<2500
        ...
        -repo:openshift/ci-tools                  # Exclude repo openshift/ci-tools
{{< / highlight >}}

### Config file
There are 3 levels of policy in the configuration file: retester (global), org, repo. If a field of policy is defined at two levels, the value at the more specific level precedes. The values in the more generic level are inherited if they are not defined in the more specific level.

```yaml
`enabled`:
  - `true`: enable retester
  - `false`: disable retester
  - not defined: use the value in the above level
`max_retests_for_sha_and_base`: the number of retesting for each sha and base
`max_retests_for_sha`: the number of retesting for each sha
When merging policies, a 0 value at `max_retests` results in inheriting the parent policy.

For attribute `enabled` these rules apply:
- In repo level `enabled: false` means disabled repo. Nothing can change that.
- In org level `enabled: true` means enabled org and all its repos. But repo itself can be disabled.
- In org level `enabled: false` means disabled org and all its repos. But repo itself can be enabled.
- In global level `enabled: true` enables every org and every repo that is not disabled at the org/repo level.
- In global level `enabled: false` disables every org and every repo that is not enabled at the org/repo level.

For attribute `max_retests` these rules apply:
- `max_retests_for_sha_and_base` and `max_retests_for_sha` must not be less than 0.
- `max_retests_for_sha` cannot be lower than `max_retests_for_sha_and_base`.

### Back-off
Retests are paused after three attempts against one base/PR HEAD combination, and the PR is explicitly held (`/hold`) after nine retests of a single PR HEAD.